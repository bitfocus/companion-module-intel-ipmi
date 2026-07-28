'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { getConfigFields } = require('../src/config')
const { getActionDefinitions } = require('../src/actions')
const { getFeedbackDefinitions } = require('../src/feedbacks')
const { getPresetDefinitions } = require('../src/presets')
const { getVariableDefinitions } = require('../src/variables')
const { IpmiInstance } = require('../src/main')
const { POWER } = require('../src/ipmi/controller')

function byId(fields) {
	const m = {}
	for (const f of fields) if (f.id) m[f.id] = f
	return m
}

test('config fields expose Pixera factory defaults but stay editable', () => {
	const f = byId(getConfigFields())
	assert.equal(f.bmcPort.default, 623)
	assert.equal(f.ipmiUser.default, 'ADMIN')
	assert.equal(f.cipher.default, 3)
	assert.equal(f.priv.default, 4)
	assert.equal(f.ipmiPass.default, '') // blank, with derivation hint
	assert.match(f.ipmiPass.tooltip, /Px/)
})

test('actions cover the full Chassis Control set and dispatch the right bytes', async () => {
	const calls = []
	const self = {
		config: {},
		ipmi: {
			chassis: (b) => {
				calls.push(['chassis', b])
				return Promise.resolve()
			},
			restartSoft: (o) => {
				calls.push(['restartSoft', o])
				return Promise.resolve()
			},
		},
		log: () => {},
		refreshPowerState: () => calls.push(['refresh']),
		markBmcError: (m) => calls.push(['error', m]),
	}
	const actions = getActionDefinitions(self)

	await actions.ipmi_power_on.callback({})
	await actions.ipmi_power_soft.callback({})
	await actions.ipmi_power_down.callback({})
	await actions.ipmi_power_cycle.callback({})
	await actions.ipmi_hard_reset.callback({})
	await actions.ipmi_pulse_nmi.callback({})

	const chassisBytes = calls.filter((c) => c[0] === 'chassis').map((c) => c[1])
	assert.deepEqual(chassisBytes, [POWER.UP, POWER.SOFT, POWER.DOWN, POWER.CYCLE, POWER.RESET, POWER.PULSE_NMI])
	assert.equal(calls.filter((c) => c[0] === 'refresh').length, 6) // success path refreshes state

	await actions.ipmi_restart_soft.callback({})
	assert.ok(calls.some((c) => c[0] === 'restartSoft'))
})

test('action failure is logged and marks a BMC error (no throw to Companion)', async () => {
	const calls = []
	const self = {
		config: {},
		ipmi: { chassis: () => Promise.reject(new Error('boom')) },
		log: () => {},
		refreshPowerState: () => calls.push(['refresh']),
		markBmcError: (m) => calls.push(['error', m]),
	}
	const actions = getActionDefinitions(self)
	await actions.ipmi_power_on.callback({}) // must resolve, not reject
	assert.deepEqual(calls, [['error', 'boom']])
})

test('power_state feedback colors by state', () => {
	const self = { state: { reachable: true, powerOn: true } }
	const opts = { onColor: 1, offColor: 2, unknownColor: 3, fgColor: 9 }
	const fb = getFeedbackDefinitions(self).power_state

	assert.deepEqual(fb.callback({ options: opts }), { bgcolor: 1, color: 9 })
	self.state.powerOn = false
	assert.deepEqual(fb.callback({ options: opts }), { bgcolor: 2, color: 9 })
	self.state.reachable = false
	assert.deepEqual(fb.callback({ options: opts }), { bgcolor: 3, color: 9 })
})

test('presets only reference defined actions and feedbacks', () => {
	const actions = getActionDefinitions({ config: {}, ipmi: {}, log() {}, refreshPowerState() {}, markBmcError() {} })
	const feedbacks = getFeedbackDefinitions({ state: {} })
	for (const preset of Object.values(getPresetDefinitions())) {
		for (const step of preset.steps) {
			for (const set of [step.down || [], step.up || []]) {
				for (const a of set) assert.ok(actions[a.actionId], `action ${a.actionId} exists`)
			}
		}
		for (const fb of preset.feedbacks || []) {
			assert.ok(feedbacks[fb.feedbackId], `feedback ${fb.feedbackId} exists`)
		}
	}
})

test('variables declare power state and reachability', () => {
	const ids = getVariableDefinitions().map((v) => v.variableId)
	assert.ok(ids.includes('ipmi_power_state'))
	assert.ok(ids.includes('ipmi_reachable'))
})

test('getSessionConfig derives the password from LAN1 when password is blank', () => {
	const cfg = IpmiInstance.prototype.getSessionConfig.call({
		config: { bmcHost: '10.41.98.252', lan1Ip: '10.31.98.252', ipmiPass: '' },
	})
	assert.equal(cfg.password, 'Px010031098252')
	assert.equal(cfg.username, 'ADMIN') // default applied
	assert.equal(cfg.cipher, 3)
})

test('getSessionConfig prefers an explicit password over LAN1 derivation', () => {
	const cfg = IpmiInstance.prototype.getSessionConfig.call({
		config: { bmcHost: '10.41.98.252', lan1Ip: '10.31.98.252', ipmiPass: 'CustomSecret' },
	})
	assert.equal(cfg.password, 'CustomSecret')
})
