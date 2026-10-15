#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Read-only probe of a real Wattpilot, with the integration's own client.
//
//   node scripts/probe.mjs <ip[:port]>                       hello only
//   WATTPILOT_PASSWORD=... node scripts/probe.mjs <ip[:port]>  full status
//   WATTPILOT_PASSWORD=... node scripts/probe.mjs <ip> --listen 30
//
// Opens the WebSocket, authenticates when a password is given (from the
// environment, never the command line), waits for the full status, then
// listens a few seconds to measure how often the charger pushes its changes
// and whether it answers a WebSocket ping. It never sends a command.
//
// Prints what the integration would read and show, without the password, the
// full serial number, the friendly name or anything about the network. Exit
// code 0 when the charger answered (and accepted the password), 1 otherwise.
// -----------------------------------------------------------------------------

import { parseHost } from '../src/config.js';
import { hashTypeOf } from '../src/wattpilot/auth.js';
import { allowedMaxCurrent, hardwareMaxCurrent, readings } from '../src/wattpilot/model.js';
import { STATUS_KEYS, WattpilotSession } from '../src/wattpilot/session.js';

function usage() {
  console.error('usage: [WATTPILOT_PASSWORD=<password>] node scripts/probe.mjs <ip[:port]>');
  console.error('       [--listen <seconds>]');
  process.exit(2);
}

const args = process.argv.slice(2);
const { host } = parseHost(args[0] ?? '');
if (!host) {
  usage();
}
const listenIndex = args.indexOf('--listen');
const listenSeconds = listenIndex >= 0 ? Number(args[listenIndex + 1]) : 10;
if (!Number.isFinite(listenSeconds) || listenSeconds < 0 || listenSeconds > 600) {
  usage();
}
const password = process.env.WATTPILOT_PASSWORD ?? '';

const mask = (serial) => `${String(serial).slice(0, 2)}******`;

function describeHello(hello) {
  return {
    serial: mask(hello.serial),
    device_type: hello.devicetype,
    firmware: hello.version,
    secured: hello.secured,
    password_hash: hashTypeOf(hello),
  };
}

const started = Date.now();
const session = new WattpilotSession({ host, password, authenticate: password !== '' });
try {
  await session.open();
} catch (err) {
  console.log(
    JSON.stringify(
      {
        error: err.kind ?? 'unexpected',
        message: err.message,
        hello: session.hello ? describeHello(session.hello) : null,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

if (password === '') {
  console.log(
    JSON.stringify(
      {
        answered_in_ms: Date.now() - started,
        hello: describeHello(session.hello),
        note: 'no WATTPILOT_PASSWORD: stopped after hello',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const readyInMs = Date.now() - started;
const deltas = { count: 0, keys: new Set(), maxGapMs: 0 };
let last = Date.now();
let pong = false;
session.on('delta', (keys) => {
  deltas.count += 1;
  keys.forEach((key) => deltas.keys.add(key));
});
session.on('alive', () => {
  const now = Date.now();
  deltas.maxGapMs = Math.max(deltas.maxGapMs, now - last);
  last = now;
});
session.ws.on('pong', () => {
  pong = true;
});
session.ping();
await new Promise((resolve) => setTimeout(resolve, listenSeconds * 1000));
session.close();

const { status } = session;
console.log(
  JSON.stringify(
    {
      ready_in_ms: readyInMs,
      hello: describeHello(session.hello),
      model: { typ: status.typ, variant_kw: status.var, firmware: status.fwv },
      friendly_name_set: typeof status.fna === 'string' && status.fna.trim() !== '',
      keys_missing: STATUS_KEYS.filter((key) => !(key in status)),
      current_range_a: [6, hardwareMaxCurrent(status)],
      current_allowed_a: allowedMaxCurrent(status),
      listened_s: listenSeconds,
      pushes: {
        delta_messages: deltas.count,
        keys_changed: [...deltas.keys].sort(),
        longest_silence_ms: deltas.maxGapMs,
      },
      answers_ping: pong,
      raw: {
        car: status.car,
        alw: status.alw,
        frc: status.frc,
        lmo: status.lmo,
        err: status.err,
        amp: status.amp,
        ama: status.ama,
        nrg: status.nrg,
        wh: status.wh,
        eto: status.eto,
        tma: status.tma,
      },
      gladys: readings(status),
    },
    null,
    2,
  ),
);
