'use strict'

/**
 * src/main.js
 *
 * Companion InstanceBase for the AV Stumpfl Pixera IPMI power-control module.
 * The Pixera TCP-API module remains separate; this connection owns only BMC
 * power control.
 */

const { InstanceBase, InstanceStatus } = require('@companion-module/base')
const { getConfigFields } = require('./config')
const { getActionDefinitions } = require('./actions')
const { getFeedbackDefinitions } = require('./feedbacks')
const { getVariableDefinitions } = require('./variables')
const { getPresetDefinitions } = require('./presets')
const { IpmiController } = require('./ipmi/controller')
const { derivePixeraPassword } = require('./ipmi/password')

class PixeraIpmiInstance extends InstanceBase {
	async init(config) {
		this.config = config || {}
		this.state = { reachable: false, powerOn: null }
		this._pollTimer = null

		// Controller reads config lazily, so configUpdated needs no rebuild.
		this.ipmi = new IpmiController(
			() => this.getSessionConfig(),
			(level, msg) => this.log(level, msg),
		)

		this.setActionDefinitions(getActionDefinitions(this))
		this.setFeedbackDefinitions(getFeedbackDefinitions(this))
		this.setVariableDefinitions(getVariableDefinitions())
		this.setPresetDefinitions(getPresetDefinitions())

		this.setVariableValues({ ipmi_power_state: 'unknown', ipmi_reachable: 'false' })

		if (!(this.config.bmcHost || '').trim()) {
			this.updateStatus(InstanceStatus.BadConfig, 'No BMC host configured')
		} else {
			this.updateStatus(InstanceStatus.Connecting)
		}

		this.startPolling()
	}

	async configUpdated(config) {
		this.config = config || {}
		this.startPolling()
		if (!(this.config.bmcHost || '').trim()) {
			this.updateStatus(InstanceStatus.BadConfig, 'No BMC host configured')
		} else {
			this.refreshPowerState()
		}
	}

	async destroy() {
		this.stopPolling()
	}

	getConfigFields() {
		return getConfigFields()
	}

	/**
	 * Resolve the effective session config. Password precedence: explicit
	 * password, else auto-derived from the LAN1 sticker IP when provided.
	 */
	getSessionConfig() {
		const c = this.config || {}
		let password = (c.ipmiPass || '').trim()
		if (!password && c.lan1Ip) {
			try {
				password = derivePixeraPassword(c.lan1Ip)
			} catch {
				password = ''
			}
		}
		return {
			host: (c.bmcHost || '').trim(),
			port: c.bmcPort || 623,
			username: c.ipmiUser || 'ADMIN',
			password,
			cipher: c.cipher != null ? Number(c.cipher) : 3,
			privilege: c.priv != null ? Number(c.priv) : 4,
			timeoutMs: c.timeoutMs || 2000,
		}
	}

	// ---- polling / state ------------------------------------------------
	startPolling() {
		this.stopPolling()
		if (!(this.config.bmcHost || '').trim()) return
		if (this.config.pollEnabled === false) {
			// One-off read so feedback isn't stuck at unknown.
			this.refreshPowerState()
			return
		}
		const intervalMs = Math.max(2, this.config.pollInterval || 10) * 1000
		this.refreshPowerState()
		this._pollTimer = setInterval(() => this.refreshPowerState(), intervalMs)
	}

	stopPolling() {
		if (this._pollTimer) {
			clearInterval(this._pollTimer)
			this._pollTimer = null
		}
	}

	/** Read power state once and push it to variables/feedbacks/status. */
	async refreshPowerState() {
		if (!(this.config.bmcHost || '').trim()) return
		const status = await this.ipmi.getStatus()
		this.state.reachable = status.reachable
		this.state.powerOn = status.powerOn

		this.setVariableValues({
			ipmi_reachable: status.reachable ? 'true' : 'false',
			ipmi_power_state: !status.reachable ? 'unknown' : status.powerOn ? 'on' : 'off',
		})
		this.checkFeedbacks('power_state', 'power_is_on')

		if (!status.reachable) {
			this.updateStatus(InstanceStatus.ConnectionFailure, 'BMC unreachable')
		} else {
			this.updateStatus(InstanceStatus.Ok)
		}
	}

	/** Called by actions to surface a command error in the connection status. */
	markBmcError(message) {
		this.updateStatus(InstanceStatus.UnknownWarning, message)
	}
}

module.exports = { PixeraIpmiInstance }
