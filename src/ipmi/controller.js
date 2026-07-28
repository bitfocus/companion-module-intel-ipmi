'use strict'

/**
 * src/ipmi/controller.js
 *
 * High-level façade used by the Companion module. Each operation opens a
 * short-lived RMCP+ session, runs its command(s), then closes — this avoids
 * session-keepalive bookkeeping and is robust against Companion reloads. A
 * small mutex serialises operations so overlapping button presses never open
 * competing sessions to the same BMC (BMCs allow only a few sessions).
 */

const { RmcpPlusSession, IpmiError } = require('./rmcp')
const { POWER, chassisControl, getChassisStatus } = require('./chassis')
const C = require('./constants')

class IpmiController {
	/**
	 * @param {() => object} getConfig returns {host, port, username, password, cipher, privilege, timeoutMs, retries}
	 * @param {(level:string, msg:string)=>void} [logger]
	 */
	constructor(getConfig, logger = () => {}) {
		this.getConfig = getConfig
		this.logger = logger
		this._queue = Promise.resolve()
	}

	_sessionOpts() {
		const c = this.getConfig() || {}
		return {
			host: c.host,
			port: c.port || 623,
			username: c.username,
			password: c.password,
			cipherSuite: c.cipher != null ? c.cipher : 3,
			privilege: c.privilege || C.PRIV.ADMINISTRATOR,
			timeoutMs: c.timeoutMs || 2000,
			retries: c.retries != null ? c.retries : 2,
			logger: this.logger,
		}
	}

	/** Serialise an async op behind the previous one (success or failure). */
	_run(fn) {
		const next = this._queue.then(fn, fn)
		this._queue = next.then(
			() => {},
			() => {},
		)
		return next
	}

	async _withSession(fn) {
		const opts = this._sessionOpts()
		if (!opts.host) throw new IpmiError('No BMC host configured', 'ENOHOST')
		const session = new RmcpPlusSession(opts)
		try {
			await session.open()
			return await fn(session)
		} finally {
			await session.close()
		}
	}

	/** Reachability check via RMCP presence ping (no auth needed). */
	async ping() {
		return this._run(async () => {
			const opts = this._sessionOpts()
			if (!opts.host) return false
			const session = new RmcpPlusSession(opts)
			try {
				return await session.ping()
			} finally {
				await session.close()
			}
		})
	}

	/**
	 * Send one Chassis Control action. Throws IpmiError with a readable message
	 * on a non-zero completion code; soft-shutdown's 0xCF gets a tailored hint.
	 * @param {number} actionByte one of POWER.*
	 */
	async chassis(actionByte) {
		return this._run(() =>
			this._withSession(async (session) => {
				const resp = await chassisControl(session, actionByte)
				this._assertChassisOk(resp, actionByte)
				return true
			}),
		)
	}

	_assertChassisOk(resp, actionByte) {
		if (resp.completionCode === 0) return
		if (actionByte === POWER.SOFT && resp.completionCode === 0xcf) {
			throw new IpmiError(
				'BMC rejected ACPI soft-shutdown (0xCF). The board may not honour soft-off here — try Power Cycle or Hard Reset instead.',
				'ESOFTUNSUP',
			)
		}
		const text = C.COMPLETION_CODE[resp.completionCode] || 'unknown error'
		throw new IpmiError(`Chassis Control failed: ${text} (0x${resp.completionCode.toString(16)})`, 'ECHASSIS')
	}

	/**
	 * Read power state.
	 * @returns {Promise<{reachable:boolean, powerOn:(boolean|null)}>}
	 */
	async getStatus() {
		return this._run(async () => {
			try {
				return await this._withSession(async (session) => {
					const s = await getChassisStatus(session)
					return { reachable: true, powerOn: s.powerOn }
				})
			} catch (e) {
				this.logger('debug', `getStatus failed: ${e.message}`)
				return { reachable: false, powerOn: null }
			}
		})
	}

	/**
	 * Poll Get Chassis Status until the server reports power off (or timeout),
	 * reusing one session for efficiency.
	 */
	async waitPoweredOff({ timeoutMs = 60000, pollMs = 3000 } = {}) {
		return this._run(() =>
			this._withSession(async (session) => {
				const deadline = Date.now() + timeoutMs
				for (;;) {
					const s = await getChassisStatus(session)
					if (!s.powerOn) return true
					if (Date.now() >= deadline) return false
					await new Promise((r) => setTimeout(r, pollMs))
				}
			}),
		)
	}

	/**
	 * Graceful restart for a media server: ACPI soft-shutdown, wait for full
	 * power-off, then power on. All inside a single session.
	 */
	async restartSoft({ timeoutMs = 60000, pollMs = 3000 } = {}) {
		return this._run(() =>
			this._withSession(async (session) => {
				const soft = await chassisControl(session, POWER.SOFT)
				this._assertChassisOk(soft, POWER.SOFT)

				const deadline = Date.now() + timeoutMs
				let off = false
				for (;;) {
					const s = await getChassisStatus(session)
					if (!s.powerOn) {
						off = true
						break
					}
					if (Date.now() >= deadline) break
					await new Promise((r) => setTimeout(r, pollMs))
				}
				if (!off) {
					throw new IpmiError(
						`Server did not power off within ${Math.round(timeoutMs / 1000)}s after soft-shutdown; aborting restart to avoid an unclean power-on.`,
						'ERESTARTTIMEOUT',
					)
				}
				const up = await chassisControl(session, POWER.UP)
				this._assertChassisOk(up, POWER.UP)
				return true
			}),
		)
	}
}

module.exports = { IpmiController, POWER, IpmiError }
