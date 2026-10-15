# Fronius Wattpilot for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) external integration for
**Fronius Wattpilot** EV chargers (Wattpilot Home and Go, 11 and 22 kW), over
their **local WebSocket API**: the one the Fronius Solar.wattpilot app uses at
home. No cloud, no Fronius account.

> **Developed without the hardware: feedback welcome.** Written from the
> protocol as documented and implemented by other open-source projects (see
> Credits), and tested against a fake charger speaking that protocol. Please
> open an issue with the integration logs if your charger behaves differently.

Not affiliated with Fronius International GmbH. "Fronius", "Wattpilot",
"Solar.wattpilot" and "Solar.web" are trademarks of their owner.

## What it does

One Gladys device per charger, keyed on its serial number:

- **Charging station state** (Gladys 5.2 `charging-station` features): connector
  (available, occupied, unavailable, faulted) and charging state (charging,
  vehicle connected, paused by the vehicle when the charge is complete, paused
  by the charger, idle), plus **car plugged in**;
- **power** (total and per phase), **current** per phase, **session energy**,
  **total energy** as an index (Gladys' energy monitoring computes the
  consumption and its cost), **temperature**, **error** in words, **online**;
- **commands**: charging current (6 A to 16 or 32 A, within the limit set in
  the app), **charging mode** (Default, Eco, Next Trip) and **charge override**
  (follow the mode, forced charge, forced stop).

Plus a **dashboard widget** (state, power, session energy, current, and charge /
stop / auto / settings buttons), a **"charge finished" scene trigger** with the
energy of the session, two **scene actions** (charging mode, override), and a
**Test the connection** button in the Configuration screen.

Solar charging (the settings of the Eco and Next Trip modes) stays in the
Solar.wattpilot app and Solar.web: this integration only switches between the
modes. The cable lock and the RFID cards are deliberately not exposed.

The full user documentation, in four languages, is in [`docs/`](docs/en.md):
[English](docs/en.md), [Français](docs/fr.md), [Deutsch](docs/de.md),
[Español](docs/es.md).

## Requirements

- A Fronius Wattpilot Home or Go on your Wi-Fi, and its **password** (the one
  chosen in the Solar.wattpilot app). The Wattpilot Flex should work (its
  bcrypt password check is implemented) but is untested.
- A fixed IP address for the charger (DHCP reservation in the router).
- Gladys **5.2.0** or later (the widget's settings button opens a form).

## Installation

In Gladys: **Integrations → Install from GitHub**, enter
`https://github.com/guim31/gladys-wattpilot`, then open the Configuration tab,
enter the charger's IP address and password, and add the device from the
Discovery tab.

## How it works

- One WebSocket connection to `ws://<charger>/ws`: `hello`, a challenge
  answered with the password hashed with the serial number (PBKDF2-SHA512, or
  bcrypt on the Flex), then the full status, then the changes the charger
  pushes (`deltaStatus`). Commands are `setValue` messages, signed with an
  HMAC when the charger is `secured`. Nothing is polled.
- The charger pushes its measures several times a second while charging. The
  integration publishes them on its own timer (10 s to 1 min, 15 s by
  default), at once for what a user acts on (car state, mode, current,
  override, error), and only what changed, with every value sent again every
  6 hours. Gladys' own poll (unreliable for external devices,
  GladysAssistant/Gladys#3198) is kept as a fallback.
- Reconnection after 5 s, 10 s, 30 s, then every minute; every 10 minutes
  after a refused password. A silent charger is pinged, and dropped if it does
  not answer.
- Only the status keys the integration uses are kept: the charger's full
  status also carries its go-e cloud API key and Wi-Fi details, which never
  reach the memory nor the logs.
- Logs stay quiet: nothing at info level for a normal cycle, one line when the
  charger is lost and one when it is back. `LOG_LEVEL=debug` shows every
  change. The password never appears in the logs.

## Limits

- One charger per Gladys.
- Feature names and the maximum current are fixed when the device is added.
- No RFID cards, schedules, cable lock, phase switching, solar or price
  settings.
- Not tested on real hardware yet.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
WATTPILOT_PASSWORD=... node scripts/probe.mjs 192.0.2.10   # read-only check of a real charger
```

The probe connects, authenticates, reads the full status, listens a few
seconds to the pushed changes and pings the charger; it never sends a command
and prints nothing personal (serial masked, no name, no password).

The tests run against a fake Wattpilot (a real WebSocket server checking the
authentication hash and the HMAC, `test/helpers/`) and the SDK's fake Gladys,
on fixtures described in
[`test/fixtures/wattpilot/README.md`](test/fixtures/wattpilot/README.md). The
password hashes are checked against values computed with the Python reference
implementations. `test/gladys-rules.test.js` checks every device against the
feature table of the Gladys core. Project rules: [`CLAUDE.md`](CLAUDE.md).

Releases go through **Actions → Release** (version bump, changelog, multi-arch
image on `ghcr.io`, GitHub Release): never edit the version by hand.

## Credits

- [wattpilot](https://github.com/joscha82/wattpilot) by joscha82 (MIT): the
  WebSocket protocol, the authentication, the documentation of the keys
  (`API.md`, `wattpilot.yaml`) and the documented status used as a test
  fixture.
- [wattpilot-HA](https://github.com/mk-maddin/wattpilot-HA) by mk-maddin
  (Apache-2.0), the Home Assistant integration: the bcrypt authentication of
  the Wattpilot Flex, the reconnection behaviour, the current bounds per
  variant.
- [wattpilot](https://github.com/mabunixda/wattpilot) (Go) by mabunixda
  (Apache-2.0): a third implementation of the authentication, used to
  cross-check it.
- [bcrypt.js](https://github.com/dcodeIO/bcrypt.js) (BSD-3-Clause) and
  [ws](https://github.com/websockets/ws) (MIT).
- [Gladys Assistant](https://github.com/GladysAssistant/Gladys) and its
  [integration SDK](https://github.com/GladysAssistant/integration-sdk-js).

## License

[Apache-2.0](LICENSE)
