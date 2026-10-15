# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Stored**: nothing in `/data`. The configuration (charger address,
  password, refresh interval, language) is kept by Gladys; the password is a
  `secret` field.
- **Secrets**: the password of the charger never leaves the integration as
  such: it is hashed with the serial number (PBKDF2-SHA512, or bcrypt on the
  Wattpilot Flex) to answer the charger's challenge and to sign the commands
  (HMAC-SHA256). Neither the password nor its hash is written to the logs. The
  charger's status also holds its go-e cloud API key and Wi-Fi details: the
  integration drops them on receipt.
- **Network**: one WebSocket connection, `ws://` on port 80, to the address
  the user entered (the Wattpilot offers no TLS locally). Nothing else: no
  cloud, no other host.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the Wattpilot chargers, their firmware and the Fronius services.
