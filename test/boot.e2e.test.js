'use strict'

/**
 * test/boot.e2e.test.js
 *
 * Instance-level end-to-end test: drives the REAL module instance
 * (PixeraIpmiInstance, src/main.js) through its real lifecycle methods
 * (init / configUpdated / refreshPowerState / action callbacks / destroy),
 * wired to the REAL IpmiController talking to the in-process MockBmc.
 *
 * This fills the gap between:
 *   - module.test.js  — drives the module with a FAKE self.ipmi, and
 *   - session.e2e.test.js — drives IpmiController against a real MockBmc,
 * by exercising the whole stack together exactly as Companion would, minus
 * the nodejs-ipc transport.
 *
 * The InstanceBase constructor demands real IPC props and uses process.send,
 * so instead of constructing it we borrow the subclass prototype (which holds
 * all the module logic) via Object.create and stub only the IPC-backed methods
 * (log / updateStatus / set*Definitions / setVariableValues / checkFeedbacks).
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { InstanceStatus } = require('@companion-module/base')
const { MockBmc } = require('./mock-bmc')
const { PixeraIpmiInstance } = require('../src/main')

const USER = 'ADMIN'
const PASS = 'Px010031098252'

/** Build a PixeraIpmiInstance whose IPC-backed methods are captured, not sent. */
function makeHarness() {
	const h = Object.create(PixeraIpmiInstance.prototype)
	h._cap = { vars: {}, statuses: [], feedbackChecks: [], actions: null, feedbacks: null }
	h.log = () => {}
	h.updateStatus = (status, message) => h._cap.statuses.push({ status, message })
	h.setActionDefinitions = (d) => (h._cap.actions = d)
	h.setFeedbackDefinitions = (d) => (h._cap.feedbacks = d)
	h.setVariableDefinitions = (d) => (h._cap.varDefs = d)
	h.setVariableValues = (v) => Object.assign(h._cap.vars, v)
	h.setPresetDefinitions = (d) => (h._cap.presets = d)
	h.checkFeedbacks = (...ids) => h._cap.feedbackChecks.push(...ids)
	return h
}

function fastConfig(bmc, overrides = {}) {
	return {
		bmcHost: '127.0.0.1',
		bmcPort: bmc.port,
		ipmiUser: USER,
		ipmiPass: PASS,
		cipher: 3,
		priv: 4,
		timeoutMs: 500,
		pollEnabled: false, // deterministic: we drive refreshPowerState() explicitly
		...overrides,
	}
}

test('boot: init resolves real power state through a real session (power ON)', async () => {
	const bmc = new MockBmc({ username: USER, password: PASS, powerOn: true })
	await bmc.start()
	const h = makeHarness()
	try {
		await h.init(fastConfig(bmc))
		await h.refreshPowerState()
		assert.equal(h._cap.vars.ipmi_reachable, 'true')
		assert.equal(h._cap.vars.ipmi_power_state, 'on')
		assert.equal(h.state.powerOn, true)
		assert.ok(h._cap.feedbackChecks.includes('power_state'))
		// Status reflects a reachable BMC.
		assert.equal(h._cap.statuses.at(-1).status, InstanceStatus.Ok)
	} finally {
		await h.destroy()
		await bmc.stop()
	}
})

test('boot: power-on action toggles real BMC state, then state re-reads as on', async () => {
	const bmc = new MockBmc({ username: USER, password: PASS, powerOn: false })
	await bmc.start()
	const h = makeHarness()
	try {
		await h.init(fastConfig(bmc))
		await h.refreshPowerState()
		assert.equal(h._cap.vars.ipmi_power_state, 'off')

		// Drive the real action callback registered on the instance.
		const powerOn = h._cap.actions.ipmi_power_on
		assert.ok(powerOn, 'ipmi_power_on action must be registered')
		await powerOn.callback({})

		await h.refreshPowerState()
		assert.equal(h._cap.vars.ipmi_power_state, 'on')
		assert.ok(bmc.actionsSeen.length >= 1, 'BMC must have seen a chassis action')
	} finally {
		await h.destroy()
		await bmc.stop()
	}
})

test('boot: unreachable BMC yields unknown/false without crashing', async () => {
	const h = makeHarness()
	try {
		// Port 1 on localhost: nothing listens -> session times out fast.
		await h.init({ ...fastConfig({ port: 1 }), bmcHost: '127.0.0.1', bmcPort: 1, timeoutMs: 300 })
		await h.refreshPowerState()
		assert.equal(h._cap.vars.ipmi_reachable, 'false')
		assert.equal(h._cap.vars.ipmi_power_state, 'unknown')
		assert.equal(h._cap.statuses.at(-1).status, InstanceStatus.ConnectionFailure)
	} finally {
		await h.destroy()
	}
})

test('boot: missing BMC host -> BadConfig and no controller traffic', async () => {
	const h = makeHarness()
	try {
		await h.init({ bmcHost: '', ipmiUser: USER })
		assert.equal(h._cap.statuses.at(-1).status, InstanceStatus.BadConfig)
		// Variables seeded to their safe defaults.
		assert.equal(h._cap.vars.ipmi_power_state, 'unknown')
		assert.equal(h._cap.vars.ipmi_reachable, 'false')
	} finally {
		await h.destroy()
	}
})

test('boot: destroy() clears the poll timer (no leaked interval)', async () => {
	const bmc = new MockBmc({ username: USER, password: PASS, powerOn: true })
	await bmc.start()
	const h = makeHarness()
	try {
		// Enable polling with a long interval so it won't fire during the test.
		await h.init(fastConfig(bmc, { pollEnabled: true, pollInterval: 3600 }))
		assert.ok(h._pollTimer, 'polling should arm a timer')
		await h.destroy()
		assert.equal(h._pollTimer, null, 'destroy must clear the timer')
	} finally {
		await bmc.stop()
	}
})
