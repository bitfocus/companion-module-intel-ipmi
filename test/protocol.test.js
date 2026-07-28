'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const nodecrypto = require('crypto')
const proto = require('../src/ipmi/protocol')
const C = require('../src/ipmi/constants')
const { CIPHER_SUITES } = require('../src/ipmi/constants')

const SUITE3 = CIPHER_SUITES[3]

test('checksum is the 2s complement of the byte sum', () => {
	assert.equal(proto.checksum([0x20, 0x18]), 0xc8) // -(0x38) & 0xff
	assert.equal((proto.checksum([0x20, 0x18]) + 0x20 + 0x18) & 0xff, 0)
})

test('buildAsfPing emits the exact RMCP/ASF presence-ping bytes', () => {
	assert.equal(proto.buildAsfPing(0x12).toString('hex'), '0600ff06000011be80120000')
})

test('parseAsfPong recognises a pong and rejects non-pongs', () => {
	const pong = Buffer.from('0600ff06000011be40050000', 'hex')
	assert.deepEqual(proto.parseAsfPong(pong), { tag: 0x05 })
	assert.equal(proto.parseAsfPong(proto.buildAsfPing(0)), null) // ping, not pong
	assert.equal(proto.parseAsfPong(Buffer.alloc(4)), null)
})

test('LAN request/response round-trips with correct framing', () => {
	const req = proto.buildLanRequest({
		netFn: C.NETFN.CHASSIS,
		cmd: C.CMD.CHASSIS_CONTROL,
		data: Buffer.from([0x01]),
		rqSeq: 5,
	})
	// rsAddr, netFnLun, cs1, rqAddr, seqLun, cmd, data, cs2
	assert.equal(req[0], C.BMC_RESPONDER_ADDR)
	assert.equal(req[1], (C.NETFN.CHASSIS << 2) & 0xff)
	assert.equal(req[3], C.REMOTE_SWID)
	assert.equal(req[5], C.CMD.CHASSIS_CONTROL)

	// Build a matching response by hand and parse it.
	const respNetFnLun = ((C.NETFN.CHASSIS | 1) << 2) & 0xff
	const body = Buffer.from([C.BMC_RESPONDER_ADDR, (5 << 2) & 0xff, C.CMD.CHASSIS_CONTROL, 0x00])
	const head = Buffer.from([C.REMOTE_SWID, respNetFnLun, proto.checksum([C.REMOTE_SWID, respNetFnLun])])
	const resp = Buffer.concat([head, body, Buffer.from([proto.checksum(body)])])
	const parsed = proto.parseLanResponse(resp)
	assert.equal(parsed.netFn, C.NETFN.CHASSIS | 1)
	assert.equal(parsed.cmd, C.CMD.CHASSIS_CONTROL)
	assert.equal(parsed.completionCode, 0)
})

test('parseLanResponse rejects a bad checksum', () => {
	const respNetFnLun = ((C.NETFN.CHASSIS | 1) << 2) & 0xff
	const head = Buffer.from([C.REMOTE_SWID, respNetFnLun, 0x00 /* wrong cs1 */])
	const body = Buffer.from([C.BMC_RESPONDER_ADDR, 0, 1, 0])
	const resp = Buffer.concat([head, body, Buffer.from([proto.checksum(body)])])
	assert.throws(() => proto.parseLanResponse(resp), /checksum mismatch/)
})

test('Open Session Request advertises cipher-suite-3 algorithms', () => {
	const pkt = proto.buildOpenSessionRequest({ tag: 9, privilege: 4, consoleSessionId: 0xa1b2c3d4, suite: SUITE3 })
	// payload begins after RMCP(4)+authtype(1)+pt(1)+sid(4)+seq(4)+len(2) = 16
	const payload = pkt.subarray(16)
	assert.equal(pkt[5] & 0x3f, C.PAYLOAD_TYPE.OPEN_SESSION_REQUEST)
	assert.equal(payload[0], 9) // tag
	assert.equal(payload[1] & 0x0f, 4) // requested privilege
	assert.equal(payload.readUInt32LE(4), 0xa1b2c3d4) // console session id, little-endian
	// after head(4)+sid(4): auth payload@8, integrity@16, confidentiality@24
	assert.equal(payload[8], 0x00) // auth payload type
	assert.equal(payload[11], 0x08) // auth payload length
	assert.equal(payload[12], C.AUTH_ALG.HMAC_SHA1)
	assert.equal(payload[16], 0x01) // integrity payload type
	assert.equal(payload[20], C.INTEGRITY_ALG.HMAC_SHA1_96)
	assert.equal(payload[24], 0x02) // confidentiality payload type
	assert.equal(payload[28], C.CONF_ALG.AES_CBC_128)
})

