// -----------------------------------------------------------------------------
// Device blueprint: one Hydro-Québec CONTRACT = one Gladys device.
//
// Unlike the SDK template (a fixed list of demo devices), the device list
// here is dynamic: it depends on how many contracts the logged-in Hydro-
// Québec account actually has (see src/hydroquebec/session.js). `index.js`
// builds one of these per entry of `session.contracts` on every discovery /
// config update.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  createLogger,
} from '@gladysassistant/integration-sdk';
import { isCpcContract, isDpcContract } from '../hydroquebec/discovery.js';

const logger = createLogger({ name: 'contract' });

const FEATURE = {
  DAILY_CONSUMPTION: 'daily_consumption',
  DAILY_CONSUMPTION_COST: 'daily_consumption_cost',
  AVG_TEMPERATURE: 'avg_temperature',
  BALANCE: 'balance',
  POWER_OUTAGE: 'power_outage',
  CPC_CUMULATED_CREDIT: 'cpc_cumulated_credit',
  CPC_PROJECTED_CREDIT: 'cpc_projected_credit',
  CPC_STATE: 'cpc_state',
  CPC_CRITICAL_PEAK_COMING: 'cpc_critical_peak_coming',
  CPC_PREHEAT_IN_PROGRESS: 'cpc_preheat_in_progress',
  DPC_STATE: 'dpc_state',
  DPC_PEAK_IN_PROGRESS: 'dpc_peak_in_progress',
  DPC_PREHEAT_IN_PROGRESS: 'dpc_preheat_in_progress',
  DPC_HOURS_CRITICAL_CALLED: 'dpc_hours_critical_called',
  DPC_SAVINGS_VS_BASE: 'dpc_savings_vs_base',
};

const CPC_STATE_OPTIONS = [
  { value: 'normal', label: { en: 'Normal', fr: 'Normal' } },
  { value: 'anchor', label: { en: 'Anchor period', fr: 'Période ancre' } },
  { value: 'critical_anchor', label: { en: 'Critical anchor period', fr: 'Période ancre critique' } },
  { value: 'peak', label: { en: 'Peak period', fr: 'Période de pointe' } },
  { value: 'critical_peak', label: { en: 'Critical peak period', fr: 'Période de pointe critique' } },
];

const DPC_STATE_OPTIONS = [
  { value: 'normal', label: { en: 'Normal', fr: 'Normal' } },
  { value: 'peak', label: { en: 'Critical peak period', fr: 'Période de pointe critique' } },
];

function contractLabel(contract) {
  const name = contract.customerNames?.[0];
  return name ? `Hydro-Québec – ${name} (${contract.contractId})` : `Hydro-Québec – ${contract.contractId}`;
}

export function contractDeviceExternalId(gladys, contractId) {
  return gladys.externalIds('contract', contractId).device;
}

