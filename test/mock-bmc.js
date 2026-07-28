'use strict'

/**
 * test/mock-bmc.js
 *
 * A minimal in-process IPMI v2.0 / RMCP+ BMC simulator over localhost UDP, used
 * to exercise the full session handshake and command flow without hardware.
 *
 * The RAKP key derivations here are written INDEPENDENTLY of src/ipmi/crypto.js
 * (raw node:crypto HMAC over fields concatenated inline), so the end-to-end
 * tests genuinely cross-check the client's field ordering against a second
 * transcription of the IPMI v2.0 spec — not just call the same function twice.
 *
 * NOTE: this validates framing, the state machine, integrity/confidentiality
 * wrapping and error handling. Correctness against real Pixera hardware must
 * still be confirmed per the project test plan (§10).
 */

const dgram = require('dgram')
const nodecrypto = require('crypto')
const proto = require('../src/ipmi/protocol')
const C = require('../src/ipmi/constants')

function le32(n) {
	const b = Buffer.alloc(4)
	b.writeUInt32LE(n >>> 0, 0)
	return b
}
function hmac(alg, key, ...parts) {
	const h = nodecrypto.createHmac(alg, key)
	for (const p of parts) h.update(p)
	return h.digest()
}
function checksum(bytes) {
	let s = 0
	for (const b of bytes) s = (s + b) & 0xff
	return (0x100 - s) & 0xff
}

class MockBmc {
	constructor(opts = {}) {
		this.username = Buffer.from(opts.username || 'ADMIN', 'utf8')
		this.password = Buffer.from(opts.password || 'Px010031098252', 'utf8')
		this.cipherSuite = opts.cipherSuite != null ? opts.cipherSuite : 3
		this.suite = C.CIPHER_SUITES[this.cipherSuite]
		this.hashLen = this.suite.hash ? hmac(this.suite.hash, Buffer.alloc(1), Buffer.alloc(0)).length : 0
		this.powerOn = opts.powerOn !== false
		this.softUnsupported = !!opts.softUnsupported
		this.guid = nodecrypto.randomBytes(16)
		this.actionsSeen = []
		this.sessions = new Map() // bmcSessionId -> session state
		this._seq = 1
	}

	start() {
		return new Promise((resolve) => {
			this.socket = dgram.createSocket('udp4')
			this.socket.on('message', (msg, rinfo) => this._onMessage(Buffer.from(msg), rinfo))
			this.socket.bind(0, '127.0.0.1', () => {
				this.port = this.socket.address().port
				resolve(this.port)
			})
		})
	}

	stop() {
		return new Promise((resolve) => {
			if (!this.socket) return resolve()
			try {
				this.socket.close(resolve)
			} catch {
				resolve()
			}
			this.socket = null
		})
	}

	_send(buf, rinfo) {
		this.socket.send(buf, rinfo.port, rinfo.address)
	}

	_onMessage(buf, rinfo) {
		// ASF presence ping?
		if (buf[3] === C.RMCP_CLASS_ASF) {
			const pong = Buffer.alloc(12)
			pong.set([C.RMCP_VERSION, 0x00, C.RMCP_SEQ_NO_ACK, C.RMCP_CLASS_ASF], 0)
			pong.writeUInt32BE(C.ASF_IANA, 4)
			pong[8] = C.ASF_PRESENCE_PONG
			pong[9] = buf[9]
			return this._send(pong, rinfo)
		}
		if (buf[3] !== C.RMCP_CLASS_IPMI) return

		const ptByte = buf[5]
		const payloadType = ptByte & 0x3f

		switch (payloadType) {
			case C.PAYLOAD_TYPE.OPEN_SESSION_REQUEST:
				return this._handleOpenSession(buf, rinfo)
			case C.PAYLOAD_TYPE.RAKP1:
				return this._handleRakp1(buf, rinfo)
			case C.PAYLOAD_TYPE.RAKP3:
				return this._handleRakp3(buf, rinfo)
			case C.PAYLOAD_TYPE.IPMI:
				return this._handleCommand(buf, rinfo)
			default:
				return
		}
	}

	_unwrapPreSession(buf) {
		// payload starts after RMCP(4)+authtype(1)+pt(1)+sid(4)+seq(4)+len(2) = 16
		const len = buf.readUInt16LE(14)
		return buf.subarray(16, 16 + len)
	}

