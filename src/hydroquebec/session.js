// -----------------------------------------------------------------------------
// Ties the HTTP client, contract discovery and peak logic together into the
// single object the Gladys device blueprints talk to.
//
// A single `HydroClient` (one login, one cookie jar, one access/refresh
// token) is shared by every contract-device Gladys polls. Because selecting a
// contract on the portal (`_selectContract`) mutates that shared client state
// (cookies, "currently selected contract"), all network operations going
// through this session are serialized with a tiny mutex: Gladys can call
// `onPoll` for several devices back-to-back, and without serialization two
// concurrent polls could stomp on each other's portal session.
// -----------------------------------------------------------------------------

import { HydroClient } from './client.js';
import { discoverContracts, isCpcContract, isDpcContract } from './discovery.js';
import { summarizeCpc, summarizeDpc } from './peaks.js';

const DISCOVERY_TTL_MS = 6 * 60 * 60 * 1000; // contracts rarely change; re-discover every 6h.

class Mutex {
  constructor() {
    this._tail = Promise.resolve();
  }

  run(fn) {
    const result = this._tail.then(fn, fn);
    this._tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
}

export class HydroQcSession {
  constructor(username, password, logger) {
    this.client = new HydroClient(username, password, { logger });
    this.logger = logger;
    this.contracts = [];
    this._contractsFetchedAt = 0;
    this._mutex = new Mutex();
  }

  /** Test the credentials without needing a full discovery pass. */
  async testConnection() {
    return this._mutex.run(async () => {
      await this.client.login();
      return true;
    });
  }

  async ensureContracts(force = false) {
    return this._mutex.run(async () => {
      const stale = Date.now() - this._contractsFetchedAt > DISCOVERY_TTL_MS;
      if (!force && !stale && this.contracts.length > 0) return this.contracts;
      this.contracts = await discoverContracts(this.client, this.logger);
      this._contractsFetchedAt = Date.now();
      return this.contracts;
    });
  }

  getContract(contractId) {
    return this.contracts.find((c) => c.contractId === contractId) ?? null;
  }

  /** Fetch every value one contract-device needs for one poll cycle. */
  async fetchContractSnapshot(contract) {
    return this._mutex.run(async () => {
      const { applicantId, customerId, contractId } = contract;

      const periods = await this.client
        .getPeriodsInfo(applicantId, customerId, contractId)
        .catch((err) => this._warn('getPeriodsInfo', contractId, err));
      const daily = await this.client
        .getDailyConsumption(applicantId, customerId, contractId)
        .catch((err) => this._warn('getDailyConsumption', contractId, err));

      const outage = contract.consumptionLocationId
        ? await this.client
            .getOutages(contract.consumptionLocationId)
            .catch((err) => this._warn('getOutages', contractId, err))
        : null;

      let cpc = null;
      if (isCpcContract(contract)) {
        const rawCpc = await this.client
          .getCpcCredit(applicantId, customerId, contractId)
          .catch((err) => this._warn('getCpcCredit', contractId, err));
        const openData = await this.client
          .getOpenDataPeaks('CPC-D')
          .catch((err) => this._warn('getOpenDataPeaks(CPC-D)', contractId, err));
        if (rawCpc) cpc = summarizeCpc(rawCpc, openData ?? []);
      }

      let dpc = null;
      if (isDpcContract(contract)) {
        const rawDpc = await this.client
          .getDpcData(applicantId, customerId, contractId)
          .catch((err) => this._warn('getDpcData', contractId, err));
        const dpcPeriod = await this.client
          .getDpcPeakData(applicantId, customerId, contractId)
          .catch((err) => this._warn('getDpcPeakData', contractId, err));
        const openData = await this.client
          .getOpenDataPeaks('TPC-DPC')
          .catch((err) => this._warn('getOpenDataPeaks(TPC-DPC)', contractId, err));
        dpc = { raw: rawDpc, period: dpcPeriod, ...summarizeDpc(openData ?? []) };
      }

      return { periods, daily, outage, cpc, dpc };
    });
  }

  _warn(operation, contractId, err) {
    this.logger.warn(`${operation} failed for contract ${contractId}: ${err.message}`);
    return null;
  }
}
