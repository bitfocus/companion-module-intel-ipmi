'use strict'

/**
 * src/ipmi/protocol.js
 *
 * Wire (de)serialization for RMCP / RMCP+ packets. No sockets here — these are
 * pure Buffer in / Buffer out helpers so they can be unit tested at the byte
 * level. Crypto (integrity + confidentiality) lives in crypto.js.
 *
 * Multi-byte session fields are little-endian (IPMI v2.0 §13.6).
 */

const C = require('./constants')
const { encryptPayload, decryptPayload, integrityAuthCode, timingSafeEqual, le32 } = require('./crypto')

// ---- checksums (2's complement, IPMI §5.2) -----------------------------
function checksum(bytes) {
	let sum = 0
	for (const b of bytes) sum = (sum + b) & 0xff
	return (0x100 - sum) & 0xff
}

// ---- RMCP / ASF ---------------------------------------------------------
function buildRmcpHeader(cls) {
	return Buffer.from([C.RMCP_VERSION, 0x00, C.RMCP_SEQ_NO_ACK, cls])
}

function buildAsfPing(tag = 0) {
	const asf = Buffer.alloc(8)
	asf.writeUInt32BE(C.ASF_IANA, 0)
	asf[4] = C.ASF_PRESENCE_PING
	asf[5] = tag & 0xff
	asf[6] = 0x00
	asf[7] = 0x00 // data length
	return Buffer.concat([buildRmcpHeader(C.RMCP_CLASS_ASF), asf])
}

/** @returns {{tag:number}|null} */
function parseAsfPong(buf) {
	if (buf.length < 12) return null
	if (buf[3] !== C.RMCP_CLASS_ASF) return null
	const iana = buf.readUInt32BE(4)
	const type = buf[8]
	if (iana !== C.ASF_IANA || type !== C.ASF_PRESENCE_PONG) return null
	return { tag: buf[9] }
}

// ---- RMCP+ session envelope --------------------------------------------
/**
 * Wrap a payload in a full RMCP+ datagram. Applies confidentiality then
 * integrity when requested (IPMI §13.27-13.29).
 */
function buildSessionPacket({
	payloadType,
	encrypted = false,
	authenticated = false,
	sessionId = 0,
	sessionSeq = 0,
	payload,
	suite,
	k1,
	aesKey,
}) {
	const payloadField = encrypted ? encryptPayload(aesKey, payload) : payload
	const ptByte =
		(payloadType & 0x3f) | (encrypted ? C.PAYLOAD_ENCRYPTED : 0) | (authenticated ? C.PAYLOAD_AUTHENTICATED : 0)

	const lenBuf = Buffer.alloc(2)
	lenBuf.writeUInt16LE(payloadField.length, 0)
	const header = Buffer.concat([Buffer.from([C.AUTH_TYPE_RMCPP, ptByte]), le32(sessionId), le32(sessionSeq), lenBuf])

	let sessionPart = Buffer.concat([header, payloadField])

	if (authenticated) {
		// Pad so [AuthType .. NextHeader] is a multiple of 4 bytes.
		const need = (4 - ((sessionPart.length + 2) % 4)) % 4
		const pad = Buffer.alloc(need, 0xff)
		const authInput = Buffer.concat([sessionPart, pad, Buffer.from([need, 0x07])]) // padLen, nextHeader=0x07
		const authCode = integrityAuthCode(suite, k1, authInput)
		sessionPart = Buffer.concat([authInput, authCode])
	}

	return Buffer.concat([buildRmcpHeader(C.RMCP_CLASS_IPMI), sessionPart])
}

/**
 * Parse a full RMCP+ datagram. Verifies integrity (when authenticated) and
 * decrypts (when encrypted).
 * @returns {{payloadType:number, encrypted:boolean, authenticated:boolean, sessionId:number, sessionSeq:number, payload:Buffer}}
 */
function parseSessionPacket(buf, { suite, k1, aesKey, verifyIntegrity = true } = {}) {
	if (buf.length < 16) throw new Error('Datagram too short for an RMCP+ packet')
	if (buf[3] !== C.RMCP_CLASS_IPMI) throw new Error('Not an IPMI-class RMCP packet')
	let o = 4
	const authType = buf[o++]
	if (authType !== C.AUTH_TYPE_RMCPP) throw new Error(`Unexpected auth type 0x${authType.toString(16)} (not RMCP+)`)
	const ptByte = buf[o++]
	const encrypted = !!(ptByte & C.PAYLOAD_ENCRYPTED)
	const authenticated = !!(ptByte & C.PAYLOAD_AUTHENTICATED)
	const payloadType = ptByte & 0x3f
	const sessionId = buf.readUInt32LE(o)
	o += 4
	const sessionSeq = buf.readUInt32LE(o)
	o += 4
	const payloadLen = buf.readUInt16LE(o)
	o += 2
	const payloadField = buf.subarray(o, o + payloadLen)

	if (authenticated) {
		const trunc = suite.integrityTrunc
		if (buf.length < 4 + 12 + payloadLen + trunc) throw new Error('Authenticated packet shorter than declared')
		const authCode = buf.subarray(buf.length - trunc)
		const authInput = buf.subarray(4, buf.length - trunc) // AuthType .. NextHeader
		const expected = integrityAuthCode(suite, k1, authInput)
		if (verifyIntegrity && !timingSafeEqual(expected, Buffer.from(authCode))) {
			throw new Error('Integrity check failed on received packet')
		}
	}

	const payload = encrypted ? decryptPayload(aesKey, Buffer.from(payloadField)) : Buffer.from(payloadField)
	return { payloadType, encrypted, authenticated, sessionId, sessionSeq, payload }
}

