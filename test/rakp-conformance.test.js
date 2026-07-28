'use strict'

/**
 * test/rakp-conformance.test.js
 *
 * Machine-checked conformance of the RAKP key/auth derivations against the
 * IPMI v2.0 spec (rev 1.1) field orders, cross-referenced with the ipmitool
 * `lanplus` reference implementation. Each test rebuilds the exact HMAC input
 * byte-for-byte from the spec and asserts crypto.js produces the same digest.
 *
 * All multi-byte session IDs are little-endian on the wire (IPMI §13.6).
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const nodecrypto = require('crypto')
const cr = require('../src/ipmi/crypto')
const { CIPHER_SUITES } = require('../src/ipmi/constants')

const SUITE3 = CIPHER_SUITES[3]

function le32(n) {
	const b = Buffer.alloc(4)
	b.writeUInt32LE(n >>> 0, 0)
	return b
}

// A fixed, fully-specified handshake context (deterministic, no randomness).
function ctx() {
	return {
		password: Buffer.from('Px010031098252'),
		kg: null,
		consoleSessionId: 0xa0a1a2a3,
		bmcSessionId: 0x10000011,
		consoleRandom: Buffer.from('00112233445566778899aabbccddeeff', 'hex'), // Rm
		bmcRandom: Buffer.from('ffeeddccbbaa99887766554433221100', 'hex'), // Rc
		bmcGuid: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
		roleByte: 0x14, // ADMINISTRATOR + name-only lookup
		username: Buffer.from('ADMIN'),
	}
}

test('RAKP2 auth code = HMAC_pw(SIDc || SIDm || Rm || Rc || GUID || Role || ULen || UName) [§13.28]', () => {
	const c = ctx()
	const expected = nodecrypto
		.createHmac('sha1', c.password)
		.update(le32(c.consoleSessionId)) // remote console session ID
		.update(le32(c.bmcSessionId)) // managed system session ID
		.update(c.consoleRandom) // Rm
		.update(c.bmcRandom) // Rc
		.update(c.bmcGuid) // managed system GUID
		.update(Buffer.from([c.roleByte]))
		.update(Buffer.from([c.username.length]))
		.update(c.username)
		.digest()
	assert.deepEqual(cr.rakp2AuthCode(SUITE3, c), expected)
})

test('Session Integrity Key = HMAC_pw(Rm || Rc || Role || ULen || UName) [§13.31]', () => {
	const c = ctx()
	const expected = nodecrypto
		.createHmac('sha1', c.password)
		.update(c.consoleRandom)
		.update(c.bmcRandom)
		.update(Buffer.from([c.roleByte]))
		.update(Buffer.from([c.username.length]))
		.update(c.username)
		.digest()
	assert.deepEqual(cr.deriveSik(SUITE3, c), expected)
})

test('SIK uses Kg as the key when a BMC key is configured [§13.31]', () => {
	const c = ctx()
	c.kg = Buffer.from('a-bmc-key')
	const expected = nodecrypto
		.createHmac('sha1', c.kg)
		.update(c.consoleRandom)
		.update(c.bmcRandom)
		.update(Buffer.from([c.roleByte]))
		.update(Buffer.from([c.username.length]))
		.update(c.username)
		.digest()
	assert.deepEqual(cr.deriveSik(SUITE3, c), expected)
})

test('RAKP3 auth code = HMAC_pw(Rc || SIDc || Role || ULen || UName) [§13.28]', () => {
	const c = ctx()
	const expected = nodecrypto
		.createHmac('sha1', c.password)
		.update(c.bmcRandom) // Rc (managed system random)
		.update(le32(c.consoleSessionId)) // remote console session ID
		.update(Buffer.from([c.roleByte]))
		.update(Buffer.from([c.username.length]))
		.update(c.username)
		.digest()
	assert.deepEqual(cr.rakp3AuthCode(SUITE3, c), expected)
})

test('RAKP4 ICV = trunc12( HMAC_SIK(Rm || SIDm || GUID) ) [§13.28]', () => {
	const c = ctx()
	const sik = cr.deriveSik(SUITE3, c)
	const expected = nodecrypto
		.createHmac('sha1', sik)
		.update(c.consoleRandom) // Rm
		.update(le32(c.bmcSessionId)) // managed system session ID
		.update(c.bmcGuid)
		.digest()
		.subarray(0, 12)
	assert.deepEqual(cr.rakp4IntegrityCode(SUITE3, sik, c), expected)
})

test('K1/K2 use constant fills 0x01/0x02 of digest length [§13.32]', () => {
	const sik = nodecrypto.randomBytes(20)
	const { k1, k2 } = cr.deriveK1K2(SUITE3, sik)
	assert.deepEqual(k1, nodecrypto.createHmac('sha1', sik).update(Buffer.alloc(20, 0x01)).digest())
	assert.deepEqual(k2, nodecrypto.createHmac('sha1', sik).update(Buffer.alloc(20, 0x02)).digest())
})

test('suite 17 (SHA256) produces 32-byte auth codes and 16-byte truncated ICV', () => {
	const c = ctx()
	const s17 = CIPHER_SUITES[17]
	assert.equal(cr.rakp2AuthCode(s17, c).length, 32)
	const sik = cr.deriveSik(s17, c)
	assert.equal(cr.rakp4IntegrityCode(s17, sik, c).length, 16) // HMAC-SHA256-128
})
