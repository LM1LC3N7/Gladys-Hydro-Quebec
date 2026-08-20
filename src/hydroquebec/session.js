// -----------------------------------------------------------------------------
// Ties the Python bridge process to the shape the Gladys device blueprints
// expect (see src/devices/contract.js): a list of discovered contracts and a
// per-contract "poll" snapshot. All the actual Hydro-Québec logic lives in
// bridge/hq_bridge.py / the `hydroqc` library it wraps - this file only calls
// it and reshapes its snake_case JSON into the camelCase shape the rest of
// this integration uses.
// -----------------------------------------------------------------------------

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PythonBridge } from './pythonBridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE_SCRIPT_PATH = path.join(__dirname, '..', '..', 'bridge', 'hq_bridge.py');

// Contracts rarely change; re-running discovery (several HTTP calls per
// contract) on every poll would be wasteful.
const DISCOVERY_TTL_MS = 6 * 60 * 60 * 1000;

function toContractDescriptor(raw) {
  return {
    applicantId: raw.applicant_id,
    customerId: raw.customer_id,
    customerNames: raw.customer_names ?? [],
    accountId: raw.account_id,
    contractId: raw.contract_id,
    rate: raw.rate,
    rateOption: raw.rate_option || '',
    address: raw.address,
  };
}

export class HydroQcSession {
  constructor(username, password, logger, { scriptPath = BRIDGE_SCRIPT_PATH } = {}) {
    this.username = username;
    this.password = password;
    this.logger = logger;
    this.bridge = new PythonBridge({ logger, scriptPath });
    this.contracts = [];
    this._contractsFetchedAt = 0;
  }

  /** Test the credentials without needing a full discovery pass. */
  async testConnection() {
    await this.bridge.call('login', { username: this.username, password: this.password }, { timeoutMs: 60_000 });
    return true;
  }

  async ensureContracts(force = false) {
    const stale = Date.now() - this._contractsFetchedAt > DISCOVERY_TTL_MS;
    if (!force && !stale && this.contracts.length > 0) return this.contracts;
    const raw = await this.bridge.call(
      'discover',
      { username: this.username, password: this.password },
      { timeoutMs: 120_000 },
    );
    this.contracts = raw.map(toContractDescriptor);
    this._contractsFetchedAt = Date.now();
    return this.contracts;
  }

  getContract(contractId) {
    return this.contracts.find((c) => c.contractId === contractId) ?? null;
  }

  /** Fetch every value one contract-device needs for one poll cycle. */
  async fetchContractSnapshot(contract, preheatDurationMinutes) {
    const params = { contract_id: contract.contractId };
    if (preheatDurationMinutes !== undefined) params.preheat_duration_minutes = preheatDurationMinutes;
    return this.bridge.call('poll', params, { timeoutMs: 60_000 });
  }

  stop() {
    this.bridge.stop();
  }
}
