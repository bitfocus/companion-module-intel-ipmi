'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { derivePixeraPassword, inferLan1FromIpmi } = require('../src/ipmi/password')

test('derivePixeraPassword matches the official documentation example', () => {
	// Official: LAN1 10.31.98.252 -> Px010031098252
	assert.equal(derivePixeraPassword('10.31.98.252'), 'Px010031098252')
})

test('derivePixeraPassword zero-pads every octet to 3 digits', () => {
	assert.equal(derivePixeraPassword('10.31.5.7'), 'Px010031005007')
	assert.equal(derivePixeraPassword('192.168.1.100'), 'Px192168001100')
	assert.equal(derivePixeraPassword('0.0.0.0'), 'Px000000000000')
	assert.equal(derivePixeraPassword('255.255.255.255'), 'Px255255255255')
})

test('derivePixeraPassword trims surrounding whitespace', () => {
	assert.equal(derivePixeraPassword('  10.31.98.252  '), 'Px010031098252')
})

test('derivePixeraPassword rejects malformed input', () => {
	assert.throws(() => derivePixeraPassword('10.31.98'), /Invalid IPv4 address/)
	assert.throws(() => derivePixeraPassword('10.31.98.252.1'), /Invalid IPv4 address/)
	assert.throws(() => derivePixeraPassword('10.31.98.256'), /Invalid IPv4 address/)
	assert.throws(() => derivePixeraPassword('a.b.c.d'), /Invalid IPv4 address/)
	assert.throws(() => derivePixeraPassword(''), /Invalid IPv4 address/)
	assert.throws(() => derivePixeraPassword(null), /Invalid IPv4 address/)
})

test('inferLan1FromIpmi applies the documented +10 second-octet relation', () => {
	// IPMI 10.41.98.252 -> LAN1 10.31.98.252
	assert.equal(inferLan1FromIpmi('10.41.98.252'), '10.31.98.252')
})

test('inferLan1FromIpmi returns null when the relation does not hold', () => {
	assert.equal(inferLan1FromIpmi('192.168.1.50'), null)
	assert.equal(inferLan1FromIpmi('10.31.98.252'), null)
	assert.equal(inferLan1FromIpmi('not-an-ip'), null)
})

test('inferLan1FromIpmi composes with derivePixeraPassword', () => {
	const lan1 = inferLan1FromIpmi('10.41.98.252')
	assert.equal(derivePixeraPassword(lan1), 'Px010031098252')
})
