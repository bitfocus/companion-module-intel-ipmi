'use strict'

/**
 * src/ipmi/password.js
 *
 * Helper that rebuilds the factory default IPMI password of a Pixera server.
 *
 * Pixera derives the factory IPMI password from the **LAN1 address printed on
 * the factory sticker** (the 10.31.x.x pool) — NOT from the IPMI/BMC address.
 * The rule is: 'Px' + every octet left-padded with zeros to 3 digits.
 *
 *   LAN1 = 10.31.98.252   ->   Px010031098252
 *
 * Source: https://help.pixera.one/power-control-of-pixera-servers-via-ipmi
 *
 * IMPORTANT (also surfaced in HELP.md):
 *  - The password is based on the ORIGINAL sticker LAN1 address, not the
 *    current (possibly re-configured) network address.
 *  - Pixera recommends changing the default IPMI credentials right after setup,
 *    so the derived value may already be stale.
 *  - Manually created accounts may use a password outside this rule.
 */

/**
 * Build the Pixera factory IPMI password from a LAN1 IPv4 address.
 * @param {string} lan1Ip dotted-quad IPv4 address from the factory sticker (10.31.x.x)
 * @returns {string} e.g. 'Px010031098252'
 * @throws {Error} on a malformed IPv4 address
 */
function derivePixeraPassword(lan1Ip) {
	if (typeof lan1Ip !== 'string') {
		throw new Error('Invalid IPv4 address')
	}
	const octets = lan1Ip.trim().split('.')
	if (octets.length !== 4) {
		throw new Error('Invalid IPv4 address')
	}
	const padded = octets
		.map((o) => {
			if (!/^\d{1,3}$/.test(o)) {
				throw new Error('Invalid IPv4 address')
			}
			const n = Number(o)
			if (n < 0 || n > 255) {
				throw new Error('Invalid IPv4 address')
			}
			return String(n).padStart(3, '0')
		})
		.join('')
	return 'Px' + padded
}

/**
 * Best-effort guess of the LAN1 (sticker) address from a known IPMI address.
 * Pixera ships with LAN1 10.31.x.x and IPMI 10.41.x.x (the 2nd octet is +10).
 * Returns null when the relation does not obviously hold, so callers never
 * present a misleading suggestion.
 * @param {string} ipmiIp dotted-quad IPv4 of the BMC/IPMI interface
 * @returns {string|null} the inferred LAN1 address, or null
 */
function inferLan1FromIpmi(ipmiIp) {
	if (typeof ipmiIp !== 'string') return null
	const octets = ipmiIp.trim().split('.')
	if (octets.length !== 4) return null
	const nums = octets.map((o) => Number(o))
	if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
	// Documented relation: LAN1 10.31.x.x -> IPMI 10.41.x.x (second octet + 10)
	if (nums[0] !== 10 || nums[1] !== 41) return null
	return `10.31.${nums[2]}.${nums[3]}`
}

module.exports = { derivePixeraPassword, inferLan1FromIpmi }
