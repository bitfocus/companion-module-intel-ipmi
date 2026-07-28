'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { POWER, chassisControl, getChassisStatus } = require('../src/ipmi/chassis')
const C = require('../src/ipmi/constants')

function fakeSession(responder) {
	return {
		calls: [],
		async sendIpmiCommand(netFn, cmd, data) {
			this.calls.push({ netFn, cmd, data: Buffer.from(data || []) })
			return responder({ netFn, cmd, data: Buffer.from(data || []) })
		},
	}
}

test('POWER action bytes match the IPMI Chassis Control table', () => {
	assert.deepEqual(POWER, { DOWN: 0x00, UP: 0x01, CYCLE: 0x02, RESET: 0x03, PULSE_NMI: 0x04, SOFT: 0x05 })
})

test('chassisControl sends NetFn Chassis / cmd 0x02 with the action byte', async () => {
	const s = fakeSession(() => ({ completionCode: 0, data: Buffer.alloc(0) }))
	const resp = await chassisControl(s, POWER.UP)
	assert.equal(resp.completionCode, 0)
	assert.equal(s.calls[0].netFn, C.NETFN.CHASSIS)
	assert.equal(s.calls[0].cmd, C.CMD.CHASSIS_CONTROL)
	assert.deepEqual(s.calls[0].data, Buffer.from([0x01]))
})

test('getChassisStatus decodes the power-state bits', async () => {
	const on = fakeSession(() => ({ completionCode: 0, data: Buffer.from([0x01, 0, 0]) }))
	assert.equal((await getChassisStatus(on)).powerOn, true)

	const off = fakeSession(() => ({ completionCode: 0, data: Buffer.from([0x00, 0, 0]) }))
	assert.equal((await getChassisStatus(off)).powerOn, false)

	const overload = fakeSession(() => ({ completionCode: 0, data: Buffer.from([0x0b, 0, 0]) }))
	const st = await getChassisStatus(overload)
	assert.equal(st.powerOn, true)
	assert.equal(st.powerOverload, true)
	assert.equal(st.powerFault, true)
})

test('getChassisStatus issues NetFn Chassis / cmd 0x01', async () => {
	const s = fakeSession(() => ({ completionCode: 0, data: Buffer.from([0x01]) }))
	await getChassisStatus(s)
	assert.equal(s.calls[0].netFn, C.NETFN.CHASSIS)
	assert.equal(s.calls[0].cmd, C.CMD.GET_CHASSIS_STATUS)
})

test('getChassisStatus throws a readable error on a non-zero completion code', async () => {
	const s = fakeSession(() => ({ completionCode: 0xc1, data: Buffer.alloc(0) }))
	await assert.rejects(() => getChassisStatus(s), /Invalid command|0xc1/)
})