	_handleOpenSession(buf, rinfo) {
		const payload = this._unwrapPreSession(buf)
		const tag = payload[0]
		const consoleSessionId = payload.readUInt32LE(4)
		const bmcSessionId = 0x10000000 + this.sessions.size + 1
		this.sessions.set(bmcSessionId, { consoleSessionId, bmcSessionId, outSeq: 1 })

		const head = Buffer.from([tag, 0x00, 0x04, 0x00]) // tag, status=0, maxPriv=ADMIN, reserved
		const body = Buffer.concat([
			head,
			le32(consoleSessionId),
			le32(bmcSessionId),
			Buffer.from([0x00, 0, 0, 0x08, this.suite.auth, 0, 0, 0]),
			Buffer.from([0x01, 0, 0, 0x08, this.suite.integrity, 0, 0, 0]),
			Buffer.from([0x02, 0, 0, 0x08, this.suite.conf, 0, 0, 0]),
		])
		const pkt = proto.buildSessionPacket({ payloadType: C.PAYLOAD_TYPE.OPEN_SESSION_RESPONSE, payload: body })
		this._send(pkt, rinfo)
	}

	_handleRakp1(buf, rinfo) {
		const payload = this._unwrapPreSession(buf)
		const tag = payload[0]
		const bmcSessionId = payload.readUInt32LE(4)
		const consoleRandom = Buffer.from(payload.subarray(8, 24))
		const roleByte = payload[24]
		const ulen = payload[27]
		const username = Buffer.from(payload.subarray(28, 28 + ulen))

		const sess = this.sessions.get(bmcSessionId)
		if (!sess) return
		sess.consoleRandom = consoleRandom
		sess.roleByte = roleByte
		sess.username = username
		sess.bmcRandom = nodecrypto.randomBytes(16)

		// Unknown username -> status 0x0d (unauthorized name)
		let status = 0
		if (!username.equals(this.username)) status = 0x0d

		// RAKP2 auth code = HMAC_password( SIDc || SIDm || Rc || Rm || GUID || role || ulen || uname )
		const authCode =
			status === 0 && this.suite.hash
				? hmac(
						this.suite.hash,
						this.password,
						le32(sess.consoleSessionId),
						le32(bmcSessionId),
						consoleRandom,
						sess.bmcRandom,
						this.guid,
						Buffer.from([roleByte, ulen]),
						username,
					)
				: Buffer.alloc(0)

		// Session Integrity Key + K1/K2 (used once the handshake completes).
		if (this.suite.hash) {
			sess.sik = hmac(
				this.suite.hash,
				this.password,
				consoleRandom,
				sess.bmcRandom,
				Buffer.from([roleByte, ulen]),
				username,
			)
			const dlen = sess.sik.length
			sess.k1 = hmac(this.suite.hash, sess.sik, Buffer.alloc(dlen, 0x01))
			sess.k2 = hmac(this.suite.hash, sess.sik, Buffer.alloc(dlen, 0x02))
			sess.aesKey = this.suite.aes ? sess.k2.subarray(0, 16) : null
		}

		const body = Buffer.concat([
			Buffer.from([tag, status, 0, 0]),
			le32(sess.consoleSessionId),
			sess.bmcRandom,
			this.guid,
			authCode,
		])
		const pkt = proto.buildSessionPacket({ payloadType: C.PAYLOAD_TYPE.RAKP2, payload: body })
		this._send(pkt, rinfo)
	}

