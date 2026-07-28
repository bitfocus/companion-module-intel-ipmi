'use strict'

/**
 * src/ipmi/constants.js
 *
 * Protocol constants for IPMI v2.0 / RMCP+ (Intel spec rev 1.1).
 * Spec: https://www.intel.com/content/www/us/en/products/docs/servers/ipmi/ipmi-second-gen-interface-spec-v2-rev1-1.html
 */

// ---- RMCP header --------------------------------------------------------
const RMCP_VERSION = 0x06 // ASF RMCP version 1.0
const RMCP_SEQ_NO_ACK = 0xff // sequence number that disables RMCP ACK (IPMI)
const RMCP_CLASS_ASF = 0x06 // ASF (presence ping/pong)
const RMCP_CLASS_IPMI = 0x07 // IPMI

const ASF_IANA = 0x000011be // ASF IANA enterprise number (4542)
const ASF_PRESENCE_PING = 0x80
const ASF_PRESENCE_PONG = 0x40

// ---- IPMI session header ------------------------------------------------
const AUTH_TYPE_RMCPP = 0x06 // IPMI v2.0+ (RMCP+) format

// payload type byte: bit7 = encrypted, bit6 = authenticated, bits5..0 = type
const PAYLOAD_ENCRYPTED = 0x80
const PAYLOAD_AUTHENTICATED = 0x40
const PAYLOAD_TYPE = {
	IPMI: 0x00,
	OPEN_SESSION_REQUEST: 0x10,
	OPEN_SESSION_RESPONSE: 0x11,
	RAKP1: 0x12,
	RAKP2: 0x13,
	RAKP3: 0x14,
	RAKP4: 0x15,
}

// ---- Cipher suite algorithm numbers ------------------------------------
const AUTH_ALG = { NONE: 0x00, HMAC_SHA1: 0x01, HMAC_MD5: 0x02, HMAC_SHA256: 0x03 }
const INTEGRITY_ALG = {
	NONE: 0x00,
	HMAC_SHA1_96: 0x01,
	HMAC_MD5_128: 0x02,
	MD5_128: 0x03,
	HMAC_SHA256_128: 0x04,
}
const CONF_ALG = { NONE: 0x00, AES_CBC_128: 0x01, XRC4_128: 0x02, XRC4_40: 0x03 }

/**
 * Cipher suite -> {auth, integrity, conf} plus the crypto parameters each one
 * implies. Suite 3 (HMAC-SHA1 / HMAC-SHA1-96 / AES-CBC-128) is the de-facto
 * default and the one Pixera hardware ships with.
 */
const CIPHER_SUITES = {
	0: {
		auth: AUTH_ALG.NONE,
		integrity: INTEGRITY_ALG.NONE,
		conf: CONF_ALG.NONE,
		hash: null,
		integrityTrunc: 0,
		aes: false,
	},
	3: {
		auth: AUTH_ALG.HMAC_SHA1,
		integrity: INTEGRITY_ALG.HMAC_SHA1_96,
		conf: CONF_ALG.AES_CBC_128,
		hash: 'sha1',
		integrityTrunc: 12, // HMAC-SHA1-96 -> 96 bits
		aes: true,
	},
	17: {
		auth: AUTH_ALG.HMAC_SHA256,
		integrity: INTEGRITY_ALG.HMAC_SHA256_128,
		conf: CONF_ALG.AES_CBC_128,
		hash: 'sha256',
		integrityTrunc: 16, // HMAC-SHA256-128 -> 128 bits
		aes: true,
	},
}

// ---- Privilege levels ---------------------------------------------------
const PRIV = { CALLBACK: 1, USER: 2, OPERATOR: 3, ADMINISTRATOR: 4, OEM: 5 }

// ---- NetFn / commands ---------------------------------------------------
const NETFN = { CHASSIS: 0x00, APP: 0x06 }
const CMD = {
	GET_CHASSIS_STATUS: 0x01, // NetFn Chassis
	CHASSIS_CONTROL: 0x02, // NetFn Chassis
	GET_CHANNEL_AUTH_CAP: 0x38, // NetFn App
}

