// -----------------------------------------------------------------------------
// Entry point: SDK wiring only. Every handler is registered BEFORE connect(),
// and delegates to the TadoApp (src/app.js).
//
// Environment variables provided by the Gladys supervisor, read by the SDK:
// GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { TadoApp } from './src/app.js';
import { ACTIONS, CONFIG_KEYS, SCENE_ACTIONS, WIDGETS } from './src/constants.js';

const gladys = new GladysIntegration();
const app = new TadoApp({ gladys });

// --- Discovery and commands ------------------------------------------------------
gladys.onScanRequest(async () => {
  await app.discover();
  await app.refresh();
});
gladys.onSetValue((device, feature, value) => app.setValue(device, feature, value));

// --- Account linking: the device-code flow needs no redirect ---------------------
gladys.onOAuthAuthorizeUrl((key) => {
  if (key !== CONFIG_KEYS.ACCOUNT) {
    throw new Error(`Unknown account field ${key}`);
  }
  return app.authorizeUrl();
});

// --- Scene actions --------------------------------------------------------------
gladys.onSceneAction(SCENE_ACTIONS.SET_TEMPERATURE, (fields) => app.setTemperature(fields));
gladys.onSceneAction(SCENE_ACTIONS.RESUME_SCHEDULE, (fields) => app.resumeSchedule(fields));
gladys.onSceneAction(SCENE_ACTIONS.SET_PRESENCE, (fields) => app.setPresence(fields));
gladys.onSceneAction(SCENE_ACTIONS.GET_ZONE, (fields) => app.getZone(fields));

// --- Dashboard widgets ----------------------------------------------------------
for (const key of Object.values(WIDGETS)) {
  gladys.onWidgetGet(key, (request) => app.getWidget(key, request));
  gladys.onWidgetAction(key, (actionKey, params, context) =>
    app.widgetAction(key, actionKey, params, context),
  );
}

// --- Configuration screen buttons ----------------------------------------------
gladys.onAction(ACTIONS.TEST, () => app.testConnection());
gladys.onAction(ACTIONS.UNLINK, () => app.unlink());

// --- Configuration changed by the user (or a token saved by the app) -----------
gladys.onConfigUpdated((config) => app.configUpdated(config));

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

logger.info('Starting the tado° integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
