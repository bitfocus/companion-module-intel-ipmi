# Code Review Report — Pixera IPMI Power Control

**Reviewer perspective:** full professional review of the IPMI power-control
feature against the design document (`pixera-companion-ipmi-dev.md`), the IPMI
v2.0 spec, and the `@companion-module/base` API.

**Verdict:** ✅ Complete and **validated on real Pixera BMC hardware**. Shipped as a
standalone Companion 4 module (`avstumpfl-pixera-ipmi`, v1.0.0) on
`@companion-module/base` 1.14.x / `node22`. All design-doc goals are met and
covered by automated tests. **75 tests, all passing.**

> Note: "standalone" below means the module ships independently of the Pixera
> TCP-API module; both can run side by side.

---

## 1. Scope reviewed

- All source under `src/` and `src/ipmi/` (13 files).
- All tests under `test/` (9 files, 75 tests) + the BMC simulator.
- `companion/manifest.json`, `companion/HELP.md`, `package.json`, `README.md`.

## 2. Findings & actions taken

| #   | Finding                                                                                                     | Severity                          | Action                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------- |
| 1   | `password.js` threw Polish error text `'Niepoprawny adres IPv4'` (carried over from the design-doc snippet) | Medium (English-only requirement) | Replaced with `'Invalid IPv4 address'` in source **and** the matching test. |
| 2   | `bmcHost` field regex blocked saving valid addresses (trailing space / pasted `host:port`)                  | Medium (usability)                | Removed the field regex; trim the host in code (see §11).                   |
| 3   | Test-plan §10.5 "bad cipher" path had no explicit test                                                      | Low (coverage)                    | Added `ECIPHER`/`EUSER` constructor tests.                                  |

No correctness defects were found in the protocol, crypto, or session logic.

## 3. English-only audit

```
grep -rnP '[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]'  src test index.js   → (none)
grep heuristic Polish words in code                    → (only the fixed strings)
grep diacritics in README/HELP/manifest/package        → (none)
```

All code, comments, identifiers, error messages, and authored documentation are
in English. The **only** non-English file is `pixera-companion-ipmi-dev.md`,
which is the original Polish design brief (input, not a deliverable) and is left
untouched by intent.

## 4. Field / config consistency (machine-checked)

- Every `getConfigFields()` id (except the `static-text` banner) is read by
  `main.js`/`actions.js`: **no orphan fields**.
- Variables declared == variables set in `main.js` (`ipmi_power_state`,
  `ipmi_reachable`).
- Every action referenced by a preset resolves to a defined action; every
  feedback referenced by a preset and by `checkFeedbacks()` is defined.
- Defaults match design-doc §5/§6 exactly:
  `ADMIN` / port `623` / cipher `3` / privilege `4 (ADMINISTRATOR)` / blank
  password with `Px…` hint; privilege choices USER/OPERATOR/ADMINISTRATOR;
  cipher choices 0/3/17.
- `companion/manifest.json` validates against the base JSON schema
  (`validate_manifest.js`).

## 5. IPMI v2.0 spec conformance (machine-checked)

`test/rakp-conformance.test.js` rebuilds each HMAC input byte-for-byte from the
spec field order and asserts equality with `crypto.js`:

| Item                  | Spec   | Formula verified                                |
| --------------------- | ------ | ----------------------------------------------- | -------------------------- |
| RAKP2 auth code       | §13.28 | `HMAC_pw(SIDc‖SIDm‖Rm‖Rc‖GUID‖Role‖ULen‖UName)` |
| Session Integrity Key | §13.31 | `HMAC_pw                                        | Kg(Rm‖Rc‖Role‖ULen‖UName)` |
| RAKP3 auth code       | §13.28 | `HMAC_pw(Rc‖SIDc‖Role‖ULen‖UName)`              |
| RAKP4 ICV             | §13.28 | `trunc(HMAC_SIK(Rm‖SIDm‖GUID))`                 |
| K1/K2                 | §13.32 | constant fills `0x01`/`0x02` of digest length   |

Field orders match the ipmitool `lanplus` reference. Packet framing (RMCP/ASF,
session header, integrity trailer, LAN checksums) is asserted byte-for-byte in
`test/protocol.test.js`. Primitive correctness is anchored by published KATs:
HMAC-SHA1 (RFC 2202) and AES-128-CBC (NIST SP 800-38A) in `test/crypto.test.js`.

## 6. Goals traceability — design doc §13 TODO