export function buildContractDevice(gladys, contract, config) {
  const ids = gladys.externalIds('contract', contract.contractId);
  const isCpc = isCpcContract(contract);
  const isDpc = isDpcContract(contract);

  const features = [
    {
      name: 'Daily consumption',
      external_id: ids.feature(FEATURE.DAILY_CONSUMPTION),
      category: DEVICE_FEATURE_CATEGORIES.ENERGY_SENSOR,
      type: DEVICE_FEATURE_TYPES.ENERGY_SENSOR.DAILY_CONSUMPTION,
      unit: DEVICE_FEATURE_UNITS.KILOWATT_HOUR,
      min: 0,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    },
    {
      name: 'Average daily cost (current period)',
      external_id: ids.feature(FEATURE.DAILY_CONSUMPTION_COST),
      category: DEVICE_FEATURE_CATEGORIES.ENERGY_SENSOR,
      type: DEVICE_FEATURE_TYPES.ENERGY_SENSOR.DAILY_CONSUMPTION_COST,
      unit: DEVICE_FEATURE_UNITS.DOLLAR,
      min: 0,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    },
    {
      name: 'Average outdoor temperature',
      external_id: ids.feature(FEATURE.AVG_TEMPERATURE),
      category: DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR,
      type: DEVICE_FEATURE_TYPES.TEMPERATURE_SENSOR.AVERAGE,
      unit: DEVICE_FEATURE_UNITS.CELSIUS,
      min: -50,
      max: 50,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    },
    {
      name: 'Account balance',
      external_id: ids.feature(FEATURE.BALANCE),
      category: DEVICE_FEATURE_CATEGORIES.CURRENCY,
      type: DEVICE_FEATURE_TYPES.CURRENCY.DECIMAL,
      unit: DEVICE_FEATURE_UNITS.DOLLAR,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    },
    {
      name: 'Power outage in progress',
      external_id: ids.feature(FEATURE.POWER_OUTAGE),
      category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
      type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    },
  ];

  if (isCpc) {
    features.push(
      {
        name: 'Winter Credit – cumulated credit',
        external_id: ids.feature(FEATURE.CPC_CUMULATED_CREDIT),
        category: DEVICE_FEATURE_CATEGORIES.CURRENCY,
        type: DEVICE_FEATURE_TYPES.CURRENCY.DECIMAL,
        unit: DEVICE_FEATURE_UNITS.DOLLAR,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
      {
        name: 'Winter Credit – projected credit',
        external_id: ids.feature(FEATURE.CPC_PROJECTED_CREDIT),
        category: DEVICE_FEATURE_CATEGORIES.CURRENCY,
        type: DEVICE_FEATURE_TYPES.CURRENCY.DECIMAL,
        unit: DEVICE_FEATURE_UNITS.DOLLAR,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
      {
        name: 'Winter Credit – current state',
        external_id: ids.feature(FEATURE.CPC_STATE),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.SELECT,
        supported_options: CPC_STATE_OPTIONS,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
      {
        name: 'Winter Credit – critical peak coming',
        external_id: ids.feature(FEATURE.CPC_CRITICAL_PEAK_COMING),
        category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
        type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
      {
        name: 'Winter Credit – pre-heat in progress',
        external_id: ids.feature(FEATURE.CPC_PREHEAT_IN_PROGRESS),
        category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
        type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
    );
  }

  if (isDpc) {
    features.push(
      {
        name: 'Flex D – current state',
        external_id: ids.feature(FEATURE.DPC_STATE),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.SELECT,
        supported_options: DPC_STATE_OPTIONS,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
      {
        name: 'Flex D – peak in progress',
        external_id: ids.feature(FEATURE.DPC_PEAK_IN_PROGRESS),
        category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
        type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
      {
        name: 'Flex D – pre-heat in progress',
        external_id: ids.feature(FEATURE.DPC_PREHEAT_IN_PROGRESS),
        category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
        type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
      {
        name: 'Flex D – critical hours called this winter',
        external_id: ids.feature(FEATURE.DPC_HOURS_CRITICAL_CALLED),
        category: DEVICE_FEATURE_CATEGORIES.DURATION,
        type: DEVICE_FEATURE_TYPES.DURATION.DECIMAL,
        unit: DEVICE_FEATURE_UNITS.HOURS,
        min: 0,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
      {
        name: 'Flex D – savings vs. base rate',
        external_id: ids.feature(FEATURE.DPC_SAVINGS_VS_BASE),
        category: DEVICE_FEATURE_CATEGORIES.CURRENCY,
        type: DEVICE_FEATURE_TYPES.CURRENCY.DECIMAL,
        unit: DEVICE_FEATURE_UNITS.DOLLAR,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
    );
  }

  return {
    name: contractLabel(contract),
    external_id: ids.device,
    poll_frequency: config.poll_frequency,
    params: [
      { name: 'contract_id', value: contract.contractId },
      { name: 'account_id', value: contract.accountId },
      { name: 'rate', value: `${contract.rate}${contract.rateOption ? `/${contract.rateOption}` : ''}` },
      { name: 'address', value: contract.address ?? '' },
    ],
    features,
  };
}

/** Parses hydroqc's `hrsCritiquesAppelees` ("H:MM" or "HH:MM:SS"-ish duration string) into hours. */
function parseHoursString(value) {
  if (!value || typeof value !== 'string') return null;
  const parts = value.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  const [h = 0, m = 0, s = 0] = parts;
  return Math.round((h + m / 60 + s / 3600) * 100) / 100;
}

/** Fetch fresh data for one contract and publish every feature state to Gladys. */
export async function pollContractDevice(gladys, session, contract) {
  const ids = gladys.externalIds('contract', contract.contractId);
  const snapshot = await session.fetchContractSnapshot(contract);
  const states = [];

  const pushNumber = (key, value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return;
    states.push({ device_feature_external_id: ids.feature(key), state: Number(value) });
  };
  const pushText = (key, value) => {
    if (value === null || value === undefined) return;
    states.push({ device_feature_external_id: ids.feature(key), text: String(value) });
  };

  const latestDay = snapshot.daily?.results?.[0]?.courant;
  pushNumber(FEATURE.DAILY_CONSUMPTION, latestDay?.consoTotalQuot);
  pushNumber(FEATURE.AVG_TEMPERATURE, latestDay?.tempMoyenneQuot);

  const currentPeriod = snapshot.periods?.[0];
  pushNumber(FEATURE.DAILY_CONSUMPTION_COST, currentPeriod?.moyenneDollarsJourPeriode);

  pushNumber(FEATURE.BALANCE, contract.account?.solde);

  const activeOutage = Boolean(
    snapshot.outage?.interruptions?.some((interruption) => interruption.etat === 'C' || interruption.etat === 'N'),
  );
  pushNumber(FEATURE.POWER_OUTAGE, activeOutage ? 1 : 0);

  if (snapshot.cpc) {
    pushNumber(FEATURE.CPC_CUMULATED_CREDIT, snapshot.cpc.cumulatedCredit);
    pushNumber(FEATURE.CPC_PROJECTED_CREDIT, snapshot.cpc.projectedCumulatedCredit);
    pushText(FEATURE.CPC_STATE, snapshot.cpc.currentState);
    pushNumber(FEATURE.CPC_CRITICAL_PEAK_COMING, snapshot.cpc.isAnyCriticalPeakComing ? 1 : 0);
    pushNumber(FEATURE.CPC_PREHEAT_IN_PROGRESS, snapshot.cpc.preheatInProgress ? 1 : 0);
  }

  if (snapshot.dpc) {
    pushText(FEATURE.DPC_STATE, snapshot.dpc.currentState);
    pushNumber(FEATURE.DPC_PEAK_IN_PROGRESS, snapshot.dpc.peakInProgress ? 1 : 0);
    pushNumber(FEATURE.DPC_PREHEAT_IN_PROGRESS, snapshot.dpc.preheatInProgress ? 1 : 0);
    const winterInfo = snapshot.dpc.raw?.periodesHiver?.[0];
    pushNumber(FEATURE.DPC_HOURS_CRITICAL_CALLED, parseHoursString(winterInfo?.hrsCritiquesAppelees));
    pushNumber(FEATURE.DPC_SAVINGS_VS_BASE, winterInfo?.montantEconPerteVSTarifBase);
  }

  if (states.length === 0) {
    logger.warn(`No data could be fetched for contract ${contract.contractId}, skipping publish`);
    return;
  }
  await gladys.publishStates(states);
}
