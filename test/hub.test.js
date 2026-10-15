// -----------------------------------------------------------------------------
// End to end: a fake Wattpilot (a real WebSocket server), the SDK's fake
// Gladys, and the wiring of index.js. What a user sees: the device, its
// states, the commands, the "charge finished" trigger, a charger that goes
// offline, the logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';
import { CAR, CHARGING_STATE, CONNECTOR_STATUS } from '../src/wattpilot/model.js';
import { FEATURE } from '../src/devices.js';
import { HEARTBEAT_MS, SCENE_TRIGGER } from '../src/hub.js';
import { FIXTURES, PASSWORD, loadFixture, startFakeWattpilot } from './helpers/fakeWattpilot.js';
import {
  TEST_LINK,
  captureLogs,
  createWorld,
  lastState,
  testConnect,
  waitFor,
} from './helpers/world.js';

const GARAGE = '90000022';
const featureOf = (device, key) => device.features.find((f) => f.external_id.endsWith(`:${key}`));
const settle = async (world) => {
  await new Promise((resolve) => setTimeout(resolve, 30));
  await world.hub.idle();
};

test('one device per charger, named as in the app, keyed on the serial', async (t) => {
  const world = await createWorld({ fixture: 'charging' });
  t.after(() => world.stop());
  const device = world.device();
  assert.equal(world.fake.discoveredDevices.length, 1);
  assert.equal(device.name, 'Garage');
  assert.equal(device.external_id, `ext:test-integration:charger:${GARAGE}`);
  assert.equal(device.model, 'Wattpilot 22 kW');
  assert.deepEqual(device.params, [
    { name: 'SERIAL', value: GARAGE },
    { name: 'HOST', value: world.charger.host },
    { name: 'DEVICE_TYPE', value: 'wattpilot' },
  ]);
  assert.equal(featureOf(device, FEATURE.TARGET_CURRENT).max, 32);
  assert.equal(featureOf(device, FEATURE.POWER).name, 'Puissance de charge', 'French by default');
  assert.deepEqual(
    featureOf(device, FEATURE.CHARGING_MODE).supported_options.map((o) => [o.value, o.label]),
    [
      ['default', 'Standard'],
      ['eco', 'Éco'],
      ['next_trip', 'Next Trip'],
    ],
  );
  assert.deepEqual(
    featureOf(device, FEATURE.FORCE_MODE).supported_options.map((o) => o.value),
    ['neutral', 'on', 'off'],
  );
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  assert.equal(world.charger.connections, 1, 'one connection to the charger');
});

test('a device added to Gladys gets all its states at once, and the widget a nudge', async (t) => {
  const world = await createWorld({ fixture: 'charging', create: false });
  t.after(() => world.stop());
  assert.equal(world.fake.states.length, 0, 'nothing sent for a device Gladys does not have');
  const refreshesBefore = world.fake.widgetRefreshes.length;
  await world.fake.deviceCreated(world.device());

  assert.equal(lastState(world, GARAGE, FEATURE.CONNECTOR_STATUS), CONNECTOR_STATUS.OCCUPIED);
  assert.equal(lastState(world, GARAGE, FEATURE.CHARGING_STATE), CHARGING_STATE.CHARGING);
  assert.equal(lastState(world, GARAGE, FEATURE.PLUGGED), 1);
  assert.equal(lastState(world, GARAGE, FEATURE.POWER), 11048);
  assert.equal(lastState(world, GARAGE, FEATURE.POWER_L2), 3700);
  assert.equal(lastState(world, GARAGE, FEATURE.CURRENT_L2), 16.1);
  assert.equal(lastState(world, GARAGE, FEATURE.SESSION_ENERGY), 5.32);
  assert.equal(lastState(world, GARAGE, FEATURE.TOTAL_ENERGY), 1234.567);
  assert.equal(lastState(world, GARAGE, FEATURE.TARGET_CURRENT), 16);
  assert.equal(lastState(world, GARAGE, FEATURE.CHARGING_MODE), 'eco');
  assert.equal(lastState(world, GARAGE, FEATURE.FORCE_MODE), 'neutral');
  assert.equal(lastState(world, GARAGE, FEATURE.TEMPERATURE), 31.5);
  assert.equal(lastState(world, GARAGE, FEATURE.ERROR), 'Aucune');
  assert.equal(lastState(world, GARAGE, FEATURE.ONLINE), 1);
  assert.ok(world.fake.widgetRefreshes.length > refreshesBefore);
});

