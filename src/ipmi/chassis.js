'use strict'

/**
 * src/ipmi/chassis.js
 *
 * The two IPMI commands needed for power control, on top of an active session:
 *   - Chassis Control    (NetFn Chassis 0x00, cmd 0x02) — one action byte
 *   - Get Chassis Status (NetFn Chassis 0x00, cmd 0x01) — used for feedback
 */

const C = require('./constants')

/** Chassis Control action bytes (re-exported for the actions layer). */
const POWER = C.CHASSIS_CONTROL

/**
 * Issue a Chassis Control command. Returns the raw response (caller inspects
 * completionCode so soft-shutdown's 0xCF can be handled specially by callers).
 * @param {import('./rmcp').RmcpPlusSession} session
 * @param {number} actionByte one of POWER.*
 */
async function chassisControl(session, actionByte) {
	return session.sendIpmiCommand(C.NETFN.CHASSIS, C.CMD.CHASSIS_CONTROL, Buffer.from([actionByte & 0xff]))
}

/**
 * Get Chassis Status and decode the "current power state" byte (§28.3).
 * @param {import('./rmcp').RmcpPlusSession} session
 * @returns {Promise<{powerOn:boolean, powerOverload:boolean, powerInterlock:boolean, powerFault:boolean, raw:Buffer}>}
 */
async function getChassisStatus(session) {
	const resp = await session.sendIpmiCommand(C.NETFN.CHASSIS, C.CMD.GET_CHASSIS_STATUS)
	if (resp.completionCode !== 0) {
		const err = new Error(
			`Get Chassis Status failed: ${C.COMPLETION_CODE[resp.completionCode] || 'unknown'} (0x${resp.completionCode.toString(16)})`,
		)
		err.completionCode = resp.completionCode
		throw err
	}
	const cur = resp.data[0] || 0
	return {
		powerOn: !!(cur & 0x01),
		powerOverload: !!(cur & 0x02),
		powerInterlock: !!(cur & 0x04),
		powerFault: !!(cur & 0x08),
		raw: resp.data,
	}
}

module.exports = { POWER, chassisControl, getChassisStatus }
