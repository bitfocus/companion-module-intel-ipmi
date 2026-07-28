'use strict'

/**
 * src/feedbacks.js
 *
 * `power_state` feedback: tints a button by the BMC's reported power state.
 *   power on -> green, power off -> red/grey, unreachable -> yellow.
 * Implemented as an advanced feedback so a single button can show all states.
 */

const { combineRgb } = require('@companion-module/base')

const WHITE = combineRgb(255, 255, 255)
const GREEN = combineRgb(0, 153, 51)
const RED = combineRgb(153, 0, 0)
const YELLOW = combineRgb(204, 153, 0)

function getFeedbackDefinitions(self) {
	return {
		power_state: {
			type: 'advanced',
			name: 'IPMI: Power state color',
			description: 'Color the button by server power state (on / off / unreachable).',
			options: [
				{ type: 'colorpicker', id: 'onColor', label: 'Power ON background', default: GREEN },
				{ type: 'colorpicker', id: 'offColor', label: 'Power OFF background', default: RED },
				{ type: 'colorpicker', id: 'unknownColor', label: 'Unreachable background', default: YELLOW },
				{ type: 'colorpicker', id: 'fgColor', label: 'Text color', default: WHITE },
			],
			callback: (feedback) => {
				const opt = feedback.options
				if (!self.state.reachable) return { bgcolor: opt.unknownColor, color: opt.fgColor }
				if (self.state.powerOn === true) return { bgcolor: opt.onColor, color: opt.fgColor }
				if (self.state.powerOn === false) return { bgcolor: opt.offColor, color: opt.fgColor }
				return { bgcolor: opt.unknownColor, color: opt.fgColor }
			},
		},

		power_is_on: {
			type: 'boolean',
			name: 'IPMI: Power is ON',
			description: 'True when the server reports power on.',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [],
			callback: () => self.state.reachable === true && self.state.powerOn === true,
		},
	}
}

module.exports = { getFeedbackDefinitions }