test('the states refresh on the integration timer, without any onPoll from Gladys', async (t) => {
  const world = await createWorld({
    fixture: 'charging',
    timers: true,
    config: { refresh_interval: '10' },
  });
  t.after(() => world.stop());
  // A real 10 s timer is too slow for a test: run the hub's timer faster.
  world.hub.config.refresh_interval = '0.1';
  world.hub.schedule();

  world.charger.push({ nrg: [230, 230, 230, 1, 10, 10, 10, 2300, 2300, 2300, 0, 6900.2] });
  await waitFor(() => lastState(world, GARAGE, FEATURE.POWER) === 6900, 'the new power');
  world.charger.push({ wh: 7000 });
  await waitFor(() => lastState(world, GARAGE, FEATURE.SESSION_ENERGY) === 7, 'the next tick');

  const polls = world.fake.wsMessages.filter((m) => m.type === 'poll');
  assert.equal(polls.length, 0, 'Gladys never polled');
  assert.equal(world.charger.connections, 1);
});

test('measures wait for the timer, what a user acts on goes at once', async (t) => {
  const world = await createWorld({ fixture: 'charging' });
  t.after(() => world.stop());
  world.charger.push({ nrg: [230, 230, 230, 1, 10, 10, 10, 2300, 2300, 2300, 0, 6900.2] });
  await settle(world);
  assert.equal(lastState(world, GARAGE, FEATURE.POWER), 11048, 'power waits for the next tick');

  world.charger.push({ lmo: 3 });
  await settle(world);
  assert.equal(lastState(world, GARAGE, FEATURE.CHARGING_MODE), 'default');
  assert.equal(lastState(world, GARAGE, FEATURE.POWER), 6900, 'sent along');
});

test("the core's onPoll is a fallback: skipped right after a publication, sent when stale", async (t) => {
  let clock = 1_000_000;
  const world = await createWorld({ fixture: 'charging' });
  t.after(() => world.stop());
  world.hub.now = () => clock;
  await world.hub.publishStates();
  world.charger.push({ nrg: [230, 230, 230, 1, 10, 10, 10, 2300, 2300, 2300, 0, 6900.2] });
  await settle(world);

  await world.fake.poll(world.device());
  assert.equal(lastState(world, GARAGE, FEATURE.POWER), 11048, 'published just now: skipped');

  clock += 14000; // 93 % of the 15 s period
  await world.fake.poll(world.device());
  assert.equal(lastState(world, GARAGE, FEATURE.POWER), 6900);
});

test('only the changes are sent, and a stable value again after the heartbeat', async (t) => {
  const world = await createWorld({ fixture: 'charging' });
  t.after(() => world.stop());
  const count = () => world.fake.states.length;

  const afterCreate = count();
  await world.hub.publishStates();
  assert.equal(count(), afterCreate, 'nothing changed, nothing sent');

  world.charger.push({ tma: [33, 29] });
  await settle(world);
  await world.hub.publishStates();
  assert.equal(count(), afterCreate + 1, 'one change, one state');

  assert.ok(HEARTBEAT_MS <= 12 * 60 * 60 * 1000, 'at least every 12 hours');
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + HEARTBEAT_MS + 1000 });
  await world.hub.publishStates();
  assert.ok(count() > afterCreate + 10, 'every value sent again after the heartbeat');
});

test('commands: current, charging mode, override — written, then shown', async (t) => {
  const world = await createWorld({ fixture: 'charging' });
  t.after(() => world.stop());
  const device = world.device();

  assert.deepEqual(
    await world.fake.setValue(device, featureOf(device, FEATURE.TARGET_CURRENT), 20),
    { success: true },
  );
  assert.equal(world.charger.status.amp, 20);
  assert.equal(lastState(world, GARAGE, FEATURE.TARGET_CURRENT), 20);

  await world.fake.setValue(device, featureOf(device, FEATURE.CHARGING_MODE), 'next_trip');
  assert.equal(world.charger.status.lmo, 5);
  assert.equal(lastState(world, GARAGE, FEATURE.CHARGING_MODE), 'next_trip');

  await world.fake.setValue(device, featureOf(device, FEATURE.FORCE_MODE), 'off');
  assert.equal(world.charger.status.frc, 1);
  assert.equal(lastState(world, GARAGE, FEATURE.FORCE_MODE), 'off');

  const tooHigh = await world.fake.setValue(device, featureOf(device, FEATURE.TARGET_CURRENT), 40);
  assert.equal(tooHigh.success, false);
  assert.match(tooHigh.error, /between 6 and 32 A/);

  // The limit set in the app (ama) lowers the range: nothing sent beyond it.
  world.charger.push({ ama: 16 });
  await settle(world);
  const capped = await world.fake.setValue(device, featureOf(device, FEATURE.TARGET_CURRENT), 20);
  assert.equal(capped.success, false);
  assert.match(capped.error, /between 6 and 16 A/);
  assert.equal(world.charger.writes.length, 3, 'only the three valid writes reached the charger');

  const readOnly = await world.fake.setValue(device, featureOf(device, FEATURE.POWER), 1);
  assert.equal(readOnly.success, false);
});