// ---- Chassis Control action bytes (cmd 0x02) ---------------------------
const CHASSIS_CONTROL = {
	DOWN: 0x00, // power down (hard off)
	UP: 0x01, // power up
	CYCLE: 0x02, // power cycle
	RESET: 0x03, // hard reset
	PULSE_NMI: 0x04, // pulse diagnostic interrupt (NMI)
	SOFT: 0x05, // soft shutdown via ACPI
}

// ---- LAN message addressing --------------------------------------------
const BMC_RESPONDER_ADDR = 0x20 // rsAddr for the BMC
const REMOTE_SWID = 0x81 // rqAddr software ID for a remote console

// ---- RMCP+ status codes (Open Session / RAKP) --------------------------
const RMCPP_STATUS = {
	0x00: 'No errors',
	0x01: 'Insufficient resources to create a session',
	0x02: 'Invalid session ID',
	0x03: 'Invalid payload type',
	0x04: 'Invalid authentication algorithm',
	0x05: 'Invalid integrity algorithm',
	0x06: 'No matching authentication payload',
	0x07: 'No matching integrity payload',
	0x08: 'Inactive session ID',
	0x09: 'Invalid role',
	0x0a: 'Unauthorized role or privilege level requested',
	0x0b: 'Insufficient resources to create a session at the requested role',
	0x0c: 'Invalid name length',
	0x0d: 'Unauthorized name',
	0x0e: 'Unauthorized GUID',
	0x0f: 'Invalid integrity check value',
	0x10: 'Invalid confidentiality algorithm',
	0x11: 'No Cipher Suite match with proposed security algorithms',
	0x12: 'Illegal or unrecognized parameter',
}

// ---- IPMI completion codes (subset relevant to power control) ----------
const COMPLETION_CODE = {
	0x00: 'Command completed normally',
	0xc0: 'Node busy',
	0xc1: 'Invalid command',
	0xc2: 'Command invalid for given LUN',
	0xc3: 'Timeout while processing command',
	0xc4: 'Out of space',
	0xc5: 'Reservation canceled or invalid reservation ID',
	0xc6: 'Request data truncated',
	0xc7: 'Request data length invalid',
	0xc8: 'Request data field length limit exceeded',
	0xc9: 'Parameter out of range',
	0xca: 'Cannot return number of requested data bytes',
	0xcb: 'Requested sensor, data, or record not present',
	0xcc: 'Invalid data field in request',
	0xcd: 'Command illegal for specified sensor or record type',
	0xce: 'Command response could not be provided',
	0xcf: 'Cannot execute duplicated request / action not supported (some boards reject ACPI soft-shutdown here)',
	0xd0: 'SDR repository in update mode',
	0xd1: 'Device in firmware update mode',
	0xd2: 'BMC initialization in progress',
	0xd3: 'Destination unavailable',
	0xd4: 'Insufficient privilege level',
	0xd5: 'Command not supported in present state',
	0xd6: 'Cannot execute command, sub-function disabled or unavailable',
	0xff: 'Unspecified error',
}

module.exports = {
	RMCP_VERSION,
	RMCP_SEQ_NO_ACK,
	RMCP_CLASS_ASF,
	RMCP_CLASS_IPMI,
	ASF_IANA,
	ASF_PRESENCE_PING,
	ASF_PRESENCE_PONG,
	AUTH_TYPE_RMCPP,
	PAYLOAD_ENCRYPTED,
	PAYLOAD_AUTHENTICATED,
	PAYLOAD_TYPE,
	AUTH_ALG,
	INTEGRITY_ALG,
	CONF_ALG,
	CIPHER_SUITES,
	PRIV,
	NETFN,
	CMD,
	CHASSIS_CONTROL,
	BMC_RESPONDER_ADDR,
	REMOTE_SWID,
	RMCPP_STATUS,
	COMPLETION_CODE,
}
