'use strict'

/**
 * src/feedbacks.js
 *
 * Boolean power-state feedbacks let users choose their own button styles.
 * Defaults: power on -> green, power off -> red, unknown/unreachable -> yellow.
 */

const { combineRgb } = require('@companion-module/base')

const WHITE = combineRgb(255, 255, 255)
const GREEN = combineRgb(0, 153, 51)
const RED = combineRgb(153, 0, 0)
const YELLOW = combineRgb(204, 153, 0)

function getFeedbackDefinitions(self) {
	return {
		power_is_on: {
			type: 'boolean',
			name: 'IPMI: Power is ON',
			description: 'True when the server reports power on.',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [],
			callback: () => self.state.reachable === true && self.state.powerOn === true,
		},
		power_is_off: {
			type: 'boolean',
			name: 'IPMI: Power is OFF',
			description: 'True when the server reports power off.',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [],
			callback: () => self.state.reachable === true && self.state.powerOn === false,
		},
		power_is_unknown: {
			type: 'boolean',
			name: 'IPMI: Power state is unknown',
			description: 'True when the BMC is unreachable or the server power state is unknown.',
			defaultStyle: { bgcolor: YELLOW, color: WHITE },
			options: [],
			callback: () => self.state.reachable !== true || (self.state.powerOn !== true && self.state.powerOn !== false),
		},
	}
}

module.exports = { getFeedbackDefinitions }
