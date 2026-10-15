// -----------------------------------------------------------------------------
// From a Wattpilot status to the values Gladys shows. Pure functions, tested
// on the fixtures of test/fixtures/wattpilot.
//
// The Wattpilot shares its keys with the go-e Charger API v2 (same firmware
// heritage): `car`, `nrg`, `amp`, `frc`, `err`... plus `lmo`, the charging
// mode of the Fronius app (Default, Eco, Next Trip).
//
// The Wattpilot describes the session with one key, `car`; Gladys (5.2)
// describes a charging station with two enums aligned on OCPP: the connector
// status and the charging state. The mapping follows the OCPP 1.6 → 2.0.1
// split the core documents in server/utils/constants.js:
//
//   car                    connector     charging state
//   1 Idle (no car)        AVAILABLE     IDLE
//   2 Charging             OCCUPIED      CHARGING
//   3 WaitCar, allowed     OCCUPIED      EV_CONNECTED      (OCPP Preparing)
//   3 WaitCar, not allowed OCCUPIED      PAUSED_BY_CHARGER (OCPP SuspendedEVSE:
//                                        Eco waiting for sun or a cheap hour,
//                                        charge forced off...)
//   4 Complete             OCCUPIED      PAUSED_BY_VEHICLE (OCPP SuspendedEV:
//                                        the car stopped drawing, it is full)
//   5 Error, or err != 0   FAULTED       IDLE
//   0 / null (internal)    UNAVAILABLE   IDLE
// -----------------------------------------------------------------------------

/** Wattpilot `car` values. */
export const CAR = {
  UNKNOWN: 0,
  IDLE: 1,
  CHARGING: 2,
  WAIT_CAR: 3,
  COMPLETE: 4,
  ERROR: 5,
};

/** Gladys CHARGING_STATION_CONNECTOR_STATUS (server/utils/constants.js, 5.2.1). */
export const CONNECTOR_STATUS = {
  AVAILABLE: 0,
  OCCUPIED: 1,
  RESERVED: 2,
  UNAVAILABLE: 3,
  FAULTED: 4,
};

/** Gladys CHARGING_STATION_CHARGING_STATE (server/utils/constants.js, 5.2.1). */
export const CHARGING_STATE = {
  CHARGING: 0,
  EV_CONNECTED: 1,
  PAUSED_BY_VEHICLE: 2,
  PAUSED_BY_CHARGER: 3,
  IDLE: 4,
};

/** Wattpilot `frc` (force state), by the option value Gladys stores. */
export const FORCE_MODES = { neutral: 0, off: 1, on: 2 };

/** Wattpilot `lmo` (logic mode), by the option value Gladys stores. */
export const CHARGING_MODES = { default: 3, eco: 4, next_trip: 5 };

/** The lowest current an EV accepts (IEC 61851), and the Wattpilot minimum. */
export const MIN_CURRENT = 6;

const keyOf = (table, value) => Object.keys(table).find((key) => table[key] === value) ?? null;

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const round = (value, digits) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * The highest current of the hardware: 16 A for the 11 kW variants, 32 A for
 * the 22 kW ones. Unknown variant: 32 A, the charger refuses what it cannot do.
 */
export function hardwareMaxCurrent(status) {
  return status.var === 11 ? 16 : 32;
}

/**
 * The highest current a command may ask: the hardware, lowered by the limit
 * set in the Wattpilot app (`ama`) when there is one.
 */
export function allowedMaxCurrent(status) {
  const hardware = hardwareMaxCurrent(status);
  return isNumber(status.ama) && status.ama >= MIN_CURRENT
    ? Math.min(hardware, status.ama)
    : hardware;
}

/** The car is plugged in, whatever it does. */
export function isPlugged(car) {
  return car === CAR.CHARGING || car === CAR.WAIT_CAR || car === CAR.COMPLETE;
}

export function connectorStatus(status) {
  const car = status.car;
  if (car === CAR.ERROR || (isNumber(status.err) && status.err !== 0)) {
    return CONNECTOR_STATUS.FAULTED;
  }
  if (car === CAR.IDLE) {
    return CONNECTOR_STATUS.AVAILABLE;
  }
  if (isPlugged(car)) {
    return CONNECTOR_STATUS.OCCUPIED;
  }
  return CONNECTOR_STATUS.UNAVAILABLE;
}

export function chargingState(status) {
  switch (status.car) {
    case CAR.CHARGING:
      return CHARGING_STATE.CHARGING;
    case CAR.WAIT_CAR:
      return status.alw === false ? CHARGING_STATE.PAUSED_BY_CHARGER : CHARGING_STATE.EV_CONNECTED;
    case CAR.COMPLETE:
      return CHARGING_STATE.PAUSED_BY_VEHICLE;
    default:
      return CHARGING_STATE.IDLE;
  }
}

/** The hottest of the temperature sensors, °C, or null. */
export function temperature(status) {
  const values = Array.isArray(status.tma) ? status.tma.filter(isNumber) : [];
  return values.length > 0 ? Math.max(...values) : null;
}

/** The friendly name set in the Fronius app, or null. */
export function friendlyName(status, hello) {
  for (const name of [status?.fna, hello?.friendlyName]) {
    if (typeof name === 'string' && name.trim() !== '') {
      return name.trim().slice(0, 60);
    }
  }
  return null;
}

/** The model shown in Gladys: "Wattpilot 22 kW", "Wattpilot Flex 11 kW". */
export function modelName(status, hello) {
  const base = hello?.devicetype === 'wattpilot_flex' ? 'Wattpilot Flex' : 'Wattpilot';
  return isNumber(status.var) ? `${base} ${status.var} kW` : base;
}

/**
 * Everything Gladys shows, read from one status. A value the status does not
 * carry is null (and not published).
 * @param {Record<string, unknown>} status
 */
export function readings(status) {
  const nrg = Array.isArray(status.nrg) ? status.nrg : [];
  // nrg: U L1 L2 L3 N (0-3), I L1 L2 L3 (4-6), P L1 L2 L3 N total (7-11), pf (12-15).
  const at = (index, digits) => (isNumber(nrg[index]) ? round(nrg[index], digits) : null);
  return {
    car: isNumber(status.car) ? status.car : null,
    connectorStatus: connectorStatus(status),
    chargingState: chargingState(status),
    plugged: isPlugged(status.car) ? 1 : 0,
    power: { total: at(11, 0), l1: at(7, 0), l2: at(8, 0), l3: at(9, 0) },
    current: { l1: at(4, 2), l2: at(5, 2), l3: at(6, 2) },
    sessionKwh: isNumber(status.wh) ? round(status.wh / 1000, 2) : null,
    totalKwh: isNumber(status.eto) ? round(status.eto / 1000, 3) : null,
    targetCurrent: isNumber(status.amp) ? status.amp : null,
    force: keyOf(FORCE_MODES, status.frc),
    mode: keyOf(CHARGING_MODES, status.lmo),
    error: isNumber(status.err) ? status.err : null,
    temperature: temperature(status),
  };
}
