// -----------------------------------------------------------------------------
// One Gladys device per Wattpilot, and the states of its features.
//
// The device external id is built from the serial number: it does not change
// with the IP address. The feature keys below are FOREVER (Gladys keys the
// history, the scenes and the dashboards on them): add new ones, never rename
// one.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import {
  CHARGING_MODES,
  CONNECTOR_STATUS,
  FORCE_MODES,
  MIN_CURRENT,
  friendlyName,
  hardwareMaxCurrent,
  modelName,
  readings,
} from './wattpilot/model.js';
import { NAMES, OPTION_LABELS, errorLabel } from './i18n.js';

export const DEVICE_TYPE = 'charger';

/** Feature keys (the suffix of the feature external ids). */
export const FEATURE = {
  CONNECTOR_STATUS: 'connector_status',
  CHARGING_STATE: 'charging_state',
  PLUGGED: 'plugged',
  POWER: 'power',
  POWER_L1: 'power_l1',
  POWER_L2: 'power_l2',
  POWER_L3: 'power_l3',
  CURRENT_L1: 'current_l1',
  CURRENT_L2: 'current_l2',
  CURRENT_L3: 'current_l3',
  SESSION_ENERGY: 'session_energy',
  TOTAL_ENERGY: 'total_energy',
  TARGET_CURRENT: 'target_current',
  CHARGING_MODE: 'charging_mode',
  FORCE_MODE: 'force_mode',
  TEMPERATURE: 'temperature',
  ERROR: 'error',
  ONLINE: 'online',
};

// The highest power of a 22 kW charger, with margin (display bounds only).
const MAX_POWER_W = 25000;
const MAX_PHASE_POWER_W = 8500;
const MAX_PHASE_CURRENT_A = 40;

const sensor = (extra) => ({
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...extra,
});

const select = (values, labels) => ({
  category: CAT.TEXT,
  type: TYPES.TEXT.SELECT,
  min: 0,
  max: 0,
  read_only: false,
  has_feedback: true,
  keep_history: true,
  supported_options: values.map((value, index) => ({
    value,
    label: labels[value],
    sort_order: index,
  })),
});

/** The ids of one charger's device. */
export function chargerIds(gladys, serial) {
  return gladys.externalIds(DEVICE_TYPE, serial);
}

/** The name of the charger: the one set in the Fronius app, or its serial. */
export function deviceName(charger) {
  return friendlyName(charger.status, charger.hello) ?? `Wattpilot ${charger.serial}`;
}

/**
 * The device of one charger, from its last status.
 * @param {object} gladys
 * @param {{ serial: string, host: string, hello: object|null, status: object }} charger
 * @param {{ language: string, refresh_interval: string }} config
 */
