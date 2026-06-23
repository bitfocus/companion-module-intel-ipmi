<p align="center">
  <img src="docs/assets/ltt-dev-logo.png" alt="LTT-DEV" width="220" />
</p>

# AV Stumpfl Pixera IPMI

Developed by **LTT-DEV**. · _English below · [Polski poniżej](#polski)_

---

## English

Power control for **AV Stumpfl Pixera** media servers from Bitfocus Companion,
over the server's built-in BMC using native **IPMI v2.0 (RMCP+)**.

Turn a Pixera server on, shut it down, power-cycle or reset it, and see its live
power state on a button — without any extra software. The IPMI session is
implemented directly in the module, so there are **no external tools**
(`ipmitool`/`ipmiutil`) and **no native add-ons** to install.

This module controls server *power* only. To control the Pixera *application*
(timelines, layers, etc.) use the separate `avstumpfl-pixera` connection — the
two work side by side.

- **Manufacturer:** AV Stumpfl · **Product:** Pixera IPMI
- **Module id:** `avstumpfl-pixera-ipmi`
- **Maintainers:** LTT-DEV · Stefan Kowal
- **License:** MIT

### Installation

Inside Companion: **Connections → Add connection**, search for **Pixera IPMI**
(manufacturer *AV Stumpfl*), and add it.

### Configuration

Add the connection and fill in the BMC details of your Pixera server:

- **Target IP** — the server's IPMI/BMC address.
- **Username / Password** — BMC credentials. Pixera factory defaults are
  pre-filled and editable; the default password follows the
  `Px<LAN1 IP, zero-padded>` rule (e.g. `10.31.98.252 → Px010031098252`), which
  the module can derive for you.

### What it does

- **Power actions:** On · Soft Shutdown (ACPI) · Power Down · Power Cycle ·
  Hard Reset · Pulse NMI · graceful Soft Restart.
- **Feedback & variables:** live power state on the button, polled from the BMC.
- **Presets:** ready-to-use buttons you can drag straight onto a page.

### Support

- In-app help: **`companion/HELP.md`** (shown in Companion).
- Import & usage guide (EN/PL): **[`docs/IMPORT-AND-USAGE.pdf`](docs/IMPORT-AND-USAGE.pdf)**.
- Issues: <https://github.com/ltt-dev/companion-module-avstumpfl-pixera-ipmi/issues>

### For developers

Design notes, protocol details and the test/validation report live in
[`docs/`](docs/) — see `ARCHITECTURE.md`, `DEPLOYMENT.md` and `REVIEW.md`.

```bash
npm install
npm test          # node --test (75 tests)
npm run lint
```

The native RMCP+ stack (RAKP handshake, HMAC-SHA1 auth, AES-128-CBC) has been
validated end to end against real Pixera BMC hardware.

---

## Polski

Sterowanie zasilaniem serwerów medialnych **AV Stumpfl Pixera** z poziomu Bitfocus
Companion, poprzez wbudowany w serwer kontroler BMC, natywnym protokołem
**IPMI v2.0 (RMCP+)**.

Włącz serwer Pixera, wyłącz go programowo, zrestartuj zasilanie lub wykonaj reset,
i obserwuj jego bieżący stan zasilania na przycisku — bez żadnego dodatkowego
oprogramowania. Sesja IPMI jest zaimplementowana bezpośrednio w module, więc
**nie potrzeba zewnętrznych narzędzi** (`ipmitool`/`ipmiutil`) ani **żadnych
natywnych dodatków**.

Ten moduł steruje wyłącznie *zasilaniem* serwera. Do sterowania *aplikacją* Pixera
(osie czasu, warstwy itd.) służy osobne połączenie `avstumpfl-pixera` — oba działają
równolegle.

- **Producent:** AV Stumpfl · **Produkt:** Pixera IPMI
- **Id modułu:** `avstumpfl-pixera-ipmi`
- **Opiekunowie:** LTT-DEV · Stefan Kowal
- **Licencja:** MIT

### Instalacja

W Companion: **Connections → Add connection**, wyszukaj **Pixera IPMI**
(producent *AV Stumpfl*) i dodaj.

### Konfiguracja

Dodaj połączenie i uzupełnij dane BMC swojego serwera Pixera:

- **Target IP** — adres IPMI/BMC serwera.
- **Username / Password** — poświadczenia BMC. Domyślne wartości fabryczne Pixera są
  wstępnie wpisane i edytowalne; domyślne hasło wynika z reguły
  `Px<LAN1 IP, dopełnione zerami>` (np. `10.31.98.252 → Px010031098252`), którą moduł
  potrafi wyliczyć za Ciebie.

### Co potrafi

- **Akcje zasilania:** Włącz · Miękkie wyłączenie (ACPI) · Power Down · Power Cycle ·
  Twardy reset · Impuls NMI · łagodny miękki restart.
- **Feedback i zmienne:** bieżący stan zasilania na przycisku, odpytywany z BMC.
- **Presety:** gotowe przyciski do przeciągnięcia wprost na stronę.

### Wsparcie

- Pomoc w aplikacji: **`companion/HELP.md`** (wyświetlana w Companion).
- Instrukcja importu i obsługi (EN/PL): **[`docs/IMPORT-AND-USAGE.pdf`](docs/IMPORT-AND-USAGE.pdf)**.
- Zgłoszenia: <https://github.com/ltt-dev/companion-module-avstumpfl-pixera-ipmi/issues>

### Dla deweloperów

Notatki projektowe, szczegóły protokołu oraz raport z testów/walidacji znajdują się
w [`docs/`](docs/) — patrz `ARCHITECTURE.md`, `DEPLOYMENT.md` i `REVIEW.md`.

```bash
npm install
npm test          # node --test (75 testów)
npm run lint
```

Natywny stos RMCP+ (handshake RAKP, uwierzytelnianie HMAC-SHA1, AES-128-CBC) został
zweryfikowany end-to-end na prawdziwym sprzęcie BMC serwera Pixera.
