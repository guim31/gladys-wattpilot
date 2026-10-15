// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake
// Gladys) and returns the hub, so index.js stays a few lines and the tests
// drive the very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { ChargerHub, UserError, WIDGET_KEY } from './hub.js';
import { MESSAGES } from './i18n.js';
import { SCENE_ACTIONS } from './scenes.js';
import { createWidget } from './widgets.js';

const logger = createLogger({ name: 'app' });

/** Manifest `actions` keys: forever once published. */
export const ACTIONS = ['test_connection'];

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: connect, linkOptions, timers, now
 */
export function registerHandlers(gladys, options = {}) {
  const hub = new ChargerHub({ gladys, ...options });
  const widget = createWidget(hub);

  // Resolved once the hub has started; the handlers wait for it, so a command
  // arriving during the first connection is not lost.
  let resolveReady;
  let ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  async function start(rawConfig) {
    try {
      await hub.start(normalizeConfig(rawConfig));
    } catch (err) {
      logger.error(`Initialization failed: ${err.message}`);
      await gladys.setConnectionStatus(false, MESSAGES.initFailed).catch(() => {});
    } finally {
      resolveReady();
    }
  }

  gladys.on('connected', async () => {
    const config = await gladys.getConfig();
    // A reconnection to Gladys keeps the link to the charger, unless the
    // configuration changed meanwhile.
    if (hub.config && JSON.stringify(normalizeConfig(config)) === JSON.stringify(hub.config)) {
      return;
    }
    await start(config);
  });

  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('Configuration updated');
    ready = new Promise((resolve) => {
      resolveReady = resolve;
    });
    await start(newConfig);
  });

  gladys.onScanRequest(whenReady(() => hub.publishDevices()));

  gladys.onSetValue(
    whenReady(async (device, feature, value) => {
      // The hub writes the one info line of the action, once it succeeded.
      logger.debug(`Command ${feature.external_id} = ${value}`);
      try {
        await hub.setValue(device, feature, value);
      } catch (err) {
        throw err instanceof UserError ? new Error(err.userMessage.en) : err;
      }
    }),
  );

  // Fallback of the hub's own timer (see src/hub.js).
  gladys.onPoll(whenReady((device) => hub.pollFromCore(device)));
  gladys.onDeviceCreated(whenReady((device) => hub.deviceCreated(device)));
  gladys.onDeviceUpdated(whenReady((device) => hub.deviceCreated(device)));

  gladys.onAction(
    'test_connection',
    whenReady(() => hub.testConnection()),
  );

  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(
      key,
      whenReady((fields) => handler(hub, fields)),
    );
  }

  gladys.onWidgetGet(
    WIDGET_KEY,
    whenReady((request) => widget.get(request)),
  );
  gladys.onWidgetAction(
    WIDGET_KEY,
    whenReady(async (actionKey, params, context) => {
      logger.debug(`Widget action ${actionKey}`);
      try {
        return await widget.action(actionKey, params, context);
      } catch (err) {
        if (err instanceof UserError) {
          // A toast in the user's language rather than a failed action.
          return err.userMessage;
        }
        throw err;
      }
    }),
  );

  gladys.on('disconnected', () => {
    logger.debug('Gladys disconnected: states are sent again once it is back');
  });

  return hub;
}
