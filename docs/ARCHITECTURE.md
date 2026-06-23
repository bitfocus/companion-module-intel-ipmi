# Architecture — Pixera IPMI Power Control

This document describes how the AV Stumpfl Pixera IPMI power-control module is
built. It is written for developers who will maintain the `pixera-ipmi` codebase.

## 1. Goals & non-goals

**Goal.** Provide server power control (on / off / cycle / reset / soft-shutdown /
graceful restart) for AV Stumpfl Pixera systems, talking directly to the server's
BMC over **IPMI v2.0 (RMCP+)**, with **no external binaries**
(`ipmitool`/`ipmiutil`) and no native add-ons — pure Node `dgram` + `crypto`.

**Non-goals.** This is not a general IPMI library. The scope is deliberately
narrow: one authenticated session plus two Chassis commands. Sensor reading, SOL,
SDR, FRU, user management, etc. are out of scope.

**Separation rule.** The IPMI code lives entirely under `src/ipmi/` and is a
parallel, independent path. It does not depend on the Pixera TCP-API module.

## 2. Layered design

```
┌─────────────────────────────────────────────────────────────┐
│ Companion host (nodejs-ipc)                                   │
│   index.js → runEntrypoint(PixeraIpmiInstance)                │
└─────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────────┐
│ Companion glue (src/)                                         │
│   main.js        InstanceBase lifecycle, polling, status      │
│   config.js      connection fields (Pixera defaults)          │
│   actions.js     7 power actions                              │
│   feedbacks.js   power_state (color) + power_is_on (boolean)  │
│   variables.js   ipmi_power_state, ipmi_reachable             │
│   presets.js     ready-to-drag, guarded buttons               │
└─────────────────────────────────────────────────────────────┘
                          │  (only depends on controller.js + password.js)
┌─────────────────────────────────────────────────────────────┐
│ IPMI core (src/ipmi/) — framework-agnostic, no Companion deps │
│   controller.js  high-level façade: session-per-op + mutex    │
│   chassis.js     Chassis Control (0x02), Get Chassis Status   │
│   rmcp.js        RmcpPlusSession state machine over dgram      │
│   protocol.js    packet build/parse, checksums (pure buffers) │
│   crypto.js      RAKP HMACs, SIK/K1/K2, integrity, AES-CBC     │
│   constants.js   enums, cipher suites, status/completion codes │
│   password.js    derivePixeraPassword / inferLan1FromIpmi      │
└─────────────────────────────────────────────────────────────┘
```

The dependency arrow points one way: the glue depends on the core, never the
reverse. `protocol.js` and `crypto.js` are pure (Buffer in / Buffer out) so they
are unit-testable at the byte level without sockets.

## 3. Session lifecycle

A power operation is short-lived: the controller opens a session, runs its
command(s), and closes. This avoids session-keepalive bookkeeping and is robust
across Companion connection reloads. A promise-chain mutex (`IpmiController._run`)
serialises operations so overlapping button presses never open competing
sessions (BMCs allow only a handful of concurrent sessions).

```
open()                                          RmcpPlusSession
  ├─ RMCP+ Open Session Request  ──────────────▶  negotiate cipher suite
  │                              ◀────────────── BMC session ID, status
  ├─ RAKP Message 1 (user + Rm) ──────────────▶
  │                              ◀────────────── RAKP 2 (Rc, GUID, auth code)
  │   verify RAKP2 auth ⇒ EAUTH on mismatch
  │   derive SIK, K1, K2 (AES key = K2[0:16])
  ├─ RAKP Message 3 (auth code) ──────────────▶
  │                              ◀────────────── RAKP 4 (ICV)
  │   verify RAKP4 ICV ⇒ EICV on mismatch
  └─ session active
sendIpmiCommand(netFn, cmd, data)
  └─ LAN msg → confidentiality (AES-CBC) → integrity (HMAC-SHA1-96) → UDP
close()
  └─ Close Session (best effort) → socket teardown
```

Every datagram is sent through `_transceive`, which retransmits on timeout
(`timeoutMs`, `retries`) and rejects with `ETIMEOUT` when the BMC never answers.

## 4. Cryptography (cipher suite 3, the Pixera default)

| Stage                 | Algorithm                            | Where                                    |
| --------------------- | ------------------------------------ | ---------------------------------------- |
| Authentication (RAKP) | RAKP-HMAC-SHA1                       | `crypto.rakp2AuthCode`, `rakp3AuthCode`  |
| Session integrity key | HMAC-SHA1 (keyed by password, or Kg) | `crypto.deriveSik`                       |
| Per-packet integrity  | HMAC-SHA1-96 (truncated to 12 bytes) | `crypto.integrityAuthCode`               |
| Confidentiality       | AES-CBC-128 (random IV, IPMI pad)    | `crypto.encryptPayload`/`decryptPayload` |

