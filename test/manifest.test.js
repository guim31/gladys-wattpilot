// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/app.js';
import { DEFAULT_CONFIG, LANGUAGES, REFRESH_INTERVALS } from '../src/config.js';
import { SCENE_TRIGGER_KEYS, WIDGET_KEY } from '../src/hub.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { CHARGING_MODES, FORCE_MODES } from '../src/wattpilot/model.js';
import { buildChargerContent } from '../src/widgets.js';
import { FIXTURES, loadFixture } from './helpers/fakeWattpilot.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('identity: name, image, energy category, local transport', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.name, 'Fronius Wattpilot');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  assert.deepEqual(manifest.categories, ['energy']);
  // The charger is reached on the local network only.
  assert.deepEqual(manifest.transports, ['local']);
  assert.equal(manifest.docker_image, `ghcr.io/guim31/gladys-wattpilot:${manifest.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-wattpilot/main/cover.png',
  );
});

test('Gladys 5.2.0 at least: the widget settings button opens a form (#3168)', () => {
  const content = buildChargerContent({
    charger: { serial: '90000022', online: true, status: loadFixture(FIXTURES.charging).status },
    deviceExternalId: 'ext:test:charger:90000022',
    language: 'en',
  });
  const formButtons = content.components.filter((c) => c.action?.fields);
  assert.equal(formButtons.length, 1, 'the content declares a form button');
  assert.ok(
    isAtLeast(minGladysVersion(), [5, 2, 0]),
    `gladys_version must be >=5.2.0, got "${manifest.gladys_version}"`,
  );
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions), ACTIONS);
  // An action applies no default and cannot fill a secret (Gladys#3154, #3155).
  for (const action of manifest.actions) {
    for (const field of action.fields ?? []) {
      assert.notEqual(field.type, 'secret');
    }
  }
});

test('scene actions, scene triggers and widgets match the code', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
  assert.deepEqual(keysOf(manifest.scene_triggers), SCENE_TRIGGER_KEYS);
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);

  const [setMode, setOverride] = manifest.scene_actions;
  assert.deepEqual(keysOf(setMode.fields), ['charger', 'mode']);
  assert.deepEqual(
    setMode.fields[1].options.map((o) => o.value),
    Object.keys(CHARGING_MODES),
  );
  assert.deepEqual(keysOf(setOverride.fields), ['charger', 'override']);
  assert.deepEqual(
    setOverride.fields[1].options.map((o) => o.value).sort(),
    Object.keys(FORCE_MODES).sort(),
  );
  assert.deepEqual(keysOf(manifest.widgets[0].settings), ['charger']);

  // The event data the hub sends: device (filter), energy_kwh and charger (variables).
  const trigger = manifest.scene_triggers[0];
  assert.deepEqual(keysOf(trigger.fields), ['device']);
  assert.deepEqual(keysOf(trigger.variables), ['energy_kwh', 'charger']);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  const stored = manifest.config_schema.filter((f) => f.type !== 'section');
  assert.deepEqual(stored.map((f) => f.key).sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const field of stored) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, field.key);
    }
  }
  const language = manifest.config_schema.find((f) => f.key === 'language');
  assert.deepEqual(
    language.options.map((o) => o.value),
    LANGUAGES,
  );
  assert.equal(language.default, 'fr');
  const interval = manifest.config_schema.find((f) => f.key === 'refresh_interval');
  assert.deepEqual(
    interval.options.map((o) => o.value),
    REFRESH_INTERVALS,
  );
  assert.equal(manifest.config_schema.find((f) => f.key === 'password').type, 'secret');
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('dynamic selects declare the devices source and no static options', () => {
  const dynamic = allFields.filter((f) => f.source !== undefined);
  assert.equal(dynamic.length, 4);
  for (const field of dynamic) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined);
  }
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});

test('placeholders are multi-language objects, with documentation addresses only', () => {
  const withPlaceholder = allFields.filter((f) => f.placeholder !== undefined);
  assert.ok(withPlaceholder.length > 0);
  for (const field of withPlaceholder) {
    assert.equal(typeof field.placeholder, 'object');
    for (const text of Object.values(field.placeholder)) {
      // The repository is public: example addresses come from 192.0.2.0/24.
      for (const ip of text.match(/\d+\.\d+\.\d+\.\d+/g) ?? []) {
        assert.match(ip, /^192\.0\.2\./, `${field.key}: ${ip}`);
      }
    }
  }
});
