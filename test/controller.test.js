'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { IpmiController, POWER } = require('../src/ipmi/controller')
const { RmcpPlusSession } = require('../src/ipmi/rmcp')

test('_assertChassisOk passes a zero completion code', () => {
	const c = new IpmiController(() => ({}))
	assert.doesNotThrow(() => c._assertChassisOk({ completionCode: 0 }, POWER.UP))
})

test('_assertChassisOk gives a tailored message for soft-shutdown 0xCF', () => {
	const c = new IpmiController(() => ({}))
	try {
		c._assertChassisOk({ completionCode: 0xcf }, POWER.SOFT)
		assert.fail('should throw')
	} catch (e) {
		assert.equal(e.code, 'ESOFTUNSUP')
		assert.match(e.message, /soft-shutdown|0xCF/i)
		assert.match(e.message, /Power Cycle|Hard Reset/i)
	}
})

test('_assertChassisOk maps generic completion codes to readable text', () => {
	const c = new IpmiController(() => ({}))
	try {
		c._assertChassisOk({ completionCode: 0xd4 }, POWER.UP)
		assert.fail('should throw')
	} catch (e) {
		assert.equal(e.code, 'ECHASSIS')
		assert.match(e.message, /privilege/i)
	}
})

test('_run serialises operations in submission order', async () => {
	const c = new IpmiController(() => ({}))
	const order = []
	const mk = (id, ms) => () => new Promise((r) => setTimeout(() => (order.push(id), r(id)), ms))
	const p1 = c._run(mk('a', 30))
	const p2 = c._run(mk('b', 1))
	const p3 = c._run(mk('c', 1))
	await Promise.all([p1, p2, p3])
	assert.deepEqual(order, ['a', 'b', 'c']) // b/c wait for a despite being faster
})

test('_run keeps serialising after a rejection', async () => {
	const c = new IpmiController(() => ({}))
	const order = []
	const p1 = c._run(() => Promise.reject(new Error('boom')))
	const p2 = c._run(() => {
		order.push('after')
		return Promise.resolve('ok')
	})
	await assert.rejects(() => p1, /boom/)
	assert.equal(await p2, 'ok')
	assert.deepEqual(order, ['after'])
})

test('ping returns false with no host configured', async () => {
	const c = new IpmiController(() => ({}))
	assert.equal(await c.ping(), false)
})

test('chassis rejects with ENOHOST when no host configured', async () => {
	const c = new IpmiController(() => ({}))
	await assert.rejects(() => c.chassis(POWER.UP), /No BMC host/)
})

test('RmcpPlusSession rejects an unsupported cipher suite (ECIPHER) [test plan §10.5]', () => {
	assert.throws(
		() => new RmcpPlusSession({ host: '127.0.0.1', cipherSuite: 99 }),
		(e) => e.code === 'ECIPHER',
	)
})

test('RmcpPlusSession rejects an over-long username (EUSER)', () => {
	assert.throws(
		() => new RmcpPlusSession({ host: '127.0.0.1', username: 'X'.repeat(17), cipherSuite: 3 }),
		(e) => e.code === 'EUSER',
	)
})