Suite 17 (HMAC-SHA256 / HMAC-SHA256-128 / AES-CBC-128) runs through the same code
paths via the `CIPHER_SUITES` descriptor; suite 0 (no crypto) is also handled.

The exact HMAC field orders are machine-checked against the IPMI v2.0 spec field
layout in `test/rakp-conformance.test.js` (with §-references), and validated
end-to-end against an independently-written BMC simulator in
`test/session.e2e.test.js`.

## 5. Wire format quick reference

- **RMCP header** (4 bytes): version `0x06`, reserved `0x00`, seq `0xFF`, class
  (`0x06` ASF / `0x07` IPMI).
- **RMCP+ session header**: AuthType `0x06`, payload-type byte (bit7 encrypted,
  bit6 authenticated), session ID (LE), session seq (LE), payload length (LE).
- **Integrity trailer** (authenticated packets): pad bytes `0xFF` to align the
  `[AuthType … NextHeader]` span to a multiple of 4, pad-length byte, next-header
  `0x07`, then the truncated HMAC.
- **LAN message**: `rsAddr, netFn/LUN, csum, rqAddr, rqSeq/LUN, cmd, data…, csum`
  with 2's-complement checksums.

All of the above is produced/parsed by `protocol.js` and asserted byte-for-byte
in `test/protocol.test.js`.

## 6. Power state model

`Get Chassis Status` (cmd `0x01`) byte 0 bit 0 = "power is on". The instance
polls it on an interval (`setInterval` in `init`, cleared in `destroy`) and
pushes the result to:

- variables `ipmi_power_state` (`on`/`off`/`unknown`) and `ipmi_reachable`,
- feedbacks `power_state` (color) and `power_is_on` (boolean),
- the Companion connection status (`Ok` / `ConnectionFailure`).

## 7. Error handling

Errors carry a stable `code` and a human-readable message:

| code                                 | Meaning                                              | Surfaced as                                 |
| ------------------------------------ | ---------------------------------------------------- | ------------------------------------------- |
| `ECIPHER`                            | Unsupported cipher suite                             | thrown at construction                      |
| `EUSER`                              | Username > 16 bytes                                  | thrown at construction                      |
| `ENOHOST`                            | No BMC host configured                               | action log + status                         |
| `ETIMEOUT`                           | BMC never replied (route/firewall/IPMI-over-LAN off) | action log + status                         |
| `EOPENSESSION` / `ERAKP2` / `ERAKP4` | RMCP+ negotiation rejected                           | action log                                  |
| `EAUTH`                              | RAKP2 auth mismatch (wrong user/password)            | action log                                  |
| `EICV`                               | RAKP4 integrity mismatch (key derivation)            | action log                                  |
| `ESOFTUNSUP`                         | Soft-shutdown rejected with `0xCF`                   | action log, suggests Power Cycle/Hard Reset |
| `ECHASSIS`                           | Other non-zero completion code                       | action log (decoded text)                   |

Action callbacks never throw into Companion — failures are logged and reflected
in the connection status (`markBmcError`).

## 8. Design trade-offs (noted for reviewers)

- **Session per operation + per poll.** Simpler and reload-safe, at the cost of a
  full RAKP handshake on each poll (default every 10 s). For power control this
  is negligible and avoids keepalive complexity. Tunable via the poll interval.
- **`_transceive` matches the next datagram, not a specific tag.** With a single
  in-flight request per session this is correct; a late retransmit reply is
  harmless. A stricter tag/seq match could be added if multiplexing is ever
  introduced.
- **`bmcHost` has no field-level regex.** A regex (e.g. `Regex.HOSTNAME`) rejected
  common inputs — a trailing space, a pasted `host:port` — and Companion then
  refused to save the field, leaving the module with no host. The address is
  trimmed in `main.js` and the session layer reports a clear `ETIMEOUT` if it is
  unreachable, so validation friction is removed without losing diagnostics.

## 9. Runtime & packaging notes (Companion 4)

- **Target:** `@companion-module/base` **1.14.x** with manifest `runtime.type:
node22`. This is the combination shipped Companion 4 modules use; `base` 2.x is a
  future major that removed `runEntrypoint` (default-export entry) and must not be
  used with this `index.js`. `apiVersion` stays `0.0.0` in source — the build tool
  populates it with the real `base` version.
- **No spaces in the project path.** Both `companion-module-build` and the
  Companion _developer modules path_ break on a path containing a space. The
  developer path additionally runs the module under Node's permission model
  (`--allow-fs-read=<module dir>`), so the module must be a real directory inside
  that path — a symlink pointing elsewhere is denied. Keep the project at e.g.
  `~/companion-dev-modules/avstumpfl-pixera-ipmi`.
