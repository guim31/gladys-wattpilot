// -----------------------------------------------------------------------------
// Entry point of the Fronius Wattpilot integration for Gladys Assistant.
//
// The SDK reads the variables the Gladys supervisor gives the container
// (GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR).
// Every handler lives in src/app.js; the charger in src/hub.js.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/app.js';

const gladys = new GladysIntegration();
const hub = registerHandlers(gladys);

// SIGTERM/SIGINT: close the charger connection and the timer, exit 0.
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal}: shutting down`);
  hub.stop();
});

logger.info('Starting the Fronius Wattpilot integration');
gladys.connect().catch((err) => {
  logger.error(`Initial connection failed: ${err.message}`);
  process.exit(1);
});
