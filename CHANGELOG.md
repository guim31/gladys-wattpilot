# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-15

### Added

- Fronius Wattpilot chargers (Home and Go, 11 and 22 kW) over their local
  WebSocket API, with the password of the charger: one device with the
  charging station state (connector, charging state), car plugged in, total
  and per-phase power, per-phase current, session energy, total energy for
  Gladys' energy monitoring, temperature, error and online status.
- Commands: charging current, charging mode (Default, Eco, Next Trip) and
  charge override (follow the mode, forced charge, forced stop).
- The states follow the charger's pushes: measures at the chosen refresh
  interval, a change of car state, mode, current, override or error at once.
- Automatic reconnection when the charger drops off the network, slower after
  a refused password.
- A dashboard widget with the state, power, session energy and current, and
  charge, stop, auto and settings buttons (Gladys 5.2.0 or later).
- A "Wattpilot charge finished" scene trigger with the energy of the session,
  and the "Set the Wattpilot charging mode" and "Force or stop the Wattpilot
  charge" scene actions.
- A "Test the connection" button that says whether the charger is connected,
  or why not (address, password...).
- Wattpilot Flex support (bcrypt password check), untested on a real Flex.
- Documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-wattpilot/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-wattpilot/releases/tag/v1.0.1
