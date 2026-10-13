// -----------------------------------------------------------------------------
// Entry point: SDK wiring only. Every handler is registered BEFORE connect(),
// and delegates to the LiveboxApp (src/app.js).
//
// Environment variables provided by the Gladys supervisor, read by the SDK:
// GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { LiveboxApp } from './src/app.js';
import { ACTIONS, SCENE_ACTIONS, WIDGETS } from './src/constants.js';

const gladys = new GladysIntegration();
const app = new LiveboxApp({ gladys });

// --- Discovery and commands ------------------------------------------------------
gladys.onScanRequest(() => app.publishDevices());
gladys.onSetValue((device, feature, value) => app.setValue(device, feature, value));

// --- Scene actions --------------------------------------------------------------
gladys.onSceneAction(SCENE_ACTIONS.DEVICES, () => app.getDevices());
gladys.onSceneAction(SCENE_ACTIONS.WIFI, (fields) => app.setWifi(fields));
gladys.onSceneAction(SCENE_ACTIONS.REBOOT, () => app.reboot());

// --- Dashboard widgets ----------------------------------------------------------
for (const key of Object.values(WIDGETS)) {
  gladys.onWidgetGet(key, (request) => app.getWidget(key, request));
}

// --- Configuration screen buttons ----------------------------------------------
gladys.onAction(ACTIONS.TEST, () => app.testConnection());
gladys.onAction(ACTIONS.REBOOT, () => app.rebootAction());

// --- Configuration changed by the user ----------------------------------------
gladys.onConfigUpdated((config) => {
  logger.info('Configuration updated: restarting');
  return app.start(config);
});

// --- Connection lifecycle ------------------------------------------------------
gladys.on('connected', async () => {
  try {
    await app.start(await gladys.getConfig());
  } catch (err) {
    logger.error('Start failed', err);
  }
});
gladys.on('disconnected', () => app.stop());
gladys.handleShutdown(() => app.stop());

logger.info('Starting the Livebox integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
