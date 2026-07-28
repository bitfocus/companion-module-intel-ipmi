<p align="center">
  <img src="docs/assets/ltt-dev-logo.png" alt="LTT-DEV" width="220" />
</p>

# Intel IPMI

Developed by the **[LTT-DEV](https://github.com/ltt-dev)** organization ·
maintained by **[Stefan Kowal (@Stefankowal3)](https://github.com/Stefankowal3)** ·
_English below · [Polski poniżej](#polski)_

---

## English

Server power control for Bitfocus Companion over native **IPMI v2.0 (RMCP+)**,
talking directly to the server's built-in BMC.

Turn a server on, shut it down, power-cycle or reset it, and see its live power
state on a button — without any extra software. The IPMI session is implemented
directly in the module, so there are **no external tools**
(`ipmitool`/`ipmiutil`) and **no native add-ons** to install. It works with any
IPMI 2.0 capable BMC (Supermicro, Intel, ASRock Rack, …).

- **Manufacturer:** Intel · **Product:** IPMI
- **Module id:** `intel-ipmi`
- **Maintainers:** [LTT-DEV](https://github.com/ltt-dev) (organization) · [Stefan Kowal — @Stefankowal3](https://github.com/Stefankowal3)
- **License:** MIT

### Built for AV Stumpfl Pixera

This module was developed for — and validated end to end on — **AV Stumpfl
Pixera** media servers, and the defaults are the Pixera factory values. It knows
the Pixera factory-password rule (`Px<LAN1 IP, zero-padded>`, e.g.
`10.31.98.252 → Px010031098252`) and can derive the password from the LAN1
sticker address for you.

It controls server _power_ only. To control the Pixera _application_ (timelines,
layers, etc.) use the separate `avstumpfl-pixera` connection — the two work side
by side. Users who imported the earlier `avstumpfl-pixera-ipmi` package have
their connections migrated automatically (`legacyIds`).

### Installation

Inside Companion: **Connections → Add connection**, search for **IPMI** (or
**Pixera**) and add **Intel: IPMI**.

### Configuration

Add the connection and fill in the BMC details of your server:

- **BMC IP / Hostname** — the server's IPMI/BMC address.
- **Username / Password** — BMC credentials. On Pixera hardware the factory
  defaults are pre-filled and the password can be derived automatically.

### What it does

- **Power actions:** On · Soft Shutdown (ACPI) · Power Down · Power Cycle ·
  Hard Reset · Pulse NMI · graceful Soft Restart.
- **Feedback & variables:** live power state on the button, polled from the BMC.
- **Presets:** ready-to-use buttons you can drag straight onto a page.

### Support

- In-app help: **`companion/HELP.md`** (shown in Companion).
- Issues: <https://github.com/bitfocus/companion-module-intel-ipmi/issues>

### For developers

Design notes and protocol details live in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

```bash
npm install
npm test          # node --test (75 tests)
npm run lint
```

The native RMCP+ stack (RAKP handshake, HMAC-SHA1 auth, AES-128-CBC) has been
validated end to end against real Pixera BMC hardware.

---

## Polski

Sterowanie zasilaniem serwerów z poziomu Bitfocus Companion natywnym protokołem
**IPMI v2.0 (RMCP+)**, bezpośrednio przez wbudowany w serwer kontroler BMC.

Włącz serwer, wyłącz go programowo, zrestartuj zasilanie lub wykonaj reset,
i obserwuj jego bieżący stan zasilania na przycisku — bez żadnego dodatkowego
oprogramowania. Sesja IPMI jest zaimplementowana bezpośrednio w module, więc
**nie potrzeba zewnętrznych narzędzi** (`ipmitool`/`ipmiutil`) ani **żadnych
natywnych dodatków**. Działa z każdym BMC zgodnym z IPMI 2.0 (Supermicro,
Intel, ASRock Rack, …).

- **Producent:** Intel · **Produkt:** IPMI
- **Id modułu:** `intel-ipmi`
- **Opiekunowie:** [LTT-DEV](https://github.com/ltt-dev) (organizacja) · [Stefan Kowal — @Stefankowal3](https://github.com/Stefankowal3)
- **Licencja:** MIT

### Stworzony dla AV Stumpfl Pixera

Moduł powstał dla serwerów medialnych **AV Stumpfl Pixera** — i na nich został
zweryfikowany end-to-end — a wartości domyślne to ustawienia fabryczne Pixera.
Zna fabryczną regułę hasła Pixera (`Px<LAN1 IP, dopełnione zerami>`, np.
`10.31.98.252 → Px010031098252`) i potrafi wyliczyć hasło z adresu naklejki
LAN1 za Ciebie.

Steruje wyłącznie _zasilaniem_ serwera. Do sterowania _aplikacją_ Pixera (osie
czasu, warstwy itd.) służy osobne połączenie `avstumpfl-pixera` — oba działają
równolegle. Użytkownikom, którzy zaimportowali wcześniejszą paczkę
`avstumpfl-pixera-ipmi`, połączenia migrują się automatycznie (`legacyIds`).

### Instalacja

W Companion: **Connections → Add connection**, wyszukaj **IPMI** (albo
**Pixera**) i dodaj **Intel: IPMI**.

### Konfiguracja

Dodaj połączenie i uzupełnij dane BMC swojego serwera:

- **BMC IP / Hostname** — adres IPMI/BMC serwera.
- **Username / Password** — poświadczenia BMC. Na sprzęcie Pixera wartości
  fabryczne są wstępnie wpisane, a hasło może zostać wyliczone automatycznie.

### Co potrafi

- **Akcje zasilania:** Włącz · Miękkie wyłączenie (ACPI) · Power Down · Power Cycle ·
  Twardy reset · Impuls NMI · łagodny miękki restart.
- **Feedback i zmienne:** bieżący stan zasilania na przycisku, odpytywany z BMC.
- **Presety:** gotowe przyciski do przeciągnięcia wprost na stronę.

### Wsparcie

- Pomoc w aplikacji: **`companion/HELP.md`** (wyświetlana w Companion).
- Zgłoszenia: <https://github.com/bitfocus/companion-module-intel-ipmi/issues>

### Dla deweloperów

Notatki projektowe i szczegóły protokołu znajdują się w
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

```bash
npm install
npm test          # node --test (75 testów)
npm run lint
```

Natywny stos RMCP+ (handshake RAKP, uwierzytelnianie HMAC-SHA1, AES-128-CBC) został
zweryfikowany end-to-end na prawdziwym sprzęcie BMC serwera Pixera.
