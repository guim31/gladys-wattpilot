// -----------------------------------------------------------------------------
// A test world: a fake Wattpilot, the SDK's fake Gladys, and the very same
// wiring as index.js (src/app.js). The integration's own logs are silent
// unless LOG_LEVEL is set (LOG_LEVEL=debug npm test shows them).
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { openSession } from '../../src/wattpilot/session.js';
import { FIXTURES, PASSWORD, loadFixture, startFakeWattpilot } from './fakeWattpilot.js';

process.env.LOG_LEVEL ??= 'silent';

/** Short timeouts and retries: the tests do not wait for a real network. */
export const TEST_LINK = { backoffMs: [20, 40], authRetryMs: 200, silenceMs: 400 };
export const testConnect = (options) => openSession({ ...options, timeoutMs: 1500 });

/**
 * @param {object} [options]
 * @param {string|null} [options.fixture] key of FIXTURES (null: no charger)
 * @param {object} [options.config] extra config values
 * @param {boolean} [options.create] add the discovered device to Gladys
 * @param {boolean} [options.timers]
 * @param {object[]} [options.devices] devices already created in Gladys
 */
export async function createWorld({
  fixture = 'charging',
  config = {},
  create = true,
  timers = false,
  devices = [],
} = {}) {
  const charger = fixture ? await startFakeWattpilot(loadFixture(FIXTURES[fixture])) : null;
  const gladys = createFakeGladys({
    config: { host: charger?.host ?? '', password: PASSWORD, ...config },
    devices,
  });
  const hub = registerHandlers(gladys, {
    connect: testConnect,
    linkOptions: TEST_LINK,
    timers,
  });
  await gladys.connect();
  if (create) {
    for (const device of gladys.fake.discoveredDevices) {
      await gladys.fake.deviceCreated(device);
    }
  }
  const world = {
    gladys,
    hub,
    /** The fake charger (a test may replace it by a new one). */
    charger,
    fake: gladys.fake,
    device: () => gladys.fake.discoveredDevices[0],
    async stop() {
      hub.stop();
      await gladys.disconnect();
      await world.charger?.close();
    },
  };
  return world;
}

/** The last state Gladys received for a feature key of a charger. */
export function lastState(world, serial, key) {
  return world.fake.lastState(`${world.gladys.externalIds('charger', serial).feature(key)}`);
}

/** Capture the log lines (console, as the SDK logger writes) at a level. */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.mock.method(console, 'warn', record);
  t.mock.method(console, 'info', record);
  t.mock.method(console, 'debug', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}

/** Wait for a condition (real time: sockets need it). */
export async function waitFor(condition, what = 'condition', timeoutMs = 3000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${what}`);
}
