// -----------------------------------------------------------------------------
// Entry point of the Gladys Hydro-Québec external integration.
//
// Unlike a "fixed catalog" integration, the device list here is built at
// runtime from what Hydro-Québec's API tells us about the logged-in account:
// one Gladys device per contract (see src/devices/contract.js), because one
// account can have several contracts (e.g. a primary residence and a rental).
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, isConfigured } from './src/config.js';
import { HydroQcSession } from './src/hydroquebec/session.js';
import { buildContractDevice, pollContractDevice } from './src/devices/contract.js';

const gladys = new GladysIntegration();

let config = normalizeConfig();
let session = null;
// Our own refresh loop: Gladys's device.poll_frequency is an enum of fixed
// 1-60s values meant for fast local devices (see buildContractDevice), so it
// cannot express "once an hour" and is never set on our devices. Instead we
// drive polling ourselves at config.poll_frequency and push states directly.
let pollTimer = null;

function credentialsChanged(previous, next) {
  return previous.username !== next.username || previous.password !== next.password;
}

async function publishDevices() {
  if (!session) {
    await gladys.publishDiscoveredDevices([]);
    return;
  }
  const devices = session.contracts.map((contract) => buildContractDevice(gladys, contract));
  await gladys.publishDiscoveredDevices(devices);
}

async function pollAllContracts() {
  if (!session) return;
  for (const contract of session.contracts) {
    try {
      await pollContractDevice(gladys, session, contract, config);
    } catch (err) {
      logger.error(`Poll failed for contract ${contract.contractId}`, err);
    }
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function schedulePolling() {
  stopPolling();
  if (!session || session.contracts.length === 0) return;
  pollTimer = setInterval(() => {
    pollAllContracts()
      .then(() => gladys.setConnectionStatus(true))
      .catch((err) => {
        logger.error('Scheduled poll failed', err);
        gladys
          .setConnectionStatus(false, {
            en: `Hydro-Québec request failed: ${err.message}`,
            fr: `Échec d’une requête Hydro-Québec : ${err.message}`,
          })
          .catch(() => {});
      });
  }, config.poll_frequency * 1000);
}

function replaceSession(newSession) {
  // Each HydroQcSession owns a Python bridge subprocess: stop the old one
  // before dropping the reference, or it would leak as an orphaned process.
  stopPolling();
  session?.stop();
  session = newSession;
}

async function refreshFromHydroQuebec({ forceDiscovery = false } = {}) {
  if (!isConfigured(config)) {
    replaceSession(null);
    await publishDevices();
    await gladys.setConnectionStatus(false, {
      en: 'Enter your Hydro-Québec email/username and password in the Configuration screen.',
      fr: 'Entrez votre courriel/identifiant et mot de passe Hydro-Québec dans l’écran de configuration.',
    });
    return;
  }

  if (!session || credentialsChanged(session, config)) {
    replaceSession(new HydroQcSession(config.username, config.password, logger));
  }

  await session.ensureContracts(forceDiscovery);
  await publishDevices();

  if (session.contracts.length === 0) {
    await gladys.setConnectionStatus(false, {
      en: 'Login succeeded but no Hydro-Québec contract was found on this account.',
      fr: 'La connexion a réussi mais aucun contrat Hydro-Québec n’a été trouvé sur ce compte.',
    });
    return;
  }

  // Publish an initial reading right away instead of waiting a full
  // poll_frequency for the first data point, then hand off to the interval.
  await pollAllContracts();
  schedulePolling();
  await gladys.setConnectionStatus(true);
}

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> refreshing contracts from Hydro-Québec');
  try {
    await refreshFromHydroQuebec({ forceDiscovery: true });
  } catch (err) {
    logger.error('Discovery failed', err);
    await gladys.setConnectionStatus(false, {
      en: `Could not reach Hydro-Québec: ${err.message}`,
      fr: `Impossible de joindre Hydro-Québec : ${err.message}`,
    });
  }
});

// --- Manifest action: test the connection -------------------------------------
gladys.onAction('test_connection', async () => {
  if (!isConfigured(config)) {
    return {
      en: 'Enter your username and password first.',
      fr: 'Entrez d’abord votre identifiant et votre mot de passe.',
    };
  }
  const testSession = new HydroQcSession(config.username, config.password, logger);
  try {
    await testSession.testConnection();
    return { en: 'Login to Hydro-Québec succeeded.', fr: 'Connexion à Hydro-Québec réussie.' };
  } catch (err) {
    return {
      en: `Login failed: ${err.message}`,
      fr: `Échec de la connexion : ${err.message}`,
    };
  } finally {
    testSession.stop();
  }
});

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  try {
    await refreshFromHydroQuebec({ forceDiscovery: true });
  } catch (err) {
    logger.error('Refresh after config update failed', err);
    await gladys.setConnectionStatus(false, {
      en: `Could not reach Hydro-Québec: ${err.message}`,
      fr: `Impossible de joindre Hydro-Québec : ${err.message}`,
    });
  }
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    await refreshFromHydroQuebec({ forceDiscovery: false });
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
      })
      .catch(() => {});
  }
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  stopPolling();
  session?.stop();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Hydro-Québec integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
