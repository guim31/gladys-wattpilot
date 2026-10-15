// The probe script against the fake charger: read-only, nothing sensitive.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { FIXTURES, PASSWORD, loadFixture, startFakeWattpilot } from './helpers/fakeWattpilot.js';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/probe.mjs', import.meta.url));
const env = (password) => ({ ...process.env, WATTPILOT_PASSWORD: password, LOG_LEVEL: 'silent' });

test('probe reads the full status, never writes, and masks what is personal', async (t) => {
  const charger = await startFakeWattpilot(loadFixture(FIXTURES.charging));
  t.after(() => charger.close());
  // One change pushed once the probe listens.
  const pusher = setInterval(() => {
    if (charger.authenticated().length > 0) {
      clearInterval(pusher);
      setTimeout(() => charger.push({ nrg: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 7000] }), 50);
    }
  }, 10);
  t.after(() => clearInterval(pusher));
  const { stdout } = await run(process.execPath, [script, charger.host, '--listen', '0.5'], {
    env: env(PASSWORD),
  });
  const report = JSON.parse(stdout);
  assert.equal(report.hello.serial, '90******');
  assert.equal(report.hello.password_hash, 'pbkdf2');
  assert.equal(report.friendly_name_set, true);
  assert.deepEqual(report.keys_missing, []);
  assert.equal(report.gladys.power.total, 7000, 'the pushed change is read');
  assert.equal(report.pushes.delta_messages, 1);
  assert.deepEqual(report.pushes.keys_changed, ['nrg']);
  assert.equal(report.answers_ping, true);
  for (const secret of ['90000022', 'Garage', PASSWORD, 'fake-cloud-api-key', '127.0.0.1']) {
    assert.ok(!stdout.includes(secret), `${secret} in the probe output`);
  }
  assert.deepEqual(
    charger.received.map((m) => m.type),
    ['auth'],
    'nothing sent but the authentication',
  );
});

test('probe without password stops after hello; a wrong one says auth_failed', async (t) => {
  const charger = await startFakeWattpilot(loadFixture(FIXTURES.flex));
  t.after(() => charger.close());
  const { stdout } = await run(process.execPath, [script, charger.host], { env: env('') });
  const hello = JSON.parse(stdout).hello;
  assert.equal(hello.device_type, 'wattpilot_flex');
  assert.equal(hello.password_hash, 'bcrypt');
  assert.equal(charger.received.length, 0);

  await assert.rejects(
    run(process.execPath, [script, charger.host], { env: env('wrong-secret-7') }),
    (err) => {
      assert.equal(err.code, 1);
      const report = JSON.parse(err.stdout);
      assert.equal(report.error, 'auth_failed');
      assert.equal(report.hello.serial, '90******');
      assert.ok(!err.stdout.includes('wrong-secret-7'));
      return true;
    },
  );
});
