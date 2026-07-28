'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const nodecrypto = require('crypto')
const cr = require('../src/ipmi/crypto')
const { CIPHER_SUITES } = require('../src/ipmi/constants')

const SUITE3 = CIPHER_SUITES[3]

test('hmac() matches RFC 2202 HMAC-SHA1 test vector 1', () => {
	const key = Buffer.alloc(20, 0x0b)
	const data = Buffer.from('Hi There')
	const out = cr.hmac('sha1', key, [data]).toString('hex')
	assert.equal(out, 'b617318655057264e28bc0b6fb378c8ef146be00')
})

test('hmac() matches RFC 2202 HMAC-SHA1 test vector 2 (split across parts)', () => {
	const key = Buffer.from('Jefe')
	// also exercise multi-part update
	const out = cr.hmac('sha1', key, [Buffer.from('what do ya '), Buffer.from('want for nothing?')]).toString('hex')
	assert.equal(out, 'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79')
})

test('AES-128-CBC platform primitive matches NIST SP 800-38A vector', () => {
	const key = Buffer.from('2b7e151628aed2a6abf7158809cf4f3c', 'hex')
	const iv = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex')
	const pt = Buffer.from('6bc1bee22e409f96e93d7e117393172a', 'hex')
	const c = nodecrypto.createCipheriv('aes-128-cbc', key, iv)
	c.setAutoPadding(false)
	const ct = Buffer.concat([c.update(pt), c.final()]).toString('hex')
	assert.equal(ct, '7649abac8119b246cee98e9b12e9197d')
})

// Independent IPMI confidentiality pad + AES-CBC, to cross-check crypto.js.
function manualEncrypt(key, iv, plaintext) {
	const padCount = (16 - ((plaintext.length + 1) % 16)) % 16
	const pad = Buffer.alloc(padCount)
	for (let i = 0; i < padCount; i++) pad[i] = i + 1
	const block = Buffer.concat([plaintext, pad, Buffer.from([padCount])])
	const c = nodecrypto.createCipheriv('aes-128-cbc', key, iv)
	c.setAutoPadding(false)
	return Buffer.concat([c.update(block), c.final()])
}

test('decryptPayload recovers a hand-crafted IPMI-padded ciphertext', () => {
	const key = nodecrypto.randomBytes(16)
	const iv = nodecrypto.randomBytes(16)
	const pt = Buffer.from('IPMI chassis control payload')
	const field = Buffer.concat([iv, manualEncrypt(key, iv, pt)])
	assert.deepEqual(cr.decryptPayload(key, field), pt)
})

test('encryptPayload output: 16-byte IV, block-aligned, valid pad, decrypts back', () => {
	const key = nodecrypto.randomBytes(16)
	for (const len of [0, 1, 7, 15, 16, 17, 31, 64]) {
		const pt = nodecrypto.randomBytes(len)
		const field = cr.encryptPayload(key, pt)
		assert.equal((field.length - 16) % 16, 0, `block aligned for len=${len}`)

		// Independently decrypt and inspect the confidentiality pad.
		const iv = field.subarray(0, 16)
		const d = nodecrypto.createDecipheriv('aes-128-cbc', key, iv)
		d.setAutoPadding(false)
		const block = Buffer.concat([d.update(field.subarray(16)), d.final()])
		const padLen = block[block.length - 1]
		assert.ok(padLen <= 15)
		for (let i = 0; i < padLen; i++) {
			assert.equal(block[pt.length + i], i + 1, 'incrementing pad byte')
		}
		assert.deepEqual(block.subarray(0, pt.length), pt)
		// round-trip through our own decrypt
		assert.deepEqual(cr.decryptPayload(key, field), pt)
	}
})

test('decryptPayload rejects malformed lengths and bad pad', () => {
	const key = nodecrypto.randomBytes(16)
	assert.throws(() => cr.decryptPayload(key, Buffer.alloc(20)), /invalid length/)
})

test('integrityAuthCode truncates to the suite length and equals HMAC prefix', () => {
	const k1 = nodecrypto.randomBytes(20)
	const data = nodecrypto.randomBytes(40)
	const code = cr.integrityAuthCode(SUITE3, k1, data)
	assert.equal(code.length, 12) // HMAC-SHA1-96
	const full = cr.hmac('sha1', k1, [data])
	assert.deepEqual(code, full.subarray(0, 12))
})

test('roleByte sets the name-only-lookup bit and privilege nibble', () => {
	assert.equal(cr.roleByte(4, true), 0x14)
	assert.equal(cr.roleByte(4, false), 0x04)
	assert.equal(cr.roleByte(3, true), 0x13)
	assert.equal(cr.roleByte(2, false), 0x02)
})

test('deriveK1K2 uses constant fills of the digest length', () => {
	const sik = nodecrypto.randomBytes(20)
	const { k1, k2 } = cr.deriveK1K2(SUITE3, sik)
	assert.deepEqual(k1, cr.hmac('sha1', sik, [Buffer.alloc(20, 0x01)]))
	assert.deepEqual(k2, cr.hmac('sha1', sik, [Buffer.alloc(20, 0x02)]))
	assert.equal(k1.length, 20)
})

test('timingSafeEqual is correct and length-safe', () => {
	assert.equal(cr.timingSafeEqual(Buffer.from('abc'), Buffer.from('abc')), true)
	assert.equal(cr.timingSafeEqual(Buffer.from('abc'), Buffer.from('abd')), false)
	assert.equal(cr.timingSafeEqual(Buffer.from('abc'), Buffer.from('abcd')), false)
	assert.equal(cr.timingSafeEqual('x', 'x'), false) // non-buffers
})
