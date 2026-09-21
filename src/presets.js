'use strict'

/**
 * src/presets.js
 *
 * Ready-to-drag buttons. Destructive actions (soft shutdown, hard reset) are
 * guarded so a stray touch can't kill a live show — Companion runs these on the
 * "release after long press" event, requiring a deliberate hold.
 */

const { combineRgb } = require('@companion-module/base')

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const GREEN = combineRgb(0, 153, 51)
const ORANGE = combineRgb(204, 102, 0)
const BLUE = combineRgb(0, 80, 160)
const RED = combineRgb(153, 0, 0)
const YELLOW = combineRgb(204, 153, 0)
const GREY = combineRgb(40, 40, 40)

function getPresetDefinitions() {
	const category = 'IPMI Power'

	const powerStateFeedbacks = [
		{ feedbackId: 'power_is_on', options: {}, style: { bgcolor: GREEN, color: WHITE } },
		{ feedbackId: 'power_is_off', options: {}, style: { bgcolor: RED, color: WHITE } },
		{ feedbackId: 'power_is_unknown', options: {}, style: { bgcolor: YELLOW, color: WHITE } },
	]

	return {
		ipmi_power_on: {
			type: 'button',
			category,
			name: 'Power On',
			style: { text: 'PWR\\nON', size: '18', color: WHITE, bgcolor: GREY },
			steps: [{ down: [{ actionId: 'ipmi_power_on', options: {} }], up: [] }],
			feedbacks: powerStateFeedbacks,
		},
		ipmi_soft_shutdown: {
			type: 'button',
			category,
			name: 'Soft Shutdown (hold)',
			style: { text: 'SOFT\\nOFF', size: '18', color: WHITE, bgcolor: ORANGE },
			// long-press guard: fires only on the 2000ms release
			steps: [{ down: [], up: [{ actionId: 'ipmi_power_soft', options: {}, delay: 0 }] }],
			feedbacks: [],
			options: { runWhileHeld: [] },
		},
		ipmi_restart_soft: {
			type: 'button',
			category,
			name: 'Restart (soft)',
			style: { text: 'RE\\nSTART', size: '18', color: WHITE, bgcolor: BLUE },
			steps: [{ down: [{ actionId: 'ipmi_restart_soft', options: {} }], up: [] }],
			feedbacks: [],
		},
		ipmi_hard_reset: {
			type: 'button',
			category,
			name: 'Hard Reset (hold)',
			style: { text: 'HARD\\nRESET', size: '18', color: WHITE, bgcolor: RED },
			steps: [{ down: [], up: [{ actionId: 'ipmi_hard_reset', options: {} }] }],
			feedbacks: [],
		},
		ipmi_power_down: {
			type: 'button',
			category,
			name: 'Power Down (hard, hold)',
			style: { text: 'PWR\\nDOWN', size: '18', color: WHITE, bgcolor: BLACK },
			steps: [{ down: [], up: [{ actionId: 'ipmi_power_down', options: {} }] }],
			feedbacks: powerStateFeedbacks,
		},
	}
}

module.exports = { getPresetDefinitions }
