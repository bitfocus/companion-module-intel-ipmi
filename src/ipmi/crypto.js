'use strict'

/**
 * src/ipmi/crypto.js
 *
 * Cryptography for IPMI v2.0 / RMCP+ sessions. Pure Node `crypto`, no external
 * dependencies. Field ordering follows the IPMI v2.0 spec (sections 13.20,
 * 13.28-13.33) and matches the well-tested ipmitool `lanplus` reference.
 *
 * Cipher suite 3 (Pixera default):
 *   - Authentication: RAKP-HMAC-SHA1
 *   - Integrity:      HMAC-SHA1-96
 *   - Confidentiality: AES-CBC-128
 *
 * The functions are parameterised by a `suite` descriptor (see constants.js
 * CIPHER_SUITES), so suite 17 (SHA256) works through the same code paths.
 */

const crypto = require('crypto')

const le32 = (n) => {
	const b = Buffer.alloc(4)
	b.writeUInt32LE(n >>> 0, 0)
	return b
}

/** HMAC keyed by `key` over the concatenation of `parts`, full digest. */
function hmac(hashAlg, key, parts) {
	const h = crypto.createHmac(hashAlg, key)
	for (const p of parts) h.update(p)
	return h.digest()
}

/** N cryptographically random bytes. */
function randomBytes(n) {
	return crypto.randomBytes(n)
}

/**
 * Build the privilege/role byte sent in RAKP message 1.
 * bits[3:0] = requested maximum privilege level, bit[4] = name-only lookup.
 */
function roleByte(privilege, nameOnlyLookup = true) {
	return ((nameOnlyLookup ? 0x10 : 0x00) | (privilege & 0x0f)) & 0xff
}

/**
 * Key Exchange Authentication Code carried in RAKP Message 2 (BMC -> console).
 * The console recomputes it with the user password (Kuid) and compares.
 *   HMAC_Kuid( SIDc || SIDm || Rc || Rm || GUID || ROLE || ULEN || UNAME )
 * where SIDc = console session ID, SIDm = BMC (managed system) session ID.
 */
function rakp2AuthCode(suite, ctx) {
	return hmac(suite.hash, ctx.password, [
		le32(ctx.consoleSessionId),
		le32(ctx.bmcSessionId),
		ctx.consoleRandom,
		ctx.bmcRandom,
		ctx.bmcGuid,
		Buffer.from([ctx.roleByte]),
		Buffer.from([ctx.username.length]),
		ctx.username,
	])
}

/**
 * Session Integrity Key. Keyed with the BMC key Kg when configured, otherwise
 * with the user password (Kuid).
 *   SIK = HMAC_key( Rc || Rm || ROLE || ULEN || UNAME )
 */
function deriveSik(suite, ctx) {
	const key = ctx.kg && ctx.kg.length ? ctx.kg : ctx.password
	return hmac(suite.hash, key, [
		ctx.consoleRandom,
		ctx.bmcRandom,
		Buffer.from([ctx.roleByte]),
		Buffer.from([ctx.username.length]),
		ctx.username,
	])
}

/**
 * Authentication code the console puts in RAKP Message 3 (console -> BMC).
 *   HMAC_Kuid( Rm || SIDm || ROLE || ULEN || UNAME )
 * where Rm = BMC random number, SIDm = console session ID.
 */
function rakp3AuthCode(suite, ctx) {
	return hmac(suite.hash, ctx.password, [
		ctx.bmcRandom,
		le32(ctx.consoleSessionId),
		Buffer.from([ctx.roleByte]),
		Buffer.from([ctx.username.length]),
		ctx.username,
	])
}

/**
 * Integrity check value the BMC returns in RAKP Message 4. Verified by the
 * console using the freshly derived SIK.
 *   trunc( HMAC_SIK( Rc || SIDc || GUID ) )
 * where Rc = console random number, SIDc = BMC session ID.
 */
function rakp4IntegrityCode(suite, sik, ctx) {
	const full = hmac(suite.hash, sik, [ctx.consoleRandom, le32(ctx.bmcSessionId), ctx.bmcGuid])
	return full.subarray(0, suite.integrityTrunc)
}

/**
 * Derive the additional keying material from the SIK.
 *   K1 = HMAC_SIK( 0x01 repeated )  -> integrity key
 *   K2 = HMAC_SIK( 0x02 repeated )  -> first 16 bytes are the AES-128 key
 * The constant length equals the hash output length (20 for SHA1, 32 for SHA256).
 */
function deriveK1K2(suite, sik) {
	const dlen = sik.length
	const c1 = Buffer.alloc(dlen, 0x01)
	const c2 = Buffer.alloc(dlen, 0x02)
	return {
		k1: hmac(suite.hash, sik, [c1]),
		k2: hmac(suite.hash, sik, [c2]),
	}
}

/**
 * Per-packet integrity auth code: trunc( HMAC_K1( data ) ).
 * `data` spans from the AuthType/Format byte through the Next Header byte.
 */
function integrityAuthCode(suite, k1, data) {
	return hmac(suite.hash, k1, [data]).subarray(0, suite.integrityTrunc)
}

/**
 * AES-CBC-128 confidentiality encrypt (IPMI 2.0 §13.29).
 * Pads with the incrementing-byte confidentiality pad + pad-length byte so the
 * cipher input is a multiple of 16, generates a random 16-byte IV, and returns
 * IV || ciphertext (the IV is transmitted in clear ahead of the ciphertext).
 * @returns {Buffer}
 */
function encryptPayload(aesKey, plaintext) {
	const padCount = (16 - ((plaintext.length + 1) % 16)) % 16
	const pad = Buffer.alloc(padCount)
	for (let i = 0; i < padCount; i++) pad[i] = i + 1 // 0x01, 0x02, ...
	const block = Buffer.concat([plaintext, pad, Buffer.from([padCount])])
	const iv = randomBytes(16)
	const cipher = crypto.createCipheriv('aes-128-cbc', aesKey.subarray(0, 16), iv)
	cipher.setAutoPadding(false)
	const ct = Buffer.concat([cipher.update(block), cipher.final()])
	return Buffer.concat([iv, ct])
}

/**
 * AES-CBC-128 confidentiality decrypt. Input is IV(16) || ciphertext.
 * Strips the confidentiality pad using the trailing pad-length byte.
 * @returns {Buffer} the recovered plaintext (IPMI message)
 */
function decryptPayload(aesKey, field) {
	if (field.length < 32 || (field.length - 16) % 16 !== 0) {
		throw new Error('Encrypted payload has invalid length')
	}
	const iv = field.subarray(0, 16)
	const ct = field.subarray(16)
	const decipher = crypto.createDecipheriv('aes-128-cbc', aesKey.subarray(0, 16), iv)
	decipher.setAutoPadding(false)
	const block = Buffer.concat([decipher.update(ct), decipher.final()])
	const padCount = block[block.length - 1]
	if (padCount > 15 || padCount > block.length - 1) {
		throw new Error('Encrypted payload has invalid confidentiality pad')
	}
	return block.subarray(0, block.length - 1 - padCount)
}

/** Constant-time comparison of two buffers. */
function timingSafeEqual(a, b) {
	if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || a.length !== b.length) return false
	return crypto.timingSafeEqual(a, b)
}

module.exports = {
	hmac,
	randomBytes,
	roleByte,
	rakp2AuthCode,
	deriveSik,
	rakp3AuthCode,
	rakp4IntegrityCode,
	deriveK1K2,
	integrityAuthCode,
	encryptPayload,
	decryptPayload,
	timingSafeEqual,
	le32,
}
