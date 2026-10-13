// -----------------------------------------------------------------------------
// Entry point: SDK wiring only. Every handler is registered BEFORE connect(),
// and delegates to the IftttApp (src/app.js).
//
// Environment variables provided by the Gladys supervisor, read by the SDK:
// GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { IftttApp } from './src/app.js';
import { ACTIONS, SCENE_ACTIONS, WEBHOOKS, WIDGETS } from './src/constants.js';

const gladys = new GladysIntegration();
const app = new IftttApp({ gladys });

// --- Scene actions --------------------------------------------------------------
gladys.onSceneAction(SCENE_ACTIONS.TRIGGER, (fields) => app.triggerEvent(fields));
gladys.onSceneAction(SCENE_ACTIONS.TRIGGER_JSON, (fields) => app.triggerEventJson(fields));

// --- Inbound webhook relayed by Gladys Plus -------------------------------------
gladys.onWebhook(WEBHOOKS.INBOUND, (request) => app.handleInbound(request));
gladys.onWebhookUpdated(async (info) => {
  await app.refreshWebhooks(info);
  await app.reportStatus();
});

// --- Dashboard widget ----------------------------------------------------------
gladys.onWidgetGet(WIDGETS.BUTTON, (request) => app.getWidget(request));
gladys.onWidgetAction(WIDGETS.BUTTON, (actionKey, params, context) =>
  app.widgetAction(actionKey, params, context),
);

// --- Configuration screen button ----------------------------------------------
gladys.onAction(ACTIONS.TEST, (fields) => app.testConnection(fields));

// --- Configuration changed by the user ----------------------------------------
gladys.onConfigUpdated((config) => {
  logger.info('Configuration updated');
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

gladys.handleShutdown();

logger.info('Starting the IFTTT integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