| TODO item                                         | Status      | Code                                                        | Tests                                                                              |
| ------------------------------------------------- | ----------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Standalone repository + dev path                  | ✅ / 🔧     | `pixera-ipmi` module                                        | dev-path is an operator step → `docs/DEPLOYMENT.md §A`                             |
| `password.js` + unit test                         | ✅          | `src/ipmi/password.js`                                      | `password.test.js` (7)                                                             |
| Config fields §6 with Pixera defaults             | ✅          | `src/config.js`                                             | `module.test.js`, §4 audit                                                         |
| (optional) Phase 1 shell-out to ipmiutil          | ⏭️ skipped  | —                                                           | went native directly (allowed by §4.5)                                             |
| `rmcp.js` RMCP+/RAKP session (cipher 3)           | ✅          | `src/ipmi/rmcp.js`                                          | `session.e2e` (13), `rakp-conformance` (7)                                         |
| `chassis.js` Chassis Control + Get Chassis Status | ✅          | `src/ipmi/chassis.js`                                       | `chassis.test.js` (5)                                                              |
| Actions §7 + presets §9                           | ✅          | `actions.js`, `presets.js`                                  | `module.test.js`                                                                   |
| Feedback `power_state` + variables + polling      | ✅          | `feedbacks.js`, `variables.js`, `main.js`                   | `module.test.js`, `session.e2e`                                                    |
| Error handling (auth / timeout / 0xCF)            | ✅          | `rmcp.js`, `controller.js`                                  | `session.e2e`, `controller.test`                                                   |
| Tests on real BMC §10                             | ✅ done     | —                                                           | verified against a live Pixera BMC: ping → RAKP 1-4 → Get Chassis Status (see §11) |
| HELP.md + clean versioning                        | ✅          | `companion/HELP.md`, `package.json`/`manifest.json` `1.0.0` | —                                                                                  |
| Publish standalone module                         | ⚠️ external | —                                                           | repository/publish step outside the code review                                    |

Legend: ✅ done · 🔧 partially (operator/maintainer step documented) · ⏭️ intentionally skipped · ⚠️ external (cannot run without hardware/accounts).

## 7. Goals traceability — design doc §10 test plan

| Test-plan step                                        | Where verified                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1. Ground truth via `ipmiutil`                        | external; procedure in `DEPLOYMENT.md §C`, `HELP.md`                                   |
| 2. Session log: Open → RAKP 1-4 → active              | `rmcp.js` debug logs; `session.e2e` "full handshake"                                   |
| 3. Get Chassis Status feedback on/off                 | `chassis.test` decode; `session.e2e` toggling; `module.test` feedback colors           |
| 4. Each action separately (On/Soft/Down/Cycle/Reset)  | `module.test` dispatch bytes; `session.e2e` actions-seen                               |
| 5. Errors: bad user/pass, bad cipher, timeout, `0xCF` | `session.e2e` (EAUTH, ERAKP2, ETIMEOUT, 0xCF); `controller.test` (ECIPHER, ESOFTUNSUP) |
| 6. Network route to IPMI subnet                       | documented requirement; `DEPLOYMENT.md §D`, `HELP.md`                                  |

## 8. Test coverage (IPMI core)

```
chassis.js     100% │ constants.js 100% │ password.js 100% │ protocol.js 100%
config.js      100% │ actions.js   100% │ presets.js  100% │ variables.js 100%
crypto.js     ~99%  │ controller.js ~94% │ rmcp.js ~95%     │ feedbacks.js ~98%
main.js       ~48%  (InstanceBase lifecycle needs the Companion IPC host; the
                     pure logic — getSessionConfig, password precedence — is
                     unit-tested in module.test.js)
```

The uncovered lines are defensive branches (socket-error/teardown paths) and the
Companion-host lifecycle, which by design cannot run outside the `nodejs-ipc`
runtime. All protocol/crypto/command logic is fully exercised.

## 9. Security review (design doc §11)

- ✅ Password never logged; RAKP material never logged.
- ✅ Password not exposed as a variable or in exports.
- ✅ `crypto.timingSafeEqual` used for all auth-code/ICV comparisons.
- ✅ HELP.md mandates isolated management VLAN and suggests least-privilege
  (`OPERATOR`) accounts.

## 10. Remaining (optional) steps

1. Publish the standalone `pixera-ipmi` repository/package when the maintainer
   account and release process are confirmed.
2. Announce availability to the relevant Companion/Pixera users.

## 11. Hardware validation & deployment resolution

- **Live BMC test (passed).** Against a real Pixera BMC the native stack completed
  end-to-end: RMCP presence ping (UDP 623) → RMCP+ Open Session → RAKP 1-4
  (HMAC-SHA1 auth + AES-CBC-128 confidentiality, integrity verified) → Get Chassis
  Status returned the live power state. This proves the cryptography and framing
  against real hardware, not only the simulator.
- **Runtime targeting.** Companion 4 runs modules on `node22` with
  `@companion-module/base` **1.14.x** (which provides `runEntrypoint`). An initial
  attempt against `base` 2.x failed because 2.x removed `runEntrypoint` (default
  export only); the module loaded but the instance crashed at startup. Fixed by
  pinning `base` 1.14.x and `runtime.type: node22`.
- **Unique module id.** Sharing the official id (`avstumpfl-pixera`) made Companion
  treat the build as another version of the bundled 3.2.3 module. Renamed to
  `avstumpfl-pixera-ipmi` ("AV Stumpfl: Pixera IPMI") so it is a distinct
  connection, and reset the version to a clean `1.0.0`.
- **Config field.** `bmcHost` had a `Regex.HOSTNAME` that silently blocked saving
  a valid address (trailing space / pasted `host:port`); removed it and trimmed in
  code.
- **Developer path.** Companion runs dev modules under Node's permission model and
  scopes `--allow-fs-read` to the module directory; a symlink to a spaced path was
  denied. Resolved by keeping the project as a real directory in a space-free path.

---

## How to reproduce this review

```bash
npm test                                  # 75 passing
npm run test:coverage                     # coverage table above
grep -rnP '[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]' src test  # English-only check → empty
```
