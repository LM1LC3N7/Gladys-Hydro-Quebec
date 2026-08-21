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

export function buildContractDevice(gladys, contract) {
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
    // Deliberately NOT setting `poll_frequency` here: Gladys's own field by
    // that name is an enum of 6 fixed millisecond values (1/2/10/15/30/60s -
    // see DEVICE_POLL_FREQUENCIES in the Gladys server), meant for fast local
    // devices polled by the core's own scheduler. It cannot express "once an
    // hour", and setting it to anything else is rejected outright ("invalid
    // poll frequency"). `config.poll_frequency` (seconds, 300-86400) is a
    // completely different, integration-owned setting: index.js drives its
    // own setInterval with it and pushes states via publishStates() directly,
    // never going through Gladys's per-device poll mechanism at all.
    params: [
      { name: 'contract_id', value: contract.contractId },
      { name: 'account_id', value: contract.accountId },
      { name: 'rate', value: `${contract.rate}${contract.rateOption ? `/${contract.rateOption}` : ''}` },
      { name: 'address', value: contract.address ?? '' },
    ],
    features,
  };
}

/**
 * Fetch fresh data for one contract and publish every feature state to Gladys.
 *
 * `session.fetchContractSnapshot()` returns the flat JSON produced by the
 * `poll` command of bridge/hq_bridge.py - already-derived values straight
 * from hydroqc's own Contract/PeakHandler properties (cumulated credit,
 * current_state, critical hours called...), not raw API payloads: there is
 * no Hydro-Québec-specific parsing left to do here.
 */
export async function pollContractDevice(gladys, session, contract, config) {
  const ids = gladys.externalIds('contract', contract.contractId);
  const snapshot = await session.fetchContractSnapshot(contract, config?.preheat_duration_minutes);
  const states = [];

  const pushNumber = (key, value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return;
    states.push({ device_feature_external_id: ids.feature(key), state: Number(value) });
  };
  const pushText = (key, value) => {
    if (value === null || value === undefined) return;
    states.push({ device_feature_external_id: ids.feature(key), text: String(value) });
  };

  pushNumber(FEATURE.DAILY_CONSUMPTION, snapshot.daily_consumption_kwh);
  pushNumber(FEATURE.AVG_TEMPERATURE, snapshot.avg_temperature);
  pushNumber(FEATURE.DAILY_CONSUMPTION_COST, snapshot.daily_cost_mean);
  pushNumber(FEATURE.BALANCE, snapshot.balance);
  pushNumber(FEATURE.POWER_OUTAGE, snapshot.outage_active ? 1 : 0);

  if (snapshot.cpc) {
    pushNumber(FEATURE.CPC_CUMULATED_CREDIT, snapshot.cpc.cumulated_credit);
    pushNumber(FEATURE.CPC_PROJECTED_CREDIT, snapshot.cpc.projected_cumulated_credit);
    pushText(FEATURE.CPC_STATE, snapshot.cpc.current_state);
    pushNumber(FEATURE.CPC_CRITICAL_PEAK_COMING, snapshot.cpc.critical_peak_coming ? 1 : 0);
    pushNumber(FEATURE.CPC_PREHEAT_IN_PROGRESS, snapshot.cpc.preheat_in_progress ? 1 : 0);
  }

  if (snapshot.dpc) {
    pushText(FEATURE.DPC_STATE, snapshot.dpc.current_state);
    pushNumber(FEATURE.DPC_PEAK_IN_PROGRESS, snapshot.dpc.peak_in_progress ? 1 : 0);
    pushNumber(FEATURE.DPC_PREHEAT_IN_PROGRESS, snapshot.dpc.preheat_in_progress ? 1 : 0);
    pushNumber(FEATURE.DPC_HOURS_CRITICAL_CALLED, snapshot.dpc.critical_called_hours);
    pushNumber(FEATURE.DPC_SAVINGS_VS_BASE, snapshot.dpc.amount_saved_vs_base_rate);
  }

  if (states.length === 0) {
    logger.warn(`No data could be fetched for contract ${contract.contractId}, skipping publish`);
    return;
  }
  await gladys.publishStates(states);
}
