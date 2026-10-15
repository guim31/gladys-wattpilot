// The WebSocket client against the fake Wattpilot: authentication (PBKDF2 and
// bcrypt), secured commands, the reasons a connection fails, and the link that
// reconnects.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { ChargerLink } from '../src/wattpilot/link.js';
import { ERROR_KINDS, STATUS_KEYS, openSession } from '../src/wattpilot/session.js';
import { FIXTURES, PASSWORD, loadFixture, startFakeWattpilot } from './helpers/fakeWattpilot.js';
import { TEST_LINK, testConnect, waitFor } from './helpers/world.js';

async function fake(t, key, options) {
  const charger = await startFakeWattpilot(loadFixture(FIXTURES[key]), options);
  t.after(() => charger.close());
  return charger;
}

async function session(t, charger, password = PASSWORD) {
  const opened = await openSession({ host: charger.host, password, timeoutMs: 1500 });
  t.after(() => opened.close());
  return opened;
}

test('authenticates and keeps only the keys it reads: no cloud key, no Wi-Fi', async (t) => {
  const charger = await fake(t, 'idle');
  const opened = await session(t, charger);
  assert.equal(opened.hello.serial, '90000011');
  assert.equal(opened.hello.secured, true);
  assert.equal(opened.hello.devicetype, 'wattpilot');
  assert.deepEqual(Object.keys(opened.status).sort(), [...STATUS_KEYS].sort());
  assert.equal(opened.status.eto, 1076098);
  assert.ok(!JSON.stringify(opened.status).includes('fake-cloud-api-key'));
  assert.ok(!JSON.stringify(opened.status).includes('192.0.2.21'));
});

test('a Wattpilot Flex authenticates with bcrypt', async (t) => {
  const charger = await fake(t, 'flex');
  const opened = await session(t, charger);
  assert.equal(opened.status.typ, 'wattpilot_flex');
});

test('a wrong password is an auth_failed error, without the password in it', async (t) => {
  const charger = await fake(t, 'idle');
  await assert.rejects(
    openSession({ host: charger.host, password: 'wrong-secret-9', timeoutMs: 1500 }),
    (err) => {
      assert.equal(err.kind, ERROR_KINDS.AUTH_FAILED);
      assert.ok(!err.message.includes('wrong-secret-9'));
      return true;
    },
  );
  await assert.rejects(openSession({ host: charger.host, password: '', timeoutMs: 1500 }), {
    kind: ERROR_KINDS.NO_PASSWORD,
  });
});

test('secured commands carry a valid HMAC, plain ones go as they are', async (t) => {
  const secured = await fake(t, 'charging');
  const one = await session(t, secured);
  const updates = [];
  one.on('delta', (keys) => updates.push(...keys));
  await one.setValue('amp', 20);
  assert.deepEqual(secured.writes, [{ key: 'amp', value: 20 }]);
  assert.equal(one.status.amp, 20, 'the answer updates the status');
  assert.deepEqual(updates, ['amp']);
  await assert.rejects(one.setValue('amp', 40), (err) => {
    assert.equal(err.kind, ERROR_KINDS.REJECTED);
    assert.equal(err.reason, 'value out of range');
    return true;
  });

  const plain = await fake(t, 'complete');
  const two = await session(t, plain);
  assert.equal(two.hello.secured, false);
  await two.setValue('lmo', 3);
  assert.deepEqual(plain.received.at(-1), { type: 'setValue', requestId: 1, key: 'lmo', value: 3 });
});

test('deltas: only real changes, with the values before', async (t) => {
  const charger = await fake(t, 'charging');
  const opened = await session(t, charger);
  const events = [];
  opened.on('delta', (keys, before) => events.push({ keys, before }));
  charger.push({ car: 4, rbt: 1, cak: 'another-fake-key' });
  charger.push({ car: 4 });
  await waitFor(() => events.length === 1, 'the delta');
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(events, [{ keys: ['car'], before: { car: 2 } }]);
  assert.equal(opened.status.cak, undefined);
});

test('why a connection fails: nothing there, not a Wattpilot, no status', async (t) => {
  // A port nobody listens on.
  const blocker = createServer();
  await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const { port } = blocker.address();
  await new Promise((resolve) => blocker.close(resolve));
  await assert.rejects(
    openSession({ host: `127.0.0.1:${port}`, password: PASSWORD, timeoutMs: 1500 }),
    { kind: ERROR_KINDS.UNREACHABLE },
  );

  const web = await fake(t, 'idle');
  web.wsEnabled = false;
  await assert.rejects(openSession({ host: web.host, password: PASSWORD, timeoutMs: 1500 }), {
    kind: ERROR_KINDS.NOT_WATTPILOT,
  });

  const mute = await fake(t, 'idle');
  mute.sendsStatus = false;
  await assert.rejects(openSession({ host: mute.host, password: PASSWORD, timeoutMs: 300 }), {
    kind: ERROR_KINDS.TIMEOUT,
  });
});

test('the link reconnects after a drop, and waits longer after a refused password', async (t) => {
  const charger = await fake(t, 'charging');
  const link = new ChargerLink({
    host: charger.host,
    password: PASSWORD,
    connect: testConnect,
    ...TEST_LINK,
  });
  t.after(() => link.stop());
  const events = [];
  link.on('online', () => events.push('online'));
  link.on('offline', (err) => events.push(`offline:${err.kind}`));
  assert.equal(await link.start(), true);

  charger.dropAll();
  await waitFor(() => events.filter((e) => e === 'online').length === 2, 'the reconnection');
  assert.deepEqual(events, ['online', 'offline:closed', 'online']);
  assert.equal(charger.connections, 2);
  await link.set('frc', 1);
  assert.equal(charger.status.frc, 1);

  // A password changed on the charger: refused, retried after authRetryMs only.
  charger.password = 'changed';
  const bad = new ChargerLink({
    host: charger.host,
    password: 'old-password',
    connect: testConnect,
    ...TEST_LINK,
  });
  t.after(() => bad.stop());
  const failures = [];
  bad.on('offline', (err) => failures.push(err.kind));
  assert.equal(await bad.start(), false);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(failures, [ERROR_KINDS.AUTH_FAILED], 'no retry before authRetryMs');
  await waitFor(() => failures.length === 2, 'the slow retry');
  await assert.rejects(bad.set('frc', 0), { kind: ERROR_KINDS.AUTH_FAILED });
});

test('a frozen charger is dropped by the watchdog, then reached again', async (t) => {
  const charger = await fake(t, 'idle');
  const link = new ChargerLink({
    host: charger.host,
    password: PASSWORD,
    connect: testConnect,
    ...TEST_LINK,
  });
  t.after(() => link.stop());
  const events = [];
  link.on('online', () => events.push('online'));
  link.on('offline', (err) => events.push(`offline:${err.kind}`));
  charger.answersPings = true;
  await link.start();

  // Silent but answering pings: kept.
  const pings = () => [...charger.sockets].reduce((n, socket) => n + (socket.pings ?? 0), 0);
  for (const socket of charger.sockets) {
    socket.on('ping', () => {
      socket.pings = (socket.pings ?? 0) + 1;
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.ok(pings() >= 2, `pinged ${pings()} times`);
  assert.deepEqual(events, ['online']);

  // Silent and deaf: dropped and reconnected.
  for (const socket of charger.sockets) {
    socket.pong = () => {};
  }
  await waitFor(() => events.includes('offline:closed'), 'the watchdog', 4000);
  await waitFor(() => events.filter((e) => e === 'online').length === 2, 'the reconnection');
});