export function buildDevice(gladys, charger, config) {
  const ids = chargerIds(gladys, charger.serial);
  const names = NAMES[config.language] ?? NAMES.fr;
  const labels = OPTION_LABELS[config.language] ?? OPTION_LABELS.fr;
  const { status } = charger;
  const feature = (key, definition) => ({
    name: names[key],
    external_id: ids.feature(key),
    ...definition,
  });

  const features = [
    feature(
      FEATURE.CONNECTOR_STATUS,
      sensor({
        category: CAT.CHARGING_STATION,
        type: TYPES.CHARGING_STATION.CONNECTOR_STATUS,
        min: 0,
        max: 4,
      }),
    ),
    feature(
      FEATURE.CHARGING_STATE,
      sensor({
        category: CAT.CHARGING_STATION,
        type: TYPES.CHARGING_STATION.CHARGING_STATE,
        min: 0,
        max: 5,
      }),
    ),
    feature(
      FEATURE.PLUGGED,
      sensor({
        category: CAT.ELECTRICAL_VEHICLE_CHARGE,
        type: TYPES.ELECTRICAL_VEHICLE_CHARGE.PLUGGED,
        min: 0,
        max: 1,
      }),
    ),
    feature(
      FEATURE.POWER,
      sensor({
        category: CAT.ENERGY_SENSOR,
        type: TYPES.ENERGY_SENSOR.POWER,
        unit: UNITS.WATT,
        min: 0,
        max: MAX_POWER_W,
      }),
    ),
    ...['L1', 'L2', 'L3'].map((phase) =>
      feature(
        FEATURE[`POWER_${phase}`],
        sensor({
          category: CAT.ENERGY_SENSOR,
          type: TYPES.ENERGY_SENSOR.POWER,
          unit: UNITS.WATT,
          min: 0,
          max: MAX_PHASE_POWER_W,
        }),
      ),
    ),
    ...['L1', 'L2', 'L3'].map((phase) =>
      feature(
        FEATURE[`CURRENT_${phase}`],
        sensor({
          category: CAT.ENERGY_SENSOR,
          type: TYPES.ENERGY_SENSOR.CURRENT,
          unit: UNITS.AMPERE,
          min: 0,
          max: MAX_PHASE_CURRENT_A,
        }),
      ),
    ),
    // Not an energy-sensor: Gladys' energy monitoring turns every
    // energy-sensor/energy feature into a meter, and this one restarts at 0
    // with every session — only the total below is the charger's meter.
    feature(
      FEATURE.SESSION_ENERGY,
      sensor({
        category: CAT.ELECTRICAL_VEHICLE_CHARGE,
        type: TYPES.ELECTRICAL_VEHICLE_CHARGE.LAST_CHARGE_ENERGY_ADDED,
        unit: UNITS.KILOWATT_HOUR,
        min: 0,
        max: 1000,
      }),
    ),
    // The charger's meter: Gladys 5.2 computes the consumption per 30 minutes
    // (and its cost) from this index.
    feature(
      FEATURE.TOTAL_ENERGY,
      sensor({
        category: CAT.ENERGY_SENSOR,
        type: TYPES.ENERGY_SENSOR.INDEX,
        unit: UNITS.KILOWATT_HOUR,
        min: 0,
        max: 10000000,
      }),
    ),
    feature(FEATURE.TARGET_CURRENT, {
      category: CAT.ELECTRICAL_VEHICLE_CHARGE,
      type: TYPES.ELECTRICAL_VEHICLE_CHARGE.TARGET_CURRENT,
      unit: UNITS.AMPERE,
      min: MIN_CURRENT,
      max: hardwareMaxCurrent(status),
      read_only: false,
      has_feedback: true,
      keep_history: true,
    }),
    feature(FEATURE.CHARGING_MODE, select(Object.keys(CHARGING_MODES), labels)),
    feature(FEATURE.FORCE_MODE, select(['neutral', 'on', 'off'], labels)),
    feature(
      FEATURE.TEMPERATURE,
      sensor({
        category: CAT.DEVICE_TEMPERATURE_SENSOR,
        type: TYPES.SENSOR.DECIMAL,
        unit: UNITS.CELSIUS,
        min: -40,
        max: 120,
      }),
    ),
    feature(FEATURE.ERROR, sensor({ category: CAT.TEXT, type: TYPES.TEXT.TEXT, min: 0, max: 0 })),
    feature(
      FEATURE.ONLINE,
      sensor({ category: CAT.INPUT, type: TYPES.INPUT.BINARY, min: 0, max: 1 }),
    ),
  ];

  const params = [
    { name: 'SERIAL', value: charger.serial },
    { name: 'HOST', value: charger.host },
  ];
  if (charger.hello?.devicetype) {
    params.push({ name: 'DEVICE_TYPE', value: charger.hello.devicetype });
  }

  return {
    name: deviceName(charger),
    external_id: ids.device,
    model: modelName(status, charger.hello),
    // The integration pushes the states on its own timer (src/hub.js); the
    // core's poll is a fallback.
    should_poll: true,
    poll_frequency: Number(config.refresh_interval) * 1000,
    params,
    features,
  };
}

/**
 * The states of a charger that answers.
 * @returns {{ device_feature_external_id: string, state?: number, text?: string }[]}
 */
export function statesFor(gladys, charger, language) {
  const ids = chargerIds(gladys, charger.serial);
  const r = readings(charger.status);
  const states = [];
  const number = (key, value) => {
    if (value !== null && value !== undefined) {
      states.push({ device_feature_external_id: ids.feature(key), state: value });
    }
  };
  const text = (key, value) => {
    if (typeof value === 'string' && value !== '') {
      states.push({ device_feature_external_id: ids.feature(key), text: value });
    }
  };
  number(FEATURE.CONNECTOR_STATUS, r.connectorStatus);
  number(FEATURE.CHARGING_STATE, r.chargingState);
  number(FEATURE.PLUGGED, r.plugged);
  number(FEATURE.POWER, r.power.total);
  number(FEATURE.POWER_L1, r.power.l1);
  number(FEATURE.POWER_L2, r.power.l2);
  number(FEATURE.POWER_L3, r.power.l3);
  number(FEATURE.CURRENT_L1, r.current.l1);
  number(FEATURE.CURRENT_L2, r.current.l2);
  number(FEATURE.CURRENT_L3, r.current.l3);
  number(FEATURE.SESSION_ENERGY, r.sessionKwh);
  number(FEATURE.TOTAL_ENERGY, r.totalKwh);
  number(FEATURE.TARGET_CURRENT, r.targetCurrent);
  text(FEATURE.CHARGING_MODE, r.mode);
  text(FEATURE.FORCE_MODE, r.force);
  number(FEATURE.TEMPERATURE, r.temperature);
  if (r.error !== null) {
    text(FEATURE.ERROR, errorLabel(language, r.error));
  }
  number(FEATURE.ONLINE, 1);
  return states;
}

/**
 * The states of a charger that stopped answering: offline and unavailable.
 * The other values keep their last reading (the date tells how old it is).
 */
export function offlineStates(gladys, serial) {
  const ids = chargerIds(gladys, serial);
  return [
    { device_feature_external_id: ids.feature(FEATURE.ONLINE), state: 0 },
    {
      device_feature_external_id: ids.feature(FEATURE.CONNECTOR_STATUS),
      state: CONNECTOR_STATUS.UNAVAILABLE,
    },
  ];
}

// Kept in sync with the select options of the device (manifest scene actions use the same values).
export const FORCE_VALUES = Object.keys(FORCE_MODES);
export const MODE_VALUES = Object.keys(CHARGING_MODES);
