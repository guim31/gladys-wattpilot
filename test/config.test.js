import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  isConfigured,
  normalizeConfig,
  parseHost,
  refreshIntervalMs,
} from '../src/config.js';

test('parseHost accepts the usual ways of typing an address', () => {
  assert.deepEqual(parseHost('192.0.2.10'), { host: '192.0.2.10', invalid: null });
  assert.deepEqual(parseHost(' http://192.0.2.10/ '), { host: '192.0.2.10', invalid: null });
  assert.deepEqual(parseHost('ws://Wattpilot.local/ws'), {
    host: 'wattpilot.local',
    invalid: null,
  });
  assert.deepEqual(parseHost('192.0.2.10:8080'), { host: '192.0.2.10:8080', invalid: null });
  assert.deepEqual(parseHost(''), { host: null, invalid: null });
});

test('parseHost refuses paths and never echoes credentials', () => {
  assert.deepEqual(parseHost('192.0.2.10/api'), { host: null, invalid: '192.0.2.10/api' });
  assert.deepEqual(parseHost('user:secret@192.0.2.11'), { host: null, invalid: '***' });
});

test('normalizeConfig fills the defaults and derives what the code uses', () => {
  const empty = normalizeConfig();
  assert.equal(empty.language, 'fr');
  assert.equal(empty.refresh_interval, DEFAULT_CONFIG.refresh_interval);
  assert.equal(isConfigured(empty), false);
  assert.equal(refreshIntervalMs(empty), 15000);

  const config = normalizeConfig({
    host: '192.0.2.10',
    password: ' spaced pw ',
    refresh_interval: '30',
    language: 'xx',
  });
  assert.equal(config.host, '192.0.2.10');
  assert.equal(config.password, ' spaced pw ', 'a password is kept as typed');
  assert.equal(config.language, 'fr');
  assert.equal(refreshIntervalMs(config), 30000);
  assert.equal(isConfigured(config), true);

  assert.equal(isConfigured(normalizeConfig({ host: '192.0.2.10' })), false, 'no password');
  assert.equal(normalizeConfig({ refresh_interval: '300' }).refresh_interval, '15');
  assert.equal(normalizeConfig({ host: 'a/b' }).invalidHost, 'a/b');
});