test('a value the charger refuses fails plainly', async (t) => {
  const world = await createWorld({ fixture: 'charging' });
  t.after(() => world.stop());
  const device = world.device();
  // The charger refuses what the integration lets through (a newer limit).
  world.charger.write = () => 'value out of range';
  const refused = await world.fake.setValue(device, featureOf(device, FEATURE.TARGET_CURRENT), 10);
  assert.equal(refused.success, false);
  assert.match(refused.error, /refused the request/);
});

test('"charge finished" fires once, on the transition from charging to complete', async (t) => {
  const world = await createWorld({ fixture: 'charging' });
  t.after(() => world.stop());
  assert.equal(world.fake.sceneEvents.length, 0);

  world.charger.push({ car: CAR.COMPLETE, wh: 23456 });
  world.charger.push({ car: CAR.COMPLETE });
  await settle(world);
  assert.deepEqual(world.fake.sceneEvents, [
    {
      key: SCENE_TRIGGER.CHARGE_FINISHED,
      data: {
        device: `ext:test-integration:charger:${GARAGE}`,
        charger: 'Garage',
        energy_kwh: 23.46,
      },
    },
  ]);
  assert.equal(lastState(world, GARAGE, FEATURE.CHARGING_STATE), CHARGING_STATE.PAUSED_BY_VEHICLE);

  // Unplugged then plugged again: waiting is not finishing.
  world.charger.push({ car: CAR.IDLE });
  world.charger.push({ car: CAR.WAIT_CAR });
  await settle(world);
  assert.equal(world.fake.sceneEvents.length, 1);
});

test('a charger already complete at startup fires nothing', async (t) => {
  const world = await createWorld({ fixture: 'complete' });
  t.after(() => world.stop());
  await settle(world);
  assert.equal(world.fake.sceneEvents.length, 0);
});

test('a charger that drops: offline, one warning, reconnected, one line on its return', async (t) => {
  const world = await createWorld({ fixture: 'charging' });
  t.after(() => world.stop());
  const lines = captureLogs(t, 'info');

  // The charger leaves the network.
  const [, port] = world.charger.host.split(':');
  await world.charger.close();
  await waitFor(() => lastState(world, GARAGE, FEATURE.ONLINE) === 0, 'offline');
  await new Promise((resolve) => setTimeout(resolve, 150)); // a few failed attempts
  assert.equal(lastState(world, GARAGE, FEATURE.CONNECTOR_STATUS), CONNECTOR_STATUS.UNAVAILABLE);
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /pas de réponse/);
  assert.equal(lines.filter((l) => l.includes('[WARN]')).length, 1, lines.join('\n'));

  const offline = await world.fake.setValue(
    world.device(),
    featureOf(world.device(), FEATURE.FORCE_MODE),
    'on',
  );
  assert.equal(offline.success, false);
  assert.match(offline.error, /offline/);

  // Back on the network.
  world.charger = await startFakeWattpilot(loadFixture(FIXTURES.charging), { port: Number(port) });
  await waitFor(() => lastState(world, GARAGE, FEATURE.ONLINE) === 1, 'back online', 3000);
  await world.hub.idle();
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  assert.equal(lines.filter((l) => l.includes('answers again')).length, 1, lines.join('\n'));
  assert.equal(lines.filter((l) => l.includes('[INFO]')).length, 1, lines.join('\n'));
});

test('a wrong password: the status says so, in the four languages', async (t) => {
  const world = await createWorld({ fixture: 'idle', config: { password: 'not-the-one' } });
  t.after(() => world.stop());
  const { connected, message } = world.fake.connectionStatus;
  assert.equal(connected, false);
  assert.match(message.en, /refused the password/);
  assert.match(message.fr, /refuse le mot de passe/);
  assert.match(message.de, /lehnt das Passwort ab/);
  assert.match(message.es, /rechaza la contraseña/);
  assert.equal(world.fake.discoveredDevices.length, 0);
});