	_handleRakp3(buf, rinfo) {
		const payload = this._unwrapPreSession(buf)
		const tag = payload[0]
		const bmcSessionId = payload.readUInt32LE(4)
		const sess = this.sessions.get(bmcSessionId)
		if (!sess) return
		const clientAuth = Buffer.from(payload.subarray(8, 8 + this.hashLen))

		let status = 0
		if (this.suite.hash) {
			// expected RAKP3 = HMAC_password( Rm || SIDc(console) || role || ulen || uname )
			const expected = hmac(
				this.suite.hash,
				this.password,
				sess.bmcRandom,
				le32(sess.consoleSessionId),
				Buffer.from([sess.roleByte, sess.username.length]),
				sess.username,
			)
			if (!expected.equals(clientAuth)) status = 0x0f // invalid integrity check value
		}

		// RAKP4 ICV = trunc( HMAC_SIK( Rc || SIDm(bmc) || GUID ) )
		const icv =
			status === 0 && this.suite.hash
				? hmac(this.suite.hash, sess.sik, sess.consoleRandom, le32(bmcSessionId), this.guid).subarray(
						0,
						this.suite.integrityTrunc,
					)
				: Buffer.alloc(0)
		sess.active = status === 0

		const body = Buffer.concat([Buffer.from([tag, status, 0, 0]), le32(sess.consoleSessionId), icv])
		const pkt = proto.buildSessionPacket({ payloadType: C.PAYLOAD_TYPE.RAKP4, payload: body })
		this._send(pkt, rinfo)
	}

	_findSessionBySid(sid) {
		return this.sessions.get(sid)
	}

	_handleCommand(buf, rinfo) {
		const sid = buf.readUInt32LE(6)
		const sess = this._findSessionBySid(sid)
		if (!sess || !sess.active) return
		const parsed = proto.parseSessionPacket(buf, { suite: this.suite, k1: sess.k1, aesKey: sess.aesKey })
		const req = this._parseLanRequest(parsed.payload)

		let completionCode = 0
		let data = Buffer.alloc(0)

		if (req.netFn === C.NETFN.CHASSIS && req.cmd === C.CMD.GET_CHASSIS_STATUS) {
			data = Buffer.from([this.powerOn ? 0x01 : 0x00, 0x00, 0x00])
		} else if (req.netFn === C.NETFN.CHASSIS && req.cmd === C.CMD.CHASSIS_CONTROL) {
			const action = req.data[0]
			this.actionsSeen.push(action)
			if (action === C.CHASSIS_CONTROL.SOFT && this.softUnsupported) {
				completionCode = 0xcf
			} else {
				if (action === C.CHASSIS_CONTROL.UP) this.powerOn = true
				else if (action === C.CHASSIS_CONTROL.DOWN || action === C.CHASSIS_CONTROL.SOFT) this.powerOn = false
				else if (action === C.CHASSIS_CONTROL.CYCLE || action === C.CHASSIS_CONTROL.RESET) this.powerOn = true
			}
		} else if (req.netFn === C.NETFN.APP && req.cmd === 0x3c) {
			sess.active = false // Close Session
		} else {
			completionCode = 0xc1 // invalid command
		}

		const lanResp = this._buildLanResponse({
			netFn: req.netFn,
			cmd: req.cmd,
			completionCode,
			data,
			rqSeq: req.rqSeq,
			rqAddr: req.rqAddr,
		})
		const pkt = proto.buildSessionPacket({
			payloadType: C.PAYLOAD_TYPE.IPMI,
			encrypted: !!this.suite.aes,
			authenticated: !!this.suite.hash,
			sessionId: sess.consoleSessionId,
			sessionSeq: sess.outSeq++,
			payload: lanResp,
			suite: this.suite,
			k1: sess.k1,
			aesKey: sess.aesKey,
		})
		this._send(pkt, rinfo)
	}

	_parseLanRequest(buf) {
		// [rsAddr, netFnLun, cs1, rqAddr, seqLun, cmd, data..., cs2]
		return {
			netFn: buf[1] >> 2,
			rqAddr: buf[3],
			rqSeq: buf[4] >> 2,
			cmd: buf[5],
			data: Buffer.from(buf.subarray(6, buf.length - 1)),
		}
	}

	_buildLanResponse({ netFn, cmd, completionCode, data, rqSeq, rqAddr }) {
		const rsAddr = C.BMC_RESPONDER_ADDR
		const respNetFnLun = (((netFn | 1) & 0x3f) << 2) & 0xff
		const b0 = rqAddr
		const b1 = respNetFnLun
		const cs1 = checksum([b0, b1])
		const seqLun = ((rqSeq & 0x3f) << 2) & 0xff
		const body = Buffer.concat([Buffer.from([rsAddr, seqLun, cmd, completionCode]), data])
		const cs2 = checksum(body)
		return Buffer.concat([Buffer.from([b0, b1, cs1]), body, Buffer.from([cs2])])
	}
}

module.exports = { MockBmc }
