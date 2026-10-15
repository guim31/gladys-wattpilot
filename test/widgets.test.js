// The "charger" widget: content within the core budget, bound to features
// that exist, the current override marked by its icon, and its buttons.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { boundFeatureIds, WIDGET_ACTION } from '../src/widgets.js';
import { FEATURE } from '../src/devices.js';
import { FIXTURES } from './helpers/fakeWattpilot.js';
import { createWorld, lastState } from './helpers/world.js';

const LANGS = ['en', 'fr', 'de', 'es'];
const GARAGE = '90000022';

async function content(world, device, language = 'fr') {
  const ack = await world.fake.widgetGet('charger', {
    settings: { charger: device.external_id },
    language,
    units: 'metric',
  });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
}

test('the content fits the core budget, in every language and every state', async () => {
  for (const fixture of Object.keys(FIXTURES)) {
    const world = await createWorld({ fixture });
    try {
      const device = world.device();
      for (const language of LANGS) {
        const widget = await content(world, device, language);
        assert.deepEqual(validateWidgetContent(widget), [], `${fixture} (${language})`);
        assert.ok(widget.components.length <= 8);
        // Every tile is bound to a feature the device really has.
        const featureIds = new Set(device.features.map((f) => f.external_id));
        for (const id of boundFeatureIds(widget)) {
          assert.ok(featureIds.has(id), `${id} is not a feature of ${device.name}`);
        }
      }
    } finally {
      await world.stop();
    }
  }
});

test('the status says the state, the mode, an override and an error', async (t) => {
  const charging = await createWorld({ fixture: 'charging' });
  t.after(() => charging.stop());
  const widget = await content(charging, charging.device(), 'fr');
  const status = widget.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((i) => [i.label, i.value, i.color]),
    [
      ['État', 'En charge', 'success'],
      ['Mode', 'Éco', 'neutral'],
    ],
  );
  const buttons = widget.components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.map((b) => [b.action.key, b.icon]),
    [
      [WIDGET_ACTION.FORCE_ON, 'zap'],
      [WIDGET_ACTION.FORCE_OFF, 'pause-circle'],
      [WIDGET_ACTION.NEUTRAL, 'check-circle'],
      [WIDGET_ACTION.SETTINGS, 'sliders'],
    ],
  );
  assert.ok(
    buttons.every((b) => b.style !== 'primary'),
    'primary is invisible in dark mode',
  );
  const [amps, mode] = buttons[3].action.fields;
  assert.deepEqual([amps.min, amps.max, amps.default], [6, 32, 16]);
  assert.equal(mode.default, 'eco');
  assert.deepEqual(
    mode.options.map((o) => [o.value, o.label.de]),
    [
      ['default', 'Standard'],
      ['eco', 'Eco'],
      ['next_trip', 'Next Trip'],
    ],
  );

  const error = await createWorld({ fixture: 'error' });
  t.after(() => error.stop());
  const items = (await content(error, error.device(), 'en')).components.find(
    (c) => c.type === 'status',
  ).items;
  assert.deepEqual(items.slice(1), [
    { label: 'Mode', value: 'Default', color: 'neutral' },
    { label: 'Override', value: 'Forced stop', color: 'warning' },
    { label: 'Error', value: 'Overheating', color: 'danger' },
  ]);
  const errorButtons = (await content(error, error.device(), 'en')).components;
  assert.equal(
    errorButtons.find((c) => c.action?.key === WIDGET_ACTION.FORCE_OFF).icon,
    'check-circle',
  );
});

test('the buttons drive the charger and answer a toast', async (t) => {
  const world = await createWorld({ fixture: 'charging' });
  t.after(() => world.stop());
  const settings = { charger: world.device().external_id };

  const on = await world.fake.widgetAction('charger', WIDGET_ACTION.FORCE_ON, {}, { settings });
  assert.equal(on.success, true);
  assert.equal(world.charger.status.frc, 2);
  assert.equal(lastState(world, GARAGE, FEATURE.FORCE_MODE), 'on');
  assert.equal(on.data.message.fr, 'Charge forcée.');

  const form = await world.fake.widgetAction(
    'charger',
    WIDGET_ACTION.SETTINGS,
    {},
    { settings, values: { amps: 24, mode: 'next_trip' } },
  );
  assert.equal(form.success, true);
  assert.equal(world.charger.status.amp, 24);
  assert.equal(world.charger.status.lmo, 5);
  assert.equal(form.data.message.en, 'Charging current 24 A, mode Next Trip.');
  assert.equal(lastState(world, GARAGE, FEATURE.CHARGING_MODE), 'next_trip');

  const writes = world.charger.writes.length;
  await world.fake.widgetAction(
    'charger',
    WIDGET_ACTION.SETTINGS,
    {},
    { settings, values: { amps: 24, mode: 'next_trip' } },
  );
  assert.equal(world.charger.writes.length, writes, 'nothing to change, nothing written');

  const outOfRange = await world.fake.widgetAction(
    'charger',
    WIDGET_ACTION.SETTINGS,
    {},
    { settings, values: { amps: 40, mode: 'eco' } },
  );
  assert.equal(outOfRange.success, true, 'a toast, not a failed action');
  assert.match(JSON.stringify(outOfRange.data), /between 6 and 32 A/);
  assert.equal(world.charger.status.lmo, 5, 'nothing written');

  const oldCore = await world.fake.widgetAction(
    'charger',
    WIDGET_ACTION.SETTINGS,
    {},
    { settings },
  );
  assert.equal(oldCore.success, false, 'a core without action forms sends no values');
});

test('no charger picked, a charger gone, a charger offline', async (t) => {
  const world = await createWorld({ fixture: 'charging' });
  t.after(() => world.stop());
  const pick = await world.fake.widgetGet('charger', { settings: {}, language: 'de' });
  assert.match(JSON.stringify(pick.data.content), /Wähle eine Ladestation/);

  const gone = await world.fake.widgetGet('charger', {
    settings: { charger: 'ext:test-integration:charger:99999999' },
    language: 'es',
  });
  assert.match(JSON.stringify(gone.data.content), /ya no está configurado/);

  const device = world.device();
  await world.charger.close();
  await new Promise((resolve) => setTimeout(resolve, 50));
  await world.hub.idle();
  const offline = await content(world, device, 'fr');
  assert.deepEqual(validateWidgetContent(offline), []);
  assert.match(JSON.stringify(offline), /Hors ligne/);
  assert.equal(offline.components.filter((c) => c.type === 'button').length, 0);
  const toast = await world.fake.widgetAction(
    'charger',
    WIDGET_ACTION.FORCE_ON,
    {},
    { settings: { charger: device.external_id } },
  );
  assert.match(toast.data.message.en, /offline/);
});
