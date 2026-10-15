// From a Wattpilot status to the Gladys values, on every fixture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARGING_STATE,
  CONNECTOR_STATUS,
  allowedMaxCurrent,
  chargingState,
  connectorStatus,
  friendlyName,
  hardwareMaxCurrent,
  modelName,
  readings,
} from '../src/wattpilot/model.js';
import { FIXTURES, loadFixture } from './helpers/fakeWattpilot.js';

const status = (key) => loadFixture(FIXTURES[key]).status;

test('the car state becomes the two charging station enums of Gladys', () => {
  const cases = [
    [{ car: 1 }, CONNECTOR_STATUS.AVAILABLE, CHARGING_STATE.IDLE],
    [{ car: 2 }, CONNECTOR_STATUS.OCCUPIED, CHARGING_STATE.CHARGING],
    [{ car: 3, alw: true }, CONNECTOR_STATUS.OCCUPIED, CHARGING_STATE.EV_CONNECTED],
    [{ car: 3, alw: false }, CONNECTOR_STATUS.OCCUPIED, CHARGING_STATE.PAUSED_BY_CHARGER],
    [{ car: 4 }, CONNECTOR_STATUS.OCCUPIED, CHARGING_STATE.PAUSED_BY_VEHICLE],
    [{ car: 5 }, CONNECTOR_STATUS.FAULTED, CHARGING_STATE.IDLE],
    [{ car: 2, err: 13 }, CONNECTOR_STATUS.FAULTED, CHARGING_STATE.CHARGING],
    [{ car: 0 }, CONNECTOR_STATUS.UNAVAILABLE, CHARGING_STATE.IDLE],
    [{ car: null }, CONNECTOR_STATUS.UNAVAILABLE, CHARGING_STATE.IDLE],
  ];
  for (const [input, connector, charging] of cases) {
    assert.equal(connectorStatus(input), connector, JSON.stringify(input));
    assert.equal(chargingState(input), charging, JSON.stringify(input));
  }
});

test('readings of a 22 kW Home charging in Eco mode', () => {
  assert.deepEqual(readings(status('charging')), {
    car: 2,
    connectorStatus: CONNECTOR_STATUS.OCCUPIED,
    chargingState: CHARGING_STATE.CHARGING,
    plugged: 1,
    power: { total: 11048, l1: 3676, l2: 3700, l3: 3672 },
    current: { l1: 15.9, l2: 16.1, l3: 15.8 },
    sessionKwh: 5.32,
    totalKwh: 1234.567,
    targetCurrent: 16,
    force: 'neutral',
    mode: 'eco',
    error: 0,
    temperature: 31.5,
  });
});

test('readings of the documented idle Home, a complete Go, an error and a Flex', () => {
  const idle = readings(status('idle'));
  assert.equal(idle.plugged, 0);
  assert.equal(idle.power.total, 0);
  assert.equal(idle.totalKwh, 1076.098);
  assert.equal(idle.mode, 'default');
  assert.equal(idle.temperature, 16.75);

  const complete = readings(status('complete'));
  assert.equal(complete.mode, 'next_trip');
  assert.equal(complete.chargingState, CHARGING_STATE.PAUSED_BY_VEHICLE);
  assert.equal(complete.temperature, 24, 'a null sensor is skipped');

  const error = readings(status('error'));
  assert.equal(error.force, 'off');
  assert.equal(error.error, 13);
  assert.equal(error.connectorStatus, CONNECTOR_STATUS.FAULTED);

  const flex = readings(status('flex'));
  assert.equal(flex.chargingState, CHARGING_STATE.PAUSED_BY_CHARGER);

  assert.deepEqual(readings({}).power, { total: null, l1: null, l2: null, l3: null });
  assert.equal(readings({ lmo: 9 }).mode, null);
});

test('current bounds: hardware variant, lowered by the limit of the app', () => {
  assert.equal(hardwareMaxCurrent(status('idle')), 16);
  assert.equal(hardwareMaxCurrent(status('charging')), 32);
  assert.equal(hardwareMaxCurrent({}), 32);
  assert.equal(allowedMaxCurrent(status('charging')), 32);
  assert.equal(allowedMaxCurrent(status('complete')), 20, 'ama = 20 on a 22 kW');
  assert.equal(allowedMaxCurrent({ var: 11, ama: 32 }), 16);
  assert.equal(allowedMaxCurrent({ var: 22, ama: 0 }), 32, 'a nonsense limit is ignored');
});

test('name and model', () => {
  const hello = { friendlyName: loadFixture(FIXTURES.idle).hello.friendly_name };
  assert.equal(friendlyName(status('charging'), {}), 'Garage');
  assert.equal(friendlyName({ fna: '' }, hello), 'Wattpilot_90000011', 'name of hello');
  assert.equal(friendlyName({ fna: '  ' }, {}), null);
  assert.equal(modelName(status('charging'), { devicetype: 'wattpilot' }), 'Wattpilot 22 kW');
  assert.equal(modelName(status('flex'), { devicetype: 'wattpilot_flex' }), 'Wattpilot Flex 11 kW');
  assert.equal(modelName({}, null), 'Wattpilot');
});
