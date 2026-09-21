# Intel IPMI

This module controls **server power** over native **IPMI v2.0 (RMCP+)** — no
external `ipmitool`/`ipmiutil` binaries required. It talks directly to the
server's BMC over UDP (default port **623**) using a RMCP+ session
(Open Session → RAKP 1‑4 → encrypted commands → Close Session).

It works with any IPMI 2.0 capable BMC (Supermicro, Intel, ASRock Rack, …).
Using an **AV Stumpfl Pixera** media server? See the
[dedicated section below](#av-stumpfl-pixera-servers).

## Configuration fields

| Field                  | Default         | Notes                                                                                         |
| ---------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| BMC IP / Hostname      | —               | Address of the BMC/IPMI interface.                                                            |
| BMC Port               | `623`           | Standard IPMI RMCP port.                                                                      |
| IPMI Username          | `ADMIN`         | Common BMC factory user.                                                                      |
| IPMI Password          | _(blank)_       | Treated as a secret — never shown in variables/exports.                                       |
| Pixera LAN1 sticker IP | _(blank)_       | Optional. If set and the password is left blank, the Pixera factory password is auto‑derived. |
| Cipher Suite           | `3`             | `3` = HMAC‑SHA1 / AES‑128 (most common factory default). `17` = SHA256/AES‑128. `0` = none.   |
| Privilege              | `ADMINISTRATOR` | Power control needs ≥ OPERATOR.                                                               |
| Poll power state       | on              | Periodic Get Chassis Status for feedback/variables.                                           |
| Poll interval (s)      | `10`            |                                                                                               |
| Soft‑restart wait (s)  | `60`            | How long "Restart (soft)" waits for full power‑off before powering back on.                   |
| BMC reply timeout (ms) | `2000`          | Per‑request timeout (2 retries).                                                              |

## Actions

- **Power On** — `0x01`
- **Soft Shutdown (ACPI)** — `0x05` (graceful)
- **Power Down (hard off)** — `0x00`
- **Power Cycle** — `0x02`
- **Hard Reset** — `0x03`
- **Pulse Diagnostic Interrupt (NMI)** — `0x04`
- **Restart (soft)** — soft shutdown → wait for full power‑off → power on. Safest
  for a media server.

> Some boards reject ACPI soft‑shutdown with completion code **`0xCF`** even
> though they advertise ACPI support. The module logs a readable message and
> suggests falling back to **Power Cycle** or **Hard Reset**.

## Feedback & variables

- Feedback **Power is ON** — boolean, green by default.
- Feedback **Power is OFF** — boolean, red by default.
- Feedback **Power state is unknown** — boolean, yellow by default; active when
  the BMC is unreachable or the power state is unknown.
- Combine these feedbacks on one button for all three states. Their styles are
  editable in Companion; the power presets already include them.
- `$(intel-ipmi:ipmi_power_state)` — `on` / `off` / `unknown`
- `$(intel-ipmi:ipmi_reachable)` — `true` / `false`

(The variable prefix is your connection label — `intel-ipmi` is the default.)

## Presets

Ready‑to‑drag buttons under **IPMI Power**. Destructive actions (Soft Shutdown,
Hard Reset, Power Down) fire on **release after a long press** so a stray touch
can't kill a live show.

## AV Stumpfl Pixera servers

This module was built for — and validated end to end on — Pixera media servers,
and the defaults above are the Pixera factory values. It is listed under Intel
because Companion names modules manufacturer-product and IPMI is an Intel-led
specification.

It controls server _power_ only and is independent of the
**AV Stumpfl: Pixera** connection, which controls the Pixera application over
its TCP API — use both side by side when you need application control and power
control.

Pixera address conventions: BMC/IPMI factory pool **`10.41.x.x`**, LAN1 factory
pool **`10.31.x.x`** (second octet −10 from the IPMI address).

### Factory password rule

Pixera derives the default IPMI password from the **LAN1 address printed on the
factory sticker** — **not** from the IPMI address. The rule is `Px` + every
octet zero‑padded to 3 digits:

```
LAN1 10.31.98.252  ->  Px010031098252
```

The module can rebuild the password for you: put the original LAN1 sticker
address in the **Pixera LAN1 sticker IP** field and leave the password blank.

> **Warnings**
>
> - The password is based on the **original sticker** LAN1 address, not the
>   current (possibly re‑configured) network address. Changing the IP does not
>   change the factory password.
> - Pixera recommends **changing the default IPMI credentials right after setup**,
>   so the derived default may already be overwritten — the password field is
>   always editable.
> - A manually created account may use a password outside this
>   rule; the helper will not match it.

## Network & security

- The Companion controller **must have a network route to the IPMI subnet**.
  Confirm with `ping`/the BMC web panel from the Companion machine.
- Keep IPMI on a **dedicated, isolated management VLAN** — never expose it
  publicly.
- The password and full RAKP material are **never logged**.
- If your BMC allows it, use a minimal account with **OPERATOR** privilege.

## Verifying against real hardware

The native RMCP+ implementation is unit‑tested end‑to‑end against an in‑process
BMC simulator and has been confirmed against real Pixera BMC hardware, but you
should still verify against your own BMC. A handy ground‑truth reference with
`ipmiutil`:

```
ipmiutil health -N <BMC_IP> -U <user> -P <pass> -F lan2 -V 4
ipmiutil power  -o -N <BMC_IP> -U <user> -P <pass> -F lan2 -V 4   # soft restart
```

---

_Developed and maintained by **LTT-DEV**._
