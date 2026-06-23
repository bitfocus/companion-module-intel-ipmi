<p align="center">
  <img src="ltt-dev-logo.png" alt="LTT-DEV" width="180" />
</p>

# Pixera IPMI

_Developed by **LTT-DEV**. · English below · [Polski poniżej](#pixera-ipmi--polski)_

---

## English

This module controls the **server power** of AV Stumpfl Pixera media servers over
native **IPMI v2.0 (RMCP+)** — no external `ipmitool`/`ipmiutil` binaries required.

It is independent of the official **AV Stumpfl: Pixera** connection, which
controls the Pixera application over its TCP API. Use both side by side when you
need application control and power control.

### IPMI / BMC Power Control

The IPMI path is parallel and independent from the Pixera application control.
It talks directly to the server's BMC over UDP (default port **623**) using a
RMCP+ session (Open Session → RAKP 1‑4 → encrypted commands → Close Session).

#### Configuration fields

| Field                  | Default         | Notes                                                                                          |
| ---------------------- | --------------- | ---------------------------------------------------------------------------------------------- |
| BMC IP / Hostname      | —               | Address of the BMC/IPMI interface (Pixera factory pool `10.41.x.x`).                           |
| BMC Port               | `623`           | Standard IPMI RMCP port.                                                                       |
| IPMI Username          | `ADMIN`         | Pixera factory user.                                                                           |
| IPMI Password          | _(blank)_       | Factory rule below. Treated as a secret — never shown in variables/exports.                    |
| LAN1 sticker IP        | _(blank)_       | Optional. If set and the password is left blank, the factory password is auto‑derived from it. |
| Cipher Suite           | `3`             | `3` = HMAC‑SHA1 / AES‑128 (Pixera). `17` = SHA256/AES‑128. `0` = none.                         |
| Privilege              | `ADMINISTRATOR` | Power control needs ≥ OPERATOR.                                                                |
| Poll power state       | on              | Periodic Get Chassis Status for feedback/variables.                                            |
| Poll interval (s)      | `10`            |                                                                                                |
| Soft‑restart wait (s)  | `60`            | How long "Restart (soft)" waits for full power‑off before powering back on.                    |
| BMC reply timeout (ms) | `2000`          | Per‑request timeout (2 retries).                                                               |

All values are Pixera defaults but remain **editable**.

#### Factory password rule

Pixera derives the default IPMI password from the **LAN1 address printed on the
factory sticker** (pool `10.31.x.x`) — **not** from the IPMI address. The rule is
`Px` + every octet zero‑padded to 3 digits:

```
LAN1 10.31.98.252  ->  Px010031098252
```

The documented address relation is **LAN1 `10.31.x.x` → IPMI `10.41.x.x`** (second
octet +10). The module can rebuild the password for you: put the original LAN1
sticker address in the **LAN1 sticker IP** field and leave the password blank.

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

#### Actions

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

#### Feedback & variables

- Feedback **Power state color** — green = on, red = off, yellow = unreachable.
- Feedback **Power is ON** — boolean.
- `$(pixera:ipmi_power_state)` — `on` / `off` / `unknown`
- `$(pixera:ipmi_reachable)` — `true` / `false`

#### Presets

Ready‑to‑drag buttons under **IPMI Power**. Destructive actions (Soft Shutdown,
Hard Reset, Power Down) fire on **release after a long press** so a stray touch
can't kill a live show.

#### Network & security

- The Companion controller **must have a network route to the IPMI subnet**.
  Confirm with `ping`/the BMC web panel from the Companion machine.
- Keep IPMI on a **dedicated, isolated management VLAN** — never expose it
  publicly (per Pixera's security guidance).
- The password and full RAKP material are **never logged**.
- If your BMC allows it, use a minimal account with **OPERATOR** privilege.

#### Verifying against real hardware

The native RMCP+ implementation is unit‑tested end‑to‑end against an in‑process
BMC simulator, but you should still confirm against your real Pixera BMC. A handy
ground‑truth reference with `ipmiutil`:

```
ipmiutil health -N <BMC_IP> -U <user> -P <pass> -F lan2 -V 4
ipmiutil power  -o -N <BMC_IP> -U <user> -P <pass> -F lan2 -V 4   # soft restart
```

---

# Pixera IPMI — Polski

## Polski

Ten moduł steruje **zasilaniem serwera** serwerów medialnych AV Stumpfl Pixera
poprzez natywne **IPMI v2.0 (RMCP+)** — bez potrzeby zewnętrznych narzędzi
`ipmitool`/`ipmiutil`.

Jest niezależny od oficjalnego połączenia **AV Stumpfl: Pixera**, które steruje
aplikacją Pixera po jej API TCP. Używaj obu równolegle, gdy potrzebujesz sterowania
aplikacją i zasilaniem.

### Sterowanie zasilaniem IPMI / BMC

Ścieżka IPMI jest równoległa i niezależna od sterowania aplikacją Pixera.
Komunikuje się bezpośrednio z BMC serwera po UDP (domyślny port **623**), używając
sesji RMCP+ (Open Session → RAKP 1‑4 → szyfrowane komendy → Close Session).

#### Pola konfiguracji

| Pole                    | Domyślnie       | Uwagi                                                                                          |
| ----------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| BMC IP / Hostname       | —               | Adres interfejsu BMC/IPMI (fabryczna pula Pixera `10.41.x.x`).                                  |
| BMC Port                | `623`           | Standardowy port IPMI RMCP.                                                                     |
| IPMI Username           | `ADMIN`         | Fabryczny użytkownik Pixera.                                                                    |
| IPMI Password           | _(puste)_       | Reguła fabryczna poniżej. Traktowane jak sekret — nigdy nie pokazywane w zmiennych/eksporcie.   |
| LAN1 sticker IP         | _(puste)_       | Opcjonalne. Jeśli ustawione, a hasło puste, hasło fabryczne jest z niego wyliczane automatycznie. |
| Cipher Suite            | `3`             | `3` = HMAC‑SHA1 / AES‑128 (Pixera). `17` = SHA256/AES‑128. `0` = brak.                          |
| Privilege               | `ADMINISTRATOR` | Sterowanie zasilaniem wymaga ≥ OPERATOR.                                                         |
| Poll power state        | wł.             | Okresowe Get Chassis Status dla feedbacku/zmiennych.                                            |
| Poll interval (s)       | `10`            |                                                                                                |
| Soft‑restart wait (s)   | `60`            | Jak długo „Restart (soft)" czeka na pełne wyłączenie zasilania przed ponownym włączeniem.        |
| BMC reply timeout (ms)  | `2000`          | Limit czasu na żądanie (2 ponowienia).                                                          |

Wszystkie wartości to domyślne ustawienia Pixera, ale pozostają **edytowalne**.

#### Reguła hasła fabrycznego

Pixera wyprowadza domyślne hasło IPMI z **adresu LAN1 nadrukowanego na naklejce
fabrycznej** (pula `10.31.x.x`) — **a nie** z adresu IPMI. Reguła to `Px` + każdy
oktet dopełniony zerami do 3 cyfr:

```
LAN1 10.31.98.252  ->  Px010031098252
```

Udokumentowana zależność adresów to **LAN1 `10.31.x.x` → IPMI `10.41.x.x`** (drugi
oktet +10). Moduł może odtworzyć hasło za Ciebie: wpisz oryginalny adres z naklejki
LAN1 w polu **LAN1 sticker IP** i zostaw hasło puste.

> **Ostrzeżenia**
>
> - Hasło opiera się na adresie LAN1 z **oryginalnej naklejki**, a nie na bieżącym
>   (być może przekonfigurowanym) adresie sieciowym. Zmiana IP nie zmienia hasła
>   fabrycznego.
> - Pixera zaleca **zmianę domyślnych poświadczeń IPMI zaraz po konfiguracji**, więc
>   wyliczone domyślne hasło może być już nadpisane — pole hasła jest zawsze edytowalne.
> - Ręcznie utworzone konto może mieć hasło spoza tej reguły; pomocnik go nie dopasuje.

#### Akcje

- **Power On** — `0x01`
- **Soft Shutdown (ACPI)** — `0x05` (łagodne)
- **Power Down (twarde wyłączenie)** — `0x00`
- **Power Cycle** — `0x02`
- **Hard Reset** — `0x03`
- **Pulse Diagnostic Interrupt (NMI)** — `0x04`
- **Restart (soft)** — miękkie wyłączenie → czekaj na pełne wyłączenie → włącz.
  Najbezpieczniejsze dla serwera medialnego.

> Niektóre płyty odrzucają miękkie wyłączenie ACPI kodem zakończenia **`0xCF`**,
> mimo że deklarują obsługę ACPI. Moduł zapisuje czytelny komunikat i sugeruje
> przejście na **Power Cycle** lub **Hard Reset**.

#### Feedback i zmienne

- Feedback **Power state color** — zielony = włączony, czerwony = wyłączony,
  żółty = nieosiągalny.
- Feedback **Power is ON** — wartość logiczna.
- `$(pixera:ipmi_power_state)` — `on` / `off` / `unknown`
- `$(pixera:ipmi_reachable)` — `true` / `false`

#### Presety

Gotowe do przeciągnięcia przyciski pod **IPMI Power**. Akcje destrukcyjne (Soft
Shutdown, Hard Reset, Power Down) wyzwalają się **po zwolnieniu po długim
przytrzymaniu**, aby przypadkowe dotknięcie nie ubiło trwającego show.

#### Sieć i bezpieczeństwo

- Kontroler Companion **musi mieć trasę sieciową do podsieci IPMI**. Potwierdź
  `ping`iem / panelem web BMC z maszyny Companion.
- Trzymaj IPMI w **dedykowanym, izolowanym VLAN-ie zarządzania** — nigdy nie
  wystawiaj go publicznie (zgodnie z zaleceniami bezpieczeństwa Pixera).
- Hasło i pełny materiał RAKP **nigdy nie są logowane**.
- Jeśli BMC na to pozwala, użyj minimalnego konta z uprawnieniem **OPERATOR**.

#### Weryfikacja na prawdziwym sprzęcie

Natywna implementacja RMCP+ jest testowana jednostkowo end‑to‑end na wbudowanym
symulatorze BMC, ale i tak warto potwierdzić ją na swoim prawdziwym BMC Pixera.
Przydatny punkt odniesienia z `ipmiutil`:

```
ipmiutil health -N <BMC_IP> -U <user> -P <pass> -F lan2 -V 4
ipmiutil power  -o -N <BMC_IP> -U <user> -P <pass> -F lan2 -V 4   # miękki restart
```
