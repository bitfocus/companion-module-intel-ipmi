'use strict'

/**
 * src/config.js
 *
 * Connection configuration fields for the AV Stumpfl Pixera IPMI module. The
 * official Pixera TCP-API module stays separate; this module exposes only BMC
 * power-control settings.
 *
 * Every value below is a Pixera factory default but stays user-editable, per
 * the project rule "what is standard in Pixera is the default, but changeable".
 */

function getConfigFields() {
	return [
		{
			type: 'static-text',
			id: 'ipmi-info',
			width: 12,
			label: 'IPMI / BMC Power Control',
			value:
				'Control Pixera server power over native IPMI v2.0 (RMCP+). Use a dedicated, isolated management VLAN — never expose IPMI publicly.',
		},
		{
			type: 'textinput',
			id: 'bmcHost',
			label: 'BMC IP / Hostname',
			width: 6,
			default: '',
			// No strict regex here: a stray space or a "host:port" paste would make
			// Companion refuse to save the field, leaving the module with no host.
			// The value is trimmed in main.js and the session layer reports a clear
			// timeout if the address is unreachable.
			tooltip: 'IP or hostname of the BMC (Pixera factory pool 10.41.x.x). No port here — set it in BMC Port.',
		},
		{
			type: 'number',
			id: 'bmcPort',
			label: 'BMC Port',
			width: 3,
			default: 623,
			min: 1,
			max: 65535,
		},
		{
			type: 'textinput',
			id: 'ipmiUser',
			label: 'IPMI Username',
			width: 6,
			default: 'ADMIN', // Pixera factory user
		},
		{
			type: 'textinput',
			id: 'ipmiPass',
			label: 'IPMI Password',
			width: 6,
			default: '',
			tooltip: 'Factory default: Px + LAN1 sticker IP (10.31.x.x) zero-padded, e.g. Px010031098252',
		},
		{
			type: 'textinput',
			id: 'lan1Ip',
			label: 'LAN1 sticker IP (optional — auto-derives password if password left blank)',
			width: 6,
			default: '',
			// No regex: derivePixeraPassword() validates/trims this itself.
			tooltip:
				'Original factory LAN1 address from the sticker (pool 10.31.x.x). Used only to rebuild the default password.',
		},
		{
			type: 'dropdown',
			id: 'cipher',
			label: 'Cipher Suite',
			width: 3,
			default: 3,
			choices: [
				{ id: 0, label: '0 (none)' },
				{ id: 3, label: '3 (SHA1 / AES-128) — Pixera' },
				{ id: 17, label: '17 (SHA256 / AES-128)' },
			],
		},
		{
			type: 'dropdown',
			id: 'priv',
			label: 'Privilege',
			width: 3,
			default: 4,
			choices: [
				{ id: 2, label: 'USER' },
				{ id: 3, label: 'OPERATOR' },
				{ id: 4, label: 'ADMINISTRATOR' },
			],
		},
		{
			type: 'checkbox',
			id: 'pollEnabled',
			label: 'Poll power state',
			width: 3,
			default: true,
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Poll interval (s)',
			width: 3,
			default: 10,
			min: 2,
			max: 3600,
		},
		{
			type: 'number',
			id: 'softRestartTimeout',
			label: 'Soft-restart power-off wait (s)',
			width: 3,
			default: 60,
			min: 5,
			max: 600,
		},
		{
			type: 'number',
			id: 'timeoutMs',
			label: 'BMC reply timeout (ms)',
			width: 3,
			default: 2000,
			min: 500,
			max: 20000,
		},
	]
}

module.exports = { getConfigFields }
