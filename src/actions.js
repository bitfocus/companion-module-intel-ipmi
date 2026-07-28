'use strict'

/**
 * src/actions.js
 *
 * IPMI power actions. Each one funnels through the shared IpmiController, which
 * owns the session lifecycle. Errors are reported to the Companion log with a
 * readable message (auth / timeout / 0xCF etc.).
 */

const { POWER } = require('./ipmi/controller')

function getActionDefinitions(self) {
	const run = (label, fn) => async () => {
		try {
			await fn()
			self.log('info', `IPMI: ${label} sent OK`)
			self.refreshPowerState() // reflect new state quickly
		} catch (e) {
			self.log('error', `IPMI: ${label} failed — ${e.message}`)
			self.markBmcError(e.message)
		}
	}

	return {
		ipmi_power_on: {
			name: 'IPMI: Power On',
			options: [],
			callback: run('Power On', () => self.ipmi.chassis(POWER.UP)),
		},
		ipmi_power_soft: {
			name: 'IPMI: Soft Shutdown (ACPI)',
			options: [],
			callback: run('Soft Shutdown', () => self.ipmi.chassis(POWER.SOFT)),
		},
		ipmi_power_down: {
			name: 'IPMI: Power Down (hard off)',
			options: [],
			callback: run('Power Down', () => self.ipmi.chassis(POWER.DOWN)),
		},
		ipmi_power_cycle: {
			name: 'IPMI: Power Cycle',
			options: [],
			callback: run('Power Cycle', () => self.ipmi.chassis(POWER.CYCLE)),
		},
		ipmi_hard_reset: {
			name: 'IPMI: Hard Reset',
			options: [],
			callback: run('Hard Reset', () => self.ipmi.chassis(POWER.RESET)),
		},
		ipmi_pulse_nmi: {
			name: 'IPMI: Pulse Diagnostic Interrupt (NMI)',
			options: [],
			callback: run('Pulse NMI', () => self.ipmi.chassis(POWER.PULSE_NMI)),
		},
		ipmi_restart_soft: {
			name: 'IPMI: Restart (soft — graceful, safest for media server)',
			options: [],
			callback: run('Restart (soft)', () =>
				self.ipmi.restartSoft({ timeoutMs: (self.config.softRestartTimeout || 60) * 1000 }),
			),
		},
	}
}

module.exports = { getActionDefinitions }
