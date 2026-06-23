'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { MockBmc } = require('./mock-bmc')
const { RmcpPlusSession } = require('../src/ipmi/rmcp')
const { IpmiController, POWER } = require('../src/ipmi/controller')
const { getChassisStatus, chassisControl } = require('../src/ipmi/chassis')

const USER = 'ADMIN'
const PASS = 'Px010031098252'

function sessionFor(bmc, overrides = {}) {
	return new RmcpPlusSession({
		host: '127.0.0.1',
		port: bmc.port,
		username: USER,
		password: PASS,
		cipherSuite: 3,
		privilege: 4,
		timeoutMs: 500,
		retries: 1,
		...overrides,
	})
}

test('e2e: full RMCP+ handshake + encrypted Get Chassis Status (power ON)', async () => {
	const bmc = new MockBmc({ username: USER, password: PASS, powerOn: true })
	await bmc.start()
	const s = sessionFor(bmc)
	try {
		await s.open()
		assert.equal(s.active, true)
		const st = await getChassisStatus(s)
		assert.equal(st.powerOn, true)
	} finally {
		await s.close()
		await bmc.stop()
	}
})

test('e2e: Chassis Control toggles power and BMC sees the action bytes', async () => {
	const bmc = new MockBmc({ username: USER, password: PASS, powerOn: false })
	await bmc.start()
	const s = sessionFor(bmc)
	try {
		await s.open()
		let resp = await chassisControl(s, POWER.UP)
		assert.equal(resp.completionCode, 0)
		assert.equal((await getChassisStatus(s)).powerOn, true)

		resp = await chassisControl(s, POWER.DOWN)
		assert.equal(resp.completionCode, 0)
		assert.equal((await getChassisStatus(s)).powerOn, false)

		assert.deepEqual(bmc.actionsSeen, [POWER.UP, POWER.DOWN])
	} finally {
		await s.close()
		await bmc.stop()
	}
})

test('e2e: soft-shutdown returns completion code 0xCF when unsupported', async () => {
	const bmc = new MockBmc({ username: USER, password: PASS, softUnsupported: true })
	await bmc.start()
	const s = sessionFor(bmc)
	try {
		await s.open()
		const resp = await chassisControl(s, POWER.SOFT)
		assert.equal(resp.completionCode, 0xcf)
	} finally {
		await s.close()
		await bmc.stop()
	}
})

test('e2e: wrong password fails RAKP2 authentication (EAUTH)', async () => {
	const bmc = new MockBmc({ username: USER, password: PASS })
	await bmc.start()
	const s = sessionFor(bmc, { password: 'WrongPass123' })
	try {
		await assert.rejects(
			() => s.open(),
			(e) => e.code === 'EAUTH',
		)
	} finally {
		await s.close()
		await bmc.stop()
	}
})

test('e2e: unknown username is rejected at RAKP2 (status 0x0d)', async () => {
	const bmc = new MockBmc({ username: USER, password: PASS })
	await bmc.start()
	const s = sessionFor(bmc, { username: 'NOBODY' })
	try {
		await assert.rejects(
			() => s.open(),
			(e) => e.code === 'ERAKP2',
		)
	} finally {
		await s.close()
		await bmc.stop()
	}
})

test('e2e: timeout to a dead address yields ETIMEOUT', async () => {
	// Port with no listener (BMC stopped immediately).
	const bmc = new MockBmc({ username: USER, password: PASS })
	const port = await bmc.start()
	await bmc.stop()
	const s = sessionFor(bmc, { port, timeoutMs: 150, retries: 1 })
	try {
		await assert.rejects(
			() => s.open(),
			(e) => e.code === 'ETIMEOUT',
		)
	} finally {
		await s.close()
	}
})

test('e2e: RMCP presence ping returns true against a live BMC', async () => {
	const bmc = new MockBmc({ username: USER, password: PASS })
	await bmc.start()
	const s = sessionFor(bmc)
	try {
		assert.equal(await s.ping(), true)
	} finally {
		await s.close()
		await bmc.stop()
	}
})

