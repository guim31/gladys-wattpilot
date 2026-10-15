// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+). Keys are forever.
//
// The charging current needs none: it is a device feature, set by the core's
// own "control a device" action. The charging mode and the override are text
// selects, which the scene editor cannot set: each gets its own action —
// "Eco during the day, Default at night", "stop charging when the house
// draws too much".
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { UserError } from './hub.js';

const logger = createLogger({ name: 'scenes' });

/** A scene logs the error message: say it in English, plainly. */
async function run(fn) {
  try {
    await fn();
  } catch (err) {
    throw err instanceof UserError ? new Error(err.userMessage.en) : err;
  }
  return undefined;
}

export const SCENE_ACTIONS = {
  /**
   * @param {import('./hub.js').ChargerHub} hub
   * @param {{ charger: string, mode: 'default'|'eco'|'next_trip' }} fields
   */
  async set_charging_mode(hub, fields) {
    logger.debug(`Scene action set_charging_mode <- ${fields.mode}`);
    return run(() => hub.setChargingMode(fields.charger, fields.mode));
  },

  /**
   * @param {import('./hub.js').ChargerHub} hub
   * @param {{ charger: string, override: 'neutral'|'on'|'off' }} fields
   */
  async set_charge_override(hub, fields) {
    logger.debug(`Scene action set_charge_override <- ${fields.override}`);
    return run(() => hub.setForceMode(fields.charger, fields.override));
  },
};