test('Open Session Response parses session IDs', () => {
	const body = Buffer.concat([
		Buffer.from([7, 0x00, 0x04, 0x00]),
		Buffer.from([0xd4, 0xc3, 0xb2, 0xa1]), // console sid LE
		Buffer.from([0x11, 0x00, 0x00, 0x10]), // bmc sid LE
		Buffer.alloc(24),
	])
	const out = proto.parseOpenSessionResponse(body)
	assert.equal(out.tag, 7)
	assert.equal(out.statusCode, 0)
	assert.equal(out.consoleSessionId, 0xa1b2c3d4)
	assert.equal(out.bmcSessionId, 0x10000011)
})

test('RAKP1 build / RAKP2 parse preserve all fields', () => {
	const consoleRandom = nodecrypto.randomBytes(16)
	const username = Buffer.from('ADMIN')
	const pkt = proto.buildRakp1({ tag: 3, bmcSessionId: 0x10000011, consoleRandom, roleByte: 0x14, username })
	const payload = pkt.subarray(16)
	assert.equal(pkt[5] & 0x3f, C.PAYLOAD_TYPE.RAKP1)
	assert.equal(payload.readUInt32LE(4), 0x10000011)
	assert.deepEqual(payload.subarray(8, 24), consoleRandom)
	assert.equal(payload[24], 0x14) // role byte
	assert.equal(payload[27], username.length)
	assert.deepEqual(payload.subarray(28, 28 + username.length), username)

	const bmcRandom = nodecrypto.randomBytes(16)
	const bmcGuid = nodecrypto.randomBytes(16)
	const authCode = nodecrypto.randomBytes(20)
	const rakp2Body = Buffer.concat([
		Buffer.from([3, 0, 0, 0]),
		Buffer.from([0xef, 0xbe, 0xad, 0xde]),
		bmcRandom,
		bmcGuid,
		authCode,
	])
	const r2 = proto.parseRakp2(rakp2Body, 20)
	assert.equal(r2.consoleSessionId, 0xdeadbeef)
	assert.deepEqual(r2.bmcRandom, bmcRandom)
	assert.deepEqual(r2.bmcGuid, bmcGuid)
	assert.deepEqual(r2.authCode, authCode)
})

test('session packet: authenticated+encrypted round-trips and detects tampering', () => {
	const k1 = nodecrypto.randomBytes(20)
	const aesKey = nodecrypto.randomBytes(16)
	const payload = proto.buildLanRequest({ netFn: C.NETFN.CHASSIS, cmd: 0x01, rqSeq: 1 })
	const pkt = proto.buildSessionPacket({
		payloadType: C.PAYLOAD_TYPE.IPMI,
		encrypted: true,
		authenticated: true,
		sessionId: 0x10000011,
		sessionSeq: 1,
		payload,
		suite: SUITE3,
		k1,
		aesKey,
	})
	// payload type byte carries both encrypted + authenticated bits
	assert.equal(pkt[5], C.PAYLOAD_TYPE.IPMI | C.PAYLOAD_ENCRYPTED | C.PAYLOAD_AUTHENTICATED)

	const parsed = proto.parseSessionPacket(pkt, { suite: SUITE3, k1, aesKey })
	assert.deepEqual(parsed.payload, payload)
	assert.equal(parsed.encrypted, true)
	assert.equal(parsed.authenticated, true)

	// flip a ciphertext byte -> integrity check must fail
	const tampered = Buffer.from(pkt)
	tampered[20] ^= 0xff
	assert.throws(() => proto.parseSessionPacket(tampered, { suite: SUITE3, k1, aesKey }), /Integrity check failed/)
})

test('session packet integrity range is padded to a multiple of 4', () => {
	const k1 = nodecrypto.randomBytes(20)
	const aesKey = nodecrypto.randomBytes(16)
	for (let n = 0; n < 16; n++) {
		const pkt = proto.buildSessionPacket({
			payloadType: C.PAYLOAD_TYPE.IPMI,
			encrypted: true,
			authenticated: true,
			sessionId: 1,
			sessionSeq: 1,
			payload: Buffer.alloc(n, 0xab),
			suite: SUITE3,
			k1,
			aesKey,
		})
		// integrity-protected range = everything after RMCP(4) except the 12-byte auth code
		const protectedLen = pkt.length - 4 - 12
		assert.equal(protectedLen % 4, 0, `padded for payload len ${n}`)
	}
})
