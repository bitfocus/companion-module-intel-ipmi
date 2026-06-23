'use strict'

/**
 * src/ipmi/rmcp.js
 *
 * RMCP+ session over UDP (port 623). Implements the IPMI v2.0 session bring-up:
 *   RMCP+ Open Session  ->  RAKP 1..4  ->  authenticated/encrypted commands  ->  Close Session
 *
 * Hand-written on `dgram` + `crypto` so the module is self-contained (no
 * ipmitool/ipmiutil binaries). Scope is deliberately narrow: a session plus
 * arbitrary IPMI commands; chassis-specific logic lives in chassis.js.
 */

const dgram = require('dgram')
const proto = require('./protocol')
const cr = require('./crypto')
const C = require('./constants')

const CLOSE_SESSION_CMD = 0x3c // NetFn App (0x06)

class IpmiError extends Error {
	constructor(message, code) {
		super(message)
		this.name = 'IpmiError'
		this.code = code
	}
}

class RmcpPlusSession {
	constructor(opts = {}) {
		this.host = opts.host
		this.port = opts.port || 623
		this.username = Buffer.from(opts.username != null ? String(opts.username) : '', 'utf8')
		this.password = Buffer.from(opts.password != null ? String(opts.password) : '', 'utf8')
		this.privilege = opts.privilege || C.PRIV.ADMINISTRATOR
		this.cipherSuite = opts.cipherSuite != null ? opts.cipherSuite : 3
		this.kg = opts.kg ? Buffer.from(opts.kg) : null
		this.nameOnlyLookup = opts.nameOnlyLookup !== false
		this.timeoutMs = opts.timeoutMs || 2000
		this.retries = opts.retries != null ? opts.retries : 2
		this.logger = typeof opts.logger === 'function' ? opts.logger : () => {}
		this.udpType = opts.udpType || 'udp4'

		this.suite = C.CIPHER_SUITES[this.cipherSuite]
		if (!this.suite) throw new IpmiError(`Unsupported cipher suite ${this.cipherSuite}`, 'ECIPHER')
		if (this.username.length > 16) throw new IpmiError('IPMI username must be <= 16 bytes', 'EUSER')

		this.socket = null
		this.active = false
		this._waiter = null
		this._rqSeq = 0
		this._sessionSeq = 1
		this._tag = 0
	}

	_nextTag() {
		this._tag = (this._tag + 1) & 0xff
		return this._tag
	}

	_bind() {
		if (this.socket) return
		this.socket = dgram.createSocket(this.udpType)
		this.socket.on('message', (msg) => {
			const w = this._waiter
			if (w) w.resolve(Buffer.from(msg))
		})
		this.socket.on('error', (err) => {
			const w = this._waiter
			if (w) w.reject(new IpmiError(`UDP socket error: ${err.message}`, 'ESOCKET'))
		})
	}

	/** Send one datagram and await the next reply, retransmitting on timeout. */
	_transceive(packet) {
		return new Promise((resolve, reject) => {
			let attempts = 0
			const finish = (cb) => {
				if (this._waiter) {
					clearTimeout(this._waiter.timer)
					this._waiter = null
				}
				cb()
			}
			const send = () => {
				attempts++
				this.socket.send(packet, this.port, this.host, (err) => {
					if (err) finish(() => reject(new IpmiError(`UDP send failed: ${err.message}`, 'ESEND')))
				})
				this._waiter.timer = setTimeout(() => {
					if (attempts > this.retries) {
						finish(() =>
							reject(
								new IpmiError(
									'Timeout waiting for BMC response (check IP/route/firewall and that IPMI-over-LAN is enabled)',
									'ETIMEOUT',
								),
							),
						)
					} else {
						send()
					}
				}, this.timeoutMs)
			}
			this._waiter = {
				resolve: (m) => finish(() => resolve(m)),
				reject: (e) => finish(() => reject(e)),
			}
			send()
		})
	}

	/** RMCP presence ping -> pong. Resolves true if the BMC answers. */
	async ping() {
		this._bind()
		const tag = this._nextTag()
		try {
			const reply = await this._transceive(proto.buildAsfPing(tag))
			return proto.parseAsfPong(reply) != null
		} catch {
			return false
		}
	}