test('a charger off at startup is known from its device, and published when it answers', async (t) => {
  // First run: the charger answered, the user added it.
  const first = await createWorld({ fixture: 'charging' });
  const created = first.device();
  const host = first.charger.host;
  await first.stop();

  // Gladys restarts the container while the charger is off.
  const gladys = createFakeGladys({ config: { host, password: PASSWORD }, devices: [created] });
  const hub = registerHandlers(gladys, {
    connect: testConnect,
    linkOptions: TEST_LINK,
    timers: false,
  });
  let charger = null;
  t.after(async () => {
    hub.stop();
    await gladys.disconnect();
    await charger?.close();
  });
  await gladys.connect();
  assert.equal(gladys.fake.discoveredDevices.length, 0);
  assert.equal(gladys.fake.lastState(`${created.external_id}:online`), 0);

  // The charger comes back, on the same port.
  const [, port] = host.split(':');
  charger = await startFakeWattpilot(loadFixture(FIXTURES.charging), { port: Number(port) });
  await gladys.fake.poll(created); // the fallback reconnects at once
  await waitFor(() => gladys.fake.lastState(`${created.external_id}:online`) === 1, 'online');
  assert.equal(gladys.fake.discoveredDevices.length, 1);
});

test('a normal cycle writes nothing at info, and no secret ever reaches the logs', async (t) => {
  const world = await createWorld({ fixture: 'charging', timers: true });
  t.after(() => world.stop());
  world.hub.config.refresh_interval = '0.05';
  world.hub.schedule();

  const info = captureLogs(t, 'info');
  for (let i = 0; i < 3; i += 1) {
    world.charger.push({
      nrg: [230, 230, 230, 1, 10, 10, 10, 2300, 2300, 2300, 0, 6000 + i],
      rbt: i,
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  world.charger.push({ car: 3 });
  await world.fake.poll(world.device());
  await world.fake.widgetGet('charger', { settings: { charger: world.device().external_id } });
  await world.hub.idle();
  assert.deepEqual(info, [], 'a normal cycle is silent at info');

  // Everything, debug included, through a wrong password and a test.
  const all = captureLogs(t, 'debug');
  await world.fake.configUpdated({ host: world.charger.host, password: 'wrong-secret-3' });
  await world.fake.action('test_connection', {});
  await world.fake.configUpdated({ host: world.charger.host, password: PASSWORD });
  await world.fake.setValue(world.device(), featureOf(world.device(), FEATURE.FORCE_MODE), 'on');
  const text = all.join('\n');
  assert.ok(all.length > 0);
  for (const secret of [PASSWORD, 'wrong-secret-3', 'fake-cloud-api-key']) {
    assert.ok(!text.includes(secret), `${secret} leaked into the logs`);
  }
  assert.ok(
    !JSON.stringify(world.fake.connectionStatuses).includes('wrong-secret-3'),
    'nor into the status',
  );
});

test('test_connection reports the charger, or why it does not answer', async (t) => {
  const world = await createWorld({ fixture: 'charging' });
  t.after(() => world.stop());
  const { success, data } = await world.fake.action('test_connection', {});
  assert.equal(success, true);
  assert.equal(data.message.fr, 'Garage (n° 90000022, micrologiciel 38.5) : connectée.');
  assert.equal(world.charger.connections, 1, 'no second connection for a test');

  await world.fake.configUpdated({ host: world.charger.host, password: 'nope' });
  const refused = await world.fake.action('test_connection', {});
  assert.match(refused.data.message.en, /refused the password/);

  await world.fake.configUpdated({ host: '192.0.2.10/api', password: 'x' });
  const invalid = await world.fake.action('test_connection', {});
  assert.match(invalid.data.message.en, /Invalid address/);
});

test('not configured: says what to enter, and starts once the address is given', async (t) => {
  const world = await createWorld({ fixture: null });
  t.after(() => world.stop());
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.en, /Enter the IP address and the password/);

  const charger = await startFakeWattpilot(loadFixture(FIXTURES.idle));
  t.after(() => charger.close());
  await world.fake.configUpdated({ host: charger.host, password: PASSWORD, language: 'de' });
  assert.equal(world.fake.discoveredDevices.length, 1);
  const device = world.device();
  assert.equal(device.name, 'Wattpilot_90000011', 'no name set in the app: the one of hello');
  assert.equal(featureOf(device, FEATURE.PLUGGED).name, 'Auto angesteckt');
  assert.equal(featureOf(device, FEATURE.TARGET_CURRENT).max, 16);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
});

test('the scene actions set the mode and the override, and fail plainly on a bad charger', async (t) => {
  const world = await createWorld({ fixture: 'charging' });
  t.after(() => world.stop());
  const charger = world.device().external_id;
  const mode = await world.fake.sceneAction('set_charging_mode', { charger, mode: 'default' });
  assert.equal(mode.success, true);
  assert.equal(world.charger.status.lmo, 3);

  const override = await world.fake.sceneAction('set_charge_override', {
    charger,
    override: 'on',
  });
  assert.equal(override.success, true);
  assert.equal(world.charger.status.frc, 2);

  const unknown = await world.fake.sceneAction('set_charge_override', {
    charger: 'ext:test-integration:charger:99999999',
    override: 'off',
  });
  assert.equal(unknown.success, false);
});
