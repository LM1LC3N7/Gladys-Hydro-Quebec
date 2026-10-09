// -----------------------------------------------------------------------------
// Glue between a peak-state reading and Gladys: publish the peak features that
// changed, fire the scene events of the transitions (peakTracker.js), and
// re-arm the exact-time timers from the new schedule (peakScheduler.js).
//
// Fed by every regular poll (whose snapshot carries the peak state) and by the
// lightweight `peaks` re-readings the scheduler asks for at each transition
// and during the hours Hydro-Québec announces peaks.
// -----------------------------------------------------------------------------

import { peakFeatureStates, publishContractStates } from '../devices/contract.js';
import { isCpcContract, isDpcContract } from './discovery.js';
import { PeakScheduler } from './peakScheduler.js';
import { PeakTracker, RATE, normalizePeakState } from './peakTracker.js';

/** Does a contract have a dynamic-rate option (Winter Credit or Flex D) to follow? */
export function hasPeaks(contract) {
  return isCpcContract(contract) || isDpcContract(contract);
}

export class PeakMonitor {
  /**
   * @param {object} options
   * @param {object} options.gladys the GladysIntegration
   * @param {object} options.publisher a StatePublisher
   * @param {() => { session: object|null, config: object }} options.context the current session and config
   * @param {object} options.logger
   */
  constructor({ gladys, publisher, context, logger, scheduler }) {
    this.gladys = gladys;
    this.publisher = publisher;
    this.context = context;
    this.logger = logger;
    this.tracker = new PeakTracker();
    this.scheduler =
      scheduler ??
      new PeakScheduler({
        logger,
        onTransition: (contractId) => this.refreshContract(contractId),
        onAnnouncementCheck: () => this.checkAnnouncements(),
      });
  }

  /** Start the announcement checks when at least one contract has peaks to follow. */
  start(contracts) {
    if (contracts.some(hasPeaks)) this.scheduler.startAnnouncementChecks();
  }

  /** Stop every timer and forget what was observed (new session, shutdown). */
  stop() {
    this.scheduler.stop();
    this.tracker.reset();
  }

  /** Process the `{ cpc, dpc }` peak part of a poll or `peaks` answer for one contract. */
  async handle(contract, reading) {
    const deviceExternalId = this.gladys.externalIds('contract', contract.contractId).device;
    let peaks = [];
    for (const [rate, raw] of [
      [RATE.WINTER_CREDIT, reading?.cpc],
      [RATE.FLEX_D, reading?.dpc],
    ]) {
      if (!raw) continue;
      const state = normalizePeakState(rate, raw);
      peaks = peaks.concat(state.peaks);
      for (const { key, data } of this.tracker.observe(contract, deviceExternalId, state)) {
        try {
          await this.gladys.publishSceneEvent(key, data);
        } catch (err) {
          // A Gladys older than 5.1 has no scene declarations (404): never
          // let a scene event failure stop the state updates below.
          this.logger.warn(`Scene event ${key} not published for contract ${contract.contractId}: ${err.message}`);
        }
      }
    }
    this.scheduler.schedule(contract.contractId, peaks);
  }

  /** Re-read one contract's peak state now (no portal request) and publish what changed. */
  async refreshContract(contractId, { refreshOpenData = false } = {}) {
    const { session, config } = this.context();
    const contract = session?.getContract(contractId);
    if (!contract || !hasPeaks(contract)) return;
    const reading = await session.fetchPeakState(contract, config?.preheat_duration_minutes, { refreshOpenData });
    const ids = this.gladys.externalIds('contract', contract.contractId);
    await publishContractStates(this.gladys, this.publisher, peakFeatureStates(ids, reading));
    await this.handle(contract, reading);
  }

  /** Re-read the announced peaks of every contract that has some to follow. */
  async checkAnnouncements() {
    const { session } = this.context();
    for (const contract of (session?.contracts ?? []).filter(hasPeaks)) {
      try {
        await this.refreshContract(contract.contractId, { refreshOpenData: true });
      } catch (err) {
        this.logger.error(`Peak announcement check failed for contract ${contract.contractId}`, err);
      }
    }
  }
}
