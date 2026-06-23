<p align="center">
  <img src="assets/ltt-dev-logo.png" alt="LTT-DEV" width="200" />
</p>

# Deployment & Installation Guide / Wdrożenie i instalacja

Developed by **LTT-DEV**. · _English below · [Polski poniżej](#polski)_

---

## English

How to get the `avstumpfl-pixera-ipmi` module running in Bitfocus **Companion 4**.
There are two ways to install it; pick one.

- **A. Import the packaged `.tgz`** — for normal use on any Companion 4 machine.
- **B. Developer modules path** — for editing the source and hot-reloading.

A printable, worked walkthrough (with the example server) is in
[`docs/IMPORT-AND-USAGE.pdf`](IMPORT-AND-USAGE.pdf).

### Target environment

- **Bitfocus Companion 4.x** (this module declares `runtime.type: node22`).
- `@companion-module/base` **1.14.x** (the version shipped Companion 4 modules use).
  `base` 2.x is a different major that removed `runEntrypoint`; do not use it here.
- Network: the **Companion host** must reach the BMC over **UDP 623** (see §C).

### A. Install by importing the package

1. Build the package (or use the one in `dist/`):

   ```bash
   npm install
   npm test                 # 75 passing
   npx companion-module-build   # → dist/avstumpfl-pixera-ipmi-<ver>.tgz
   ```

   > Build from a **space-free path** — `companion-module-build` fails on a path
   > containing a space.

2. In the Companion GUI → **Modules** (or _Import custom module_) → **Import** →
   select `dist/avstumpfl-pixera-ipmi-<ver>.tgz`.

3. If a previous build is already installed, **uninstall it first** (a duplicate
   id/version is rejected on import). Bump the version when shipping a new build so
   re-imports are unambiguous.

4. **Connections → Add connection →** search **"Pixera IPMI"**
   ("AV Stumpfl: Pixera IPMI") → add and configure (see §C / `HELP.md`).

This module's id (`avstumpfl-pixera-ipmi`) is distinct from the official
`avstumpfl-pixera`, so it appears as its own entry — no version clash with the
built-in Pixera module.

### B. Install via the Developer modules path (for development)

Loads the raw source and hot-reloads on change — no rebuild/import cycle.

1. Keep the project in a **real directory with no spaces in the path**, e.g.
   `~/companion-dev-modules/avstumpfl-pixera-ipmi`, with `node_modules` installed
   (`npm install`).

   > Important: Companion runs developer modules under Node's permission model
   > (`node --permission --allow-fs-read=<module dir> …`). The module files must
   > live **inside** that directory as real files. A **symlink** pointing to a
   > folder elsewhere is denied (`Access to this API has been restricted`) and the
   > instance restart-loops. Move the project; don't symlink it.

2. Companion GUI → **Settings** → enable **Developer modules** and set
   **Developer modules path** to the _parent_ folder
   (`~/companion-dev-modules`). Companion scans it for module subfolders.

   The same can be set headlessly in Companion's `config.json`:

   ```json
   "enable_developer": true,
   "dev_modules_path": "/Users/<you>/companion-dev-modules"
   ```

   (restart Companion after editing the file).

3. The log shows `Found 1 extra modules … AV Stumpfl: Pixera IPMI (Dev)`.
   Add a connection and pick the **(Dev)** entry.

4. Edit code → in **Connections** use **⋮ → Reload** (Companion also auto-reloads
   on file change). No re-import.

### C. Configure a connection

Minimum fields (full list in `companion/HELP.md`):

| Field             | Value                                                               |
| ----------------- | ------------------------------------------------------------------- |
| BMC IP / Hostname | the BMC address (Pixera factory pool `10.41.x.x`) — no port here    |
| BMC Port          | `623`                                                               |
| IPMI Username     | `ADMIN` (factory) or your account                                   |
| IPMI Password     | your password, **or** leave blank and set _LAN1 sticker IP_         |
| LAN1 sticker IP   | original `10.31.x.x` sticker address → derives the factory password |
| Cipher Suite      | `3`                                                                 |
| Privilege         | `ADMINISTRATOR`                                                     |

Enter the address as a plain host/IP (the field no longer enforces a regex, but
**don't** include a port or trailing spaces). On save the connection should reach
**OK** and report `ipmi_power_state`. If it stays "BMC unreachable", that is a
network reachability problem, not a config error.

#### Network & security

- The Companion host must have a route to the BMC subnet over **UDP 623**.
  ICMP `ping` is _not_ a reliable test — a firewall can allow ping but block 623
  (or vice-versa). The real check is an RMCP presence ping / session on 623.
- Keep IPMI on a dedicated, isolated management VLAN; never expose it publicly.
- `ADMINISTRATOR` is required for power control; use a minimal `OPERATOR` account
  if the BMC allows it.
- The password is stored in the connection config; the module never logs it and
  never exposes it as a variable or in exports.

### D. Hardware validation

The native RMCP+ stack has been confirmed against a real Pixera BMC: presence ping
→ Open Session → RAKP 1-4 (HMAC-SHA1 + AES-CBC-128) → Get Chassis Status returned
the live power state. For an independent ground-truth reference you can compare
with `ipmiutil` from the same network:

```bash
ipmiutil health -N <BMC_IP> -U <user> -P <pass> -F lan2 -V 4
ipmiutil power  -o -N <BMC_IP> -U <user> -P <pass> -F lan2 -V 4   # soft restart
```

### E. Repository and Companion availability

This is maintained as the `avstumpfl-pixera-ipmi` module under `ltt-dev`. It is
intentionally separate from the official Pixera TCP-API module so it can be
installed and updated independently.

To make it downloadable from inside Companion (Connections → Add → search), it goes
through the official Bitfocus inclusion process:

1. **Repository** — official store modules live under the `bitfocus` GitHub org.
   Request one in the Bitfocus Slack `#module-development` channel with your GitHub
   username and the `manufacturer-product` name (`avstumpfl-pixera-ipmi`). Bitfocus
   provisions `bitfocus/companion-module-avstumpfl-pixera-ipmi` and grants you access.
2. **Push** — push the code and an annotated version tag (`vMAJOR.MINOR.PATCH`, e.g.
   `v1.0.0`) to that repository.
3. **Submit** — log in to the Bitfocus Developer Portal (developer.bitfocus.io) with
   GitHub → _My Connections_ → select the module → _Submit Version_ → pick the git tag
   → (optional) _Is Prerelease_ → submit.
4. **Review** — volunteers review; once approved the version is immediately available
   to all Companion v4.0.0+ users in-app.

The `ltt-dev` repository stays the maintainer's source/mirror; `maintainers` in
`companion/manifest.json` are **LTT-DEV** and **Stefan Kowal**.

---

## Polski

Jak uruchomić moduł `avstumpfl-pixera-ipmi` w Bitfocus **Companion 4**. Są dwa
sposoby instalacji; wybierz jeden.

- **A. Import spakowanego `.tgz`** — do normalnego użycia na dowolnej maszynie Companion 4.
- **B. Ścieżka modułów deweloperskich** — do edycji źródeł i hot-reloadu.

Drukowalny, krok-po-kroku przewodnik (na przykładowym serwerze) jest w
[`docs/IMPORT-AND-USAGE.pdf`](IMPORT-AND-USAGE.pdf).

### Środowisko docelowe

- **Bitfocus Companion 4.x** (moduł deklaruje `runtime.type: node22`).
- `@companion-module/base` **1.14.x** (wersja używana przez moduły Companion 4).
  `base` 2.x to inny major, który usunął `runEntrypoint`; nie używaj go tutaj.
- Sieć: **host Companion** musi osiągać BMC po **UDP 623** (patrz §C).

### A. Instalacja przez import paczki

1. Zbuduj paczkę (lub użyj tej z `dist/`):

   ```bash
   npm install
   npm test                 # 75 przechodzi
   npx companion-module-build   # → dist/avstumpfl-pixera-ipmi-<wersja>.tgz
   ```

   > Buduj ze **ścieżki bez spacji** — `companion-module-build` zawodzi przy ścieżce
   > zawierającej spację.

2. W GUI Companion → **Modules** (lub _Import custom module_) → **Import** →
   wybierz `dist/avstumpfl-pixera-ipmi-<wersja>.tgz`.

3. Jeśli poprzedni build jest już zainstalowany, **najpierw go odinstaluj**
   (duplikat id/wersji jest odrzucany przy imporcie). Podbijaj wersję przy nowym
   buildzie, aby ponowne importy były jednoznaczne.

4. **Connections → Add connection →** wyszukaj **„Pixera IPMI"**
   („AV Stumpfl: Pixera IPMI") → dodaj i skonfiguruj (patrz §C / `HELP.md`).

Id tego modułu (`avstumpfl-pixera-ipmi`) jest różne od oficjalnego
`avstumpfl-pixera`, więc pojawia się jako osobny wpis — bez konfliktu wersji z
wbudowanym modułem Pixera.

### B. Instalacja przez ścieżkę modułów deweloperskich (do developmentu)

Ładuje surowe źródła i przeładowuje na bieżąco przy zmianie — bez cyklu
rebuild/import.

1. Trzymaj projekt w **prawdziwym katalogu bez spacji w ścieżce**, np.
   `~/companion-dev-modules/avstumpfl-pixera-ipmi`, z zainstalowanym `node_modules`
   (`npm install`).

   > Ważne: Companion uruchamia moduły deweloperskie w modelu uprawnień Node
   > (`node --permission --allow-fs-read=<katalog modułu> …`). Pliki modułu muszą
   > leżeć **wewnątrz** tego katalogu jako prawdziwe pliki. **Symlink** wskazujący
   > na folder gdzie indziej jest odrzucany (`Access to this API has been restricted`)
   > i instancja wpada w pętlę restartów. Przenieś projekt; nie symlinkuj go.

2. GUI Companion → **Settings** → włącz **Developer modules** i ustaw
   **Developer modules path** na folder _nadrzędny_
   (`~/companion-dev-modules`). Companion skanuje go w poszukiwaniu podfolderów modułów.

   To samo można ustawić bezgłowo w `config.json` Companion:

   ```json
   "enable_developer": true,
   "dev_modules_path": "/Users/<ty>/companion-dev-modules"
   ```

   (po edycji pliku zrestartuj Companion).

3. Log pokazuje `Found 1 extra modules … AV Stumpfl: Pixera IPMI (Dev)`.
   Dodaj połączenie i wybierz wpis **(Dev)**.

4. Edytuj kod → w **Connections** użyj **⋮ → Reload** (Companion przeładowuje też
   automatycznie przy zmianie pliku). Bez ponownego importu.

### C. Konfiguracja połączenia

Pola minimalne (pełna lista w `companion/HELP.md`):

| Pole              | Wartość                                                              |
| ----------------- | ------------------------------------------------------------------- |
| BMC IP / Hostname | adres BMC (fabryczna pula Pixera `10.41.x.x`) — bez portu           |
| BMC Port          | `623`                                                               |
| IPMI Username     | `ADMIN` (fabryczny) lub Twoje konto                                 |
| IPMI Password     | Twoje hasło, **albo** zostaw puste i ustaw _LAN1 sticker IP_        |
| LAN1 sticker IP   | oryginalny adres z naklejki `10.31.x.x` → wylicza hasło fabryczne   |
| Cipher Suite      | `3`                                                                 |
| Privilege         | `ADMINISTRATOR`                                                     |

Wpisz adres jako zwykły host/IP (pole nie wymusza już regexa, ale **nie** dodawaj
portu ani spacji na końcu). Po zapisie połączenie powinno osiągnąć **OK** i
raportować `ipmi_power_state`. Jeśli zostaje „BMC unreachable", to problem
osiągalności sieciowej, a nie błąd konfiguracji.

#### Sieć i bezpieczeństwo

- Host Companion musi mieć trasę do podsieci BMC po **UDP 623**. ICMP `ping` _nie_
  jest wiarygodnym testem — firewall może przepuszczać ping, ale blokować 623
  (lub odwrotnie). Realnym testem jest RMCP presence ping / sesja na 623.
- Trzymaj IPMI w dedykowanym, izolowanym VLAN-ie zarządzania; nigdy nie wystawiaj
  go publicznie.
- `ADMINISTRATOR` jest wymagany do sterowania zasilaniem; użyj minimalnego konta
  `OPERATOR`, jeśli BMC na to pozwala.
- Hasło jest przechowywane w konfiguracji połączenia; moduł nigdy go nie loguje ani
  nie udostępnia jako zmiennej czy w eksportach.

### D. Walidacja sprzętowa

Natywny stos RMCP+ został potwierdzony na prawdziwym BMC Pixera: presence ping →
Open Session → RAKP 1-4 (HMAC-SHA1 + AES-CBC-128) → Get Chassis Status zwrócił
bieżący stan zasilania. Jako niezależny punkt odniesienia możesz porównać z
`ipmiutil` z tej samej sieci:

```bash
ipmiutil health -N <BMC_IP> -U <user> -P <pass> -F lan2 -V 4
ipmiutil power  -o -N <BMC_IP> -U <user> -P <pass> -F lan2 -V 4   # miękki restart
```

### E. Repozytorium i dostępność w Companion

Moduł jest utrzymywany jako `avstumpfl-pixera-ipmi` w `ltt-dev`. Jest celowo
oddzielony od oficjalnego modułu Pixera (API TCP), aby można go instalować i
aktualizować niezależnie.

Aby był pobieralny z wnętrza Companion (Connections → Add → wyszukaj), przechodzi
przez oficjalny proces włączenia Bitfocus:

1. **Repozytorium** — moduły sklepowe żyją w organizacji `bitfocus` na GitHub.
   Poproś o nie na kanale Slack Bitfocus `#module-development`, podając swoją nazwę
   użytkownika GitHub i nazwę `producent-produkt` (`avstumpfl-pixera-ipmi`). Bitfocus
   zakłada `bitfocus/companion-module-avstumpfl-pixera-ipmi` i nadaje dostęp.
2. **Push** — wypchnij kod i adnotowany tag wersji (`vMAJOR.MINOR.PATCH`, np.
   `v1.0.0`) do tego repozytorium.
3. **Zgłoszenie** — zaloguj się do Bitfocus Developer Portal (developer.bitfocus.io)
   przez GitHub → _My Connections_ → wybierz moduł → _Submit Version_ → wskaż tag git
   → (opcjonalnie) _Is Prerelease_ → wyślij.
4. **Review** — wolontariusze przeglądają; po akceptacji wersja jest natychmiast
   dostępna dla wszystkich użytkowników Companion v4.0.0+ w aplikacji.

Repozytorium `ltt-dev` pozostaje źródłem/mirrorem maintainera; `maintainers` w
`companion/manifest.json` to **LTT-DEV** i **Stefan Kowal**.
