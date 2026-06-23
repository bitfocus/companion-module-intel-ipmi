'use strict'

/**
 * src/variables.js
 *
 * IPMI status variables. The password is NEVER exposed as a variable (see §11
 * security notes) — only derived state.
 */

function getVariableDefinitions() {
	return [
		{ variableId: 'ipmi_power_state', name: 'IPMI power state (on/off/unknown)' },
		{ variableId: 'ipmi_reachable', name: 'IPMI BMC reachable (true/false)' },
	]
}

module.exports = { getVariableDefinitions }