// ---- RMCP+ Open Session -------------------------------------------------
function buildOpenSessionRequest({ tag = 0, privilege = 0, consoleSessionId, suite }) {
	const head = Buffer.from([tag & 0xff, privilege & 0x0f, 0x00, 0x00])
	const sid = le32(consoleSessionId)
	const authPayload = Buffer.from([0x00, 0, 0, 0x08, suite.auth, 0, 0, 0])
	const intPayload = Buffer.from([0x01, 0, 0, 0x08, suite.integrity, 0, 0, 0])
	const confPayload = Buffer.from([0x02, 0, 0, 0x08, suite.conf, 0, 0, 0])
	const payload = Buffer.concat([head, sid, authPayload, intPayload, confPayload])
	return buildSessionPacket({ payloadType: C.PAYLOAD_TYPE.OPEN_SESSION_REQUEST, payload })
}

function parseOpenSessionResponse(payload) {
	const tag = payload[0]
	const statusCode = payload[1]
	const out = { tag, statusCode }
	if (payload.length >= 16) {
		out.maxPriv = payload[2]
		out.consoleSessionId = payload.readUInt32LE(4)
		out.bmcSessionId = payload.readUInt32LE(8)
	}
	return out
}

// ---- RAKP 1..4 ----------------------------------------------------------
function buildRakp1({ tag = 0, bmcSessionId, consoleRandom, roleByte, username }) {
	const head = Buffer.from([tag & 0xff, 0, 0, 0])
	const sid = le32(bmcSessionId)
	const tail = Buffer.concat([Buffer.from([roleByte & 0xff, 0, 0, username.length]), username])
	const payload = Buffer.concat([head, sid, consoleRandom, tail])
	return buildSessionPacket({ payloadType: C.PAYLOAD_TYPE.RAKP1, payload })
}

function parseRakp2(payload, authCodeLen) {
	const tag = payload[0]
	const statusCode = payload[1]
	const out = { tag, statusCode }
	if (payload.length >= 40) {
		out.consoleSessionId = payload.readUInt32LE(4)
		out.bmcRandom = Buffer.from(payload.subarray(8, 24))
		out.bmcGuid = Buffer.from(payload.subarray(24, 40))
		out.authCode = Buffer.from(payload.subarray(40, 40 + authCodeLen))
	}
	return out
}

function buildRakp3({ tag = 0, statusCode = 0, bmcSessionId, authCode }) {
	const head = Buffer.from([tag & 0xff, statusCode & 0xff, 0, 0])
	const sid = le32(bmcSessionId)
	const payload = Buffer.concat([head, sid, authCode])
	return buildSessionPacket({ payloadType: C.PAYLOAD_TYPE.RAKP3, payload })
}

function parseRakp4(payload, icvLen) {
	const tag = payload[0]
	const statusCode = payload[1]
	const out = { tag, statusCode }
	if (payload.length >= 8) {
		out.consoleSessionId = payload.readUInt32LE(4)
		out.icv = Buffer.from(payload.subarray(8, 8 + icvLen))
	}
	return out
}

// ---- LAN / IPMI message (payload type 0x00) ----------------------------
function buildLanRequest({
	netFn,
	cmd,
	data = Buffer.alloc(0),
	rqSeq = 0,
	rqLun = 0,
	rsLun = 0,
	rqAddr = C.REMOTE_SWID,
	rsAddr = C.BMC_RESPONDER_ADDR,
}) {
	const netFnLun = (((netFn & 0x3f) << 2) | (rsLun & 0x3)) & 0xff
	const cs1 = checksum([rsAddr, netFnLun])
	const seqLun = (((rqSeq & 0x3f) << 2) | (rqLun & 0x3)) & 0xff
	const body = Buffer.concat([Buffer.from([rqAddr, seqLun, cmd]), Buffer.from(data)])
	const cs2 = checksum(body)
	return Buffer.concat([Buffer.from([rsAddr, netFnLun, cs1]), body, Buffer.from([cs2])])
}

function parseLanResponse(buf) {
	if (buf.length < 8) throw new Error('IPMI response message too short')
	const cs1 = checksum([buf[0], buf[1]])
	if (cs1 !== buf[2]) throw new Error('IPMI response header checksum mismatch')
	const body = buf.subarray(3, buf.length - 1)
	const cs2 = checksum(body)
	if (cs2 !== buf[buf.length - 1]) throw new Error('IPMI response data checksum mismatch')
	const netFn = buf[1] >> 2
	const cmd = buf[5]
	const completionCode = buf[6]
	const data = Buffer.from(buf.subarray(7, buf.length - 1))
	return { netFn, cmd, completionCode, data }
}

module.exports = {
	checksum,
	buildRmcpHeader,
	buildAsfPing,
	parseAsfPong,
	buildSessionPacket,
	parseSessionPacket,
	buildOpenSessionRequest,
	parseOpenSessionResponse,
	buildRakp1,
	parseRakp2,
	buildRakp3,
	parseRakp4,
	buildLanRequest,
	parseLanResponse,
}
