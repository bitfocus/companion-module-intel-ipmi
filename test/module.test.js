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

test('boolean power feedbacks select exactly one state, including unknown and stale readings', () => {
	const self = { state: {} }
	const feedbacks = getFeedbackDefinitions(self)
	assert.deepEqual(Object.keys(feedbacks), ['power_is_on', 'power_is_off', 'power_is_unknown'])
	for (const feedback of Object.values(feedbacks)) {
		assert.equal(feedback.type, 'boolean')
		assert.deepEqual(feedback.options, [])
	}

	const cases = [
		[{ reachable: true, powerOn: true }, 'power_is_on'],
		[{ reachable: true, powerOn: false }, 'power_is_off'],
		[{ reachable: true, powerOn: null }, 'power_is_unknown'],
		[{ reachable: true }, 'power_is_unknown'],
		[{ reachable: true, powerOn: 'on' }, 'power_is_unknown'],
		[{ reachable: false, powerOn: true }, 'power_is_unknown'],
		[{ reachable: false, powerOn: false }, 'power_is_unknown'],
		[{ reachable: false, powerOn: null }, 'power_is_unknown'],
		[{}, 'power_is_unknown'],
	]
	for (const [state, expected] of cases) {
		self.state = state
		for (const [id, feedback] of Object.entries(feedbacks)) {
			assert.equal(feedback.callback(), id === expected, `${JSON.stringify(state)}: ${id}`)
		}
	}
})

test('power presets retain green, red and yellow styling through boolean feedbacks', () => {
	const self = { state: {} }
	const feedbacks = getFeedbackDefinitions(self)
	const presets = getPresetDefinitions()
	const cases = [
		[{ reachable: true, powerOn: true }, 0x009933],
		[{ reachable: true, powerOn: false }, 0x990000],
		[{ reachable: true, powerOn: null }, 0xcc9900],
		[{ reachable: false, powerOn: true }, 0xcc9900],
	]
	for (const presetId of ['ipmi_power_on', 'ipmi_power_down']) {
		const preset = presets[presetId]
		for (const [state, bgcolor] of cases) {
			self.state = state
			const active = preset.feedbacks.filter((fb) => feedbacks[fb.feedbackId].callback())
			assert.equal(active.length, 1, `${presetId}: ${JSON.stringify(state)}`)
			assert.deepEqual(active[0].style, { bgcolor, color: 0xffffff })
			assert.deepEqual(feedbacks[active[0].feedbackId].defaultStyle, active[0].style)
		}
	}
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
