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

// publishStates() accepts at most 100 states per request.
const MAX_STATES_PER_REQUEST = 100;

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
      max: 2000,
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
      max: 500,
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
      // Can go negative (account in credit), not just positive (amount owed).
      min: -5000,
      max: 5000,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    },
    {
      name: 'Power outage in progress',
      external_id: ids.feature(FEATURE.POWER_OUTAGE),
      category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
      type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
      min: 0,
      max: 1,
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
        min: 0,
        max: 1000,
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
        min: 0,
        max: 1000,
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
        // min/max are meaningless for a text/select feature but the column is
        // NOT NULL regardless of category/type - 0/1 is an inert placeholder,
        // the actual valid values are CPC_STATE_OPTIONS above.
        min: 0,
        max: 1,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
      {
        name: 'Winter Credit – critical peak coming',
        external_id: ids.feature(FEATURE.CPC_CRITICAL_PEAK_COMING),
        category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
        type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        min: 0,
        max: 1,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
      {
        name: 'Winter Credit – pre-heat in progress',
        external_id: ids.feature(FEATURE.CPC_PREHEAT_IN_PROGRESS),
        category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
        type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        min: 0,
        max: 1,
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
        min: 0,
        max: 1,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
      {
        name: 'Flex D – peak in progress',
        external_id: ids.feature(FEATURE.DPC_PEAK_IN_PROGRESS),
        category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
        type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        min: 0,
        max: 1,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
      {
        name: 'Flex D – pre-heat in progress',
        external_id: ids.feature(FEATURE.DPC_PREHEAT_IN_PROGRESS),
        category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
        type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        min: 0,
        max: 1,
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
        max: 200,
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
        // Can go negative if Flex D ends up costing more than the base rate.
        min: -1000,
        max: 1000,
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

function statesBuilder(ids) {
  const states = [];
  const pushNumber = (key, value, createdAt) => {
    if (value === null || value === undefined) return;
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    const state = { device_feature_external_id: ids.feature(key), state: number };
    if (createdAt) state.created_at = createdAt;
    states.push(state);
  };
  const pushText = (key, value) => {
    if (value === null || value === undefined) return;
    states.push({ device_feature_external_id: ids.feature(key), text: String(value) });
  };
  const pushBinary = (key, value) => {
    if (value === null || value === undefined) return;
    pushNumber(key, value ? 1 : 0);
  };
  return { states, pushNumber, pushText, pushBinary };
}

/**
 * The time-dependent peak features of a contract, from the `cpc`/`dpc` part
 * of a `poll` or `peaks` bridge answer. Only the fields present are pushed: a
 * `peaks` answer carries the peak state alone, not the credit/savings figures.
 */
export function peakFeatureStates(ids, { cpc, dpc } = {}) {
  const { states, pushNumber, pushText, pushBinary } = statesBuilder(ids);
  if (cpc) {
    pushNumber(FEATURE.CPC_CUMULATED_CREDIT, cpc.cumulated_credit);
    pushNumber(FEATURE.CPC_PROJECTED_CREDIT, cpc.projected_cumulated_credit);
    pushText(FEATURE.CPC_STATE, cpc.current_state);
    pushBinary(FEATURE.CPC_CRITICAL_PEAK_COMING, cpc.critical_peak_coming);
    pushBinary(FEATURE.CPC_PREHEAT_IN_PROGRESS, cpc.preheat_in_progress);
  }
  if (dpc) {
    pushText(FEATURE.DPC_STATE, dpc.current_state);
    pushBinary(FEATURE.DPC_PEAK_IN_PROGRESS, dpc.peak_in_progress);
    pushBinary(FEATURE.DPC_PREHEAT_IN_PROGRESS, dpc.preheat_in_progress);
    pushNumber(FEATURE.DPC_HOURS_CRITICAL_CALLED, dpc.critical_called_hours);
    pushNumber(FEATURE.DPC_SAVINGS_VS_BASE, dpc.amount_saved_vs_base_rate);
  }
  return states;
}

/**
 * Every feature state of one `poll` snapshot (the flat JSON of the `poll`
 * command of bridge/hq_bridge.py: already-derived hydroqc values, no
 * Hydro-Québec-specific parsing left to do here).
 *
 * The daily consumption and average temperature describe a PAST day
 * (Hydro-Québec publishes 1 to 2 days late): they carry that day as
 * `created_at` (`daily_consumption_at`, local midnight), so Gladys files them
 * under the day they measure instead of the day they were read.
 */
export function contractStates(ids, snapshot) {
  const { states, pushNumber, pushBinary } = statesBuilder(ids);
  const dayAt = snapshot.daily_consumption_at ?? undefined;
  pushNumber(FEATURE.DAILY_CONSUMPTION, snapshot.daily_consumption_kwh, dayAt);
  pushNumber(FEATURE.AVG_TEMPERATURE, snapshot.avg_temperature, dayAt);
  pushNumber(FEATURE.DAILY_CONSUMPTION_COST, snapshot.daily_cost_mean);
  pushNumber(FEATURE.BALANCE, snapshot.balance);
  pushBinary(FEATURE.POWER_OUTAGE, snapshot.outage_active);
  return [...states, ...peakFeatureStates(ids, snapshot)];
}

/**
 * Publish the given states for a contract, keeping only those that changed
 * (see statePublisher.js), in batches the host API accepts.
 */
export async function publishContractStates(gladys, publisher, states) {
  const changed = publisher ? publisher.changed(states) : states;
  for (let i = 0; i < changed.length; i += MAX_STATES_PER_REQUEST) {
    const batch = changed.slice(i, i + MAX_STATES_PER_REQUEST);
    await gladys.publishStates(batch);
    // Only once accepted: a failed publish is retried at the next refresh.
    publisher?.commit(batch);
  }
  return changed.length;
}

/**
 * Fetch fresh data for one contract, publish what changed, and return the
 * snapshot (its `cpc`/`dpc` peak schedule drives the peak timers in index.js).
 */
export async function pollContractDevice(gladys, session, contract, config, publisher) {
  const ids = gladys.externalIds('contract', contract.contractId);
  const snapshot = await session.fetchContractSnapshot(contract, config?.preheat_duration_minutes);
  const states = contractStates(ids, snapshot);
  if (states.length === 0) {
    logger.warn(`No data could be fetched for contract ${contract.contractId}, skipping publish`);
    return snapshot;
  }
  await publishContractStates(gladys, publisher, states);
  return snapshot;
}
