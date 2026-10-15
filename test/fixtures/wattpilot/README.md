# Wattpilot fixtures

What a Wattpilot sends after the authentication: its `hello` message and its
full status (the integration keeps only the keys of `STATUS_KEYS`, see
`src/wattpilot/session.js`). The fake charger (`test/helpers/fakeWattpilot.js`)
sends the status in two `fullStatus` messages (`partial: true`, then
`partial: false`), as the charger does.

| File                                | Origin                                                                                                                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `home-11-idle-36.3.json`            | The example values documented for a real Wattpilot (firmware 36.3) in `src/wattpilot/ressources/wattpilot.yaml` of [joscha82/wattpilot](https://github.com/joscha82/wattpilot) (MIT, © 2022 joscha82); serial invented, cloud key and Wi-Fi replaced. |
| `home-22-charging-eco-38.5.json`    | Built for these tests from the same key documentation: a 22 kW Home charging on three phases at 16 A in Eco mode.                                                                                                                                     |
| `go-22-complete-nexttrip-40.7.json` | Built: a 22 kW Go in Next Trip mode, charge complete, a temperature sensor reading `null`, not `secured`.                                                                                                                                             |
| `home-11-error-overtemp-38.5.json`  | Built: an 11 kW Home in error 13 (overheating), charge forced off.                                                                                                                                                                                    |
| `flex-11-waiting-42.2.json`         | Built: a Wattpilot Flex (`hash: "bcrypt"` in hello, as the Home Assistant integration of mk-maddin expects it), waiting for the sun in Eco mode.                                                                                                      |

Serial numbers are invented, the cloud API key is a placeholder and the
addresses come from 192.0.2.0/24. No real network detail.