test('e2e: IpmiController.getStatus + chassis through real sessions', async () => {
	const bmc = new MockBmc({ username: USER, password: PASS, powerOn: false })
	await bmc.start()
	const ctrl = new IpmiController(() => ({
		host: '127.0.0.1',
		port: bmc.port,
		username: USER,
		password: PASS,
		cipher: 3,
		privilege: 4,
		timeoutMs: 500,
	}))
	try {
		let st = await ctrl.getStatus()
		assert.deepEqual(st, { reachable: true, powerOn: false })

		await ctrl.chassis(POWER.UP)
		st = await ctrl.getStatus()
		assert.equal(st.powerOn, true)

		assert.equal(await ctrl.ping(), true)
	} finally {
		await bmc.stop()
	}
})

test('e2e: IpmiController.chassis surfaces 0xCF soft-shutdown rejection', async () => {
	const bmc = new MockBmc({ username: USER, password: PASS, softUnsupported: true })
	await bmc.start()
	const ctrl = new IpmiController(() => ({
		host: '127.0.0.1',
		port: bmc.port,
		username: USER,
		password: PASS,
		cipher: 3,
		timeoutMs: 500,
	}))
	try {
		await assert.rejects(
			() => ctrl.chassis(POWER.SOFT),
			(e) => e.code === 'ESOFTUNSUP',
		)
	} finally {
		await bmc.stop()
	}
})

test('e2e: IpmiController.restartSoft does soft-off, waits, then powers on', async () => {
	const bmc = new MockBmc({ username: USER, password: PASS, powerOn: true })
	await bmc.start()
	const ctrl = new IpmiController(() => ({
		host: '127.0.0.1',
		port: bmc.port,
		username: USER,
		password: PASS,
		cipher: 3,
		timeoutMs: 500,
	}))
	try {
		await ctrl.restartSoft({ timeoutMs: 2000, pollMs: 30 })
		assert.equal(bmc.powerOn, true)
		assert.deepEqual(bmc.actionsSeen, [POWER.SOFT, POWER.UP])
	} finally {
		await bmc.stop()
	}
})

test('e2e: waitPoweredOff resolves true once the server reports off', async () => {
	const bmc = new MockBmc({ username: USER, password: PASS, powerOn: true })
	await bmc.start()
	const ctrl = new IpmiController(() => ({
		host: '127.0.0.1',
		port: bmc.port,
		username: USER,
		password: PASS,
		cipher: 3,
		timeoutMs: 500,
	}))
	try {
		setTimeout(() => (bmc.powerOn = false), 80) // server finishes shutting down
		const ok = await ctrl.waitPoweredOff({ timeoutMs: 2000, pollMs: 25 })
		assert.equal(ok, true)
	} finally {
		await bmc.stop()
	}
})

test('e2e: waitPoweredOff resolves false on timeout while still powered', async () => {
	const bmc = new MockBmc({ username: USER, password: PASS, powerOn: true })
	await bmc.start()
	const ctrl = new IpmiController(() => ({
		host: '127.0.0.1',
		port: bmc.port,
		username: USER,
		password: PASS,
		cipher: 3,
		timeoutMs: 500,
	}))
	try {
		const ok = await ctrl.waitPoweredOff({ timeoutMs: 120, pollMs: 25 })
		assert.equal(ok, false)
	} finally {
		await bmc.stop()
	}
})

test('e2e: cipher suite 17 (SHA256) handshake + status', async () => {
	const bmc = new MockBmc({ username: USER, password: PASS, cipherSuite: 17, powerOn: true })
	await bmc.start()
	const s = sessionFor(bmc, { cipherSuite: 17 })
	try {
		await s.open()
		assert.equal((await getChassisStatus(s)).powerOn, true)
	} finally {
		await s.close()
		await bmc.stop()
	}
})