	/** Bring up an authenticated session (Open Session + RAKP 1..4). */
	async open() {
		this._bind()
		const hasCrypto = !!this.suite.hash

		// Console session ID (non-zero).
		let consoleSessionId = cr.randomBytes(4).readUInt32LE(0)
		if (consoleSessionId === 0) consoleSessionId = 0xa5a5a5a5
		this.consoleSessionId = consoleSessionId

		// --- RMCP+ Open Session ---
		const openTag = this._nextTag()
		const openReq = proto.buildOpenSessionRequest({
			tag: openTag,
			privilege: this.privilege,
			consoleSessionId,
			suite: this.suite,
		})
		const openRespRaw = await this._transceive(openReq)
		const openParsed = proto.parseSessionPacket(openRespRaw, { suite: this.suite })
		if (openParsed.payloadType !== C.PAYLOAD_TYPE.OPEN_SESSION_RESPONSE) {
			throw new IpmiError('Unexpected reply to Open Session Request', 'EPROTO')
		}
		const open = proto.parseOpenSessionResponse(openParsed.payload)
		if (open.statusCode !== 0) {
			throw new IpmiError(`Open Session rejected: ${C.RMCPP_STATUS[open.statusCode] || 'unknown'}`, 'EOPENSESSION')
		}
		this.bmcSessionId = open.bmcSessionId
		this.logger('debug', `Open Session OK (BMC session 0x${this.bmcSessionId.toString(16)})`)

		// --- RAKP 1 -> 2 ---
		const roleByte = cr.roleByte(this.privilege, this.nameOnlyLookup)
		this.roleByte = roleByte
		const consoleRandom = cr.randomBytes(16)
		const rakp1 = proto.buildRakp1({
			tag: this._nextTag(),
			bmcSessionId: this.bmcSessionId,
			consoleRandom,
			roleByte,
			username: this.username,
		})
		const rakp2Raw = await this._transceive(rakp1)
		const rakp2Parsed = proto.parseSessionPacket(rakp2Raw, { suite: this.suite })
		const authCodeLen = hasCrypto ? cr.hmac(this.suite.hash, Buffer.alloc(1), [Buffer.alloc(0)]).length : 0
		const rakp2 = proto.parseRakp2(rakp2Parsed.payload, authCodeLen)
		if (rakp2.statusCode !== 0) {
			throw new IpmiError(`RAKP2 rejected: ${C.RMCPP_STATUS[rakp2.statusCode] || 'unknown'}`, 'ERAKP2')
		}

		const ctx = {
			password: this.password,
			kg: this.kg,
			consoleSessionId,
			bmcSessionId: this.bmcSessionId,
			consoleRandom,
			bmcRandom: rakp2.bmcRandom,
			bmcGuid: rakp2.bmcGuid,
			roleByte,
			username: this.username,
		}

		if (hasCrypto) {
			const expected = cr.rakp2AuthCode(this.suite, ctx)
			if (!cr.timingSafeEqual(expected, rakp2.authCode)) {
				throw new IpmiError('RAKP2 authentication failed — wrong username or password', 'EAUTH')
			}
		}
		this.logger('debug', 'RAKP 1-2 OK')

		// --- derive keys ---
		if (hasCrypto) {
			this.sik = cr.deriveSik(this.suite, ctx)
			const { k1, k2 } = cr.deriveK1K2(this.suite, this.sik)
			this.k1 = k1
			this.k2 = k2
			this.aesKey = this.suite.aes ? k2.subarray(0, 16) : null
		}

		// --- RAKP 3 -> 4 ---
		const rakp3AuthCode = hasCrypto ? cr.rakp3AuthCode(this.suite, ctx) : Buffer.alloc(0)
		const rakp3 = proto.buildRakp3({
			tag: this._nextTag(),
			bmcSessionId: this.bmcSessionId,
			authCode: rakp3AuthCode,
		})
		const rakp4Raw = await this._transceive(rakp3)
		const rakp4Parsed = proto.parseSessionPacket(rakp4Raw, { suite: this.suite })
		const rakp4 = proto.parseRakp4(rakp4Parsed.payload, this.suite.integrityTrunc)
		if (rakp4.statusCode !== 0) {
			throw new IpmiError(`RAKP4 rejected: ${C.RMCPP_STATUS[rakp4.statusCode] || 'unknown'}`, 'ERAKP4')
		}
		if (hasCrypto) {
			const expectedIcv = cr.rakp4IntegrityCode(this.suite, this.sik, ctx)
			if (!cr.timingSafeEqual(expectedIcv, rakp4.icv)) {
				throw new IpmiError('RAKP4 integrity check failed — session key mismatch', 'EICV')
			}
		}

		this._sessionSeq = 1
		this.active = true
		this.logger('debug', 'RAKP 3-4 OK — session active')
		return this
	}

	/**
	 * Send one IPMI command inside the active session and return the parsed
	 * response. Does not throw on non-zero completion codes — the caller decides.
	 * @returns {Promise<{netFn:number, cmd:number, completionCode:number, data:Buffer}>}
	 */
	async sendIpmiCommand(netFn, cmd, data = Buffer.alloc(0)) {
		if (!this.active) throw new IpmiError('Session is not active', 'ENOSESSION')
		this._rqSeq = (this._rqSeq + 1) & 0x3f
		const lan = proto.buildLanRequest({ netFn, cmd, data: Buffer.from(data), rqSeq: this._rqSeq })
		const packet = proto.buildSessionPacket({
			payloadType: C.PAYLOAD_TYPE.IPMI,
			encrypted: !!this.suite.aes,
			authenticated: !!this.suite.hash,
			sessionId: this.bmcSessionId,
			sessionSeq: this._sessionSeq,
			payload: lan,
			suite: this.suite,
			k1: this.k1,
			aesKey: this.aesKey,
		})
		this._sessionSeq = (this._sessionSeq + 1) >>> 0
		if (this._sessionSeq === 0) this._sessionSeq = 1

		const respRaw = await this._transceive(packet)
		const parsed = proto.parseSessionPacket(respRaw, {
			suite: this.suite,
			k1: this.k1,
			aesKey: this.aesKey,
		})
		return proto.parseLanResponse(parsed.payload)
	}

	/** Best-effort Close Session, then tear down the socket. */
	async close() {
		try {
			if (this.active) {
				const sid = cr.le32(this.bmcSessionId)
				await this.sendIpmiCommand(C.NETFN.APP, CLOSE_SESSION_CMD, sid).catch(() => {})
			}
		} finally {
			this.active = false
			if (this.socket) {
				try {
					this.socket.close()
				} catch {
					/* already closed */
				}
				this.socket = null
			}
		}
	}
}

module.exports = { RmcpPlusSession, IpmiError }
