// -----------------------------------------------------------------------------
// Dated consumption: Hydro-Québec's hourly readings, published to Gladys as
// the 30-minute intervals its energy contracts price (Tarif D, Flex D...).
//
// Hydro-Québec serves a day's readings the next day or so, so they cannot go
// through Gladys's live index pipeline: they are published with
// publishEnergyConsumption, each interval dated. Gladys upserts them by
// instant (a re-read day writes nothing new) and recomputes the costs from the
// earliest interval that changed.
//
// Per contract, a cursor keeps the first Eastern day not settled yet:
//   - the first run reads from the 1st of the current month, so that the
//     contract's monthly tiers (40 kWh × days) count the whole month;
//   - a complete day is read again until it is 2 days old (late corrections);
//   - a day still incomplete after 7 days is given up (missing readings that
//     Hydro-Québec will not fill in any more);
//   - at most 10 days are read per run (one portal request each), so a
//     backfill is spread over several polls.
// -----------------------------------------------------------------------------

import { FEATURE } from '../devices/contract.js';

const MAX_INTERVALS_PER_CALL = 2000;
const MAX_DAYS_PER_RUN = 10;
const SETTLE_AFTER_DAYS = 2;
const GIVE_UP_AFTER_DAYS = 7;
const INTERVAL_MS = 30 * 60 * 1000;

const easternCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The Eastern calendar day (`YYYY-MM-DD`) of an instant. */
export function easternDay(date) {
  return easternCalendar.format(date);
}

/** `day` plus `count` days (`YYYY-MM-DD`, calendar arithmetic). */
export function addDays(day, count) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/** Every day from `from` to `to`, both included. */
export function dayRange(from, to) {
  const days = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

/** The first day of the next run: the first read day that is not settled yet. */
export function nextCursor(days, dates, today) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const date of dates) {
    const day = byDate.get(date);
    const settled =
      (day?.complete && date <= addDays(today, -SETTLE_AFTER_DAYS)) || date <= addDays(today, -GIVE_UP_AFTER_DAYS);
    if (!settled) return date;
  }
  return addDays(dates[dates.length - 1], 1);
}

export class ConsumptionPublisher {
  /**
   * @param {object} options
   * @param {object} options.gladys the GladysIntegration
   * @param {object} options.logger
   * @param {() => Date} [options.now]
   */
  constructor({ gladys, logger, now = () => new Date(), maxDaysPerRun = MAX_DAYS_PER_RUN }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.maxDaysPerRun = maxDaysPerRun;
    this.cursors = new Map(); // contractId -> first Eastern day not settled yet
  }

  /** The days one run reads for a contract. */
  daysToRead(contractId, today) {
    const from = this.cursors.get(contractId) ?? `${today.slice(0, 8)}01`;
    return dayRange(from, today).slice(0, this.maxDaysPerRun);
  }

  /**
   * Read the next days of one contract and publish their intervals. Returns
   * the number of intervals sent (0 when the user has not added the device
   * yet: the same days are read again next time).
   */
  async publish(session, contract) {
    const now = this.now();
    const today = easternDay(now);
    const dates = this.daysToRead(contract.contractId, today);
    if (dates.length === 0) return 0;

    const { days = [] } = await session.fetchHourlyConsumption(contract, dates);
    // Gladys refuses a whole call holding an interval that is not over yet.
    const intervals = days
      .flatMap((day) => day.intervals ?? [])
      .filter((interval) => Date.parse(interval.starts_at) + INTERVAL_MS <= now.getTime());

    const featureExternalId = this.gladys
      .externalIds('contract', contract.contractId)
      .feature(FEATURE.THIRTY_MINUTES_CONSUMPTION);
    try {
      for (let i = 0; i < intervals.length; i += MAX_INTERVALS_PER_CALL) {
        await this.gladys.publishEnergyConsumption(featureExternalId, intervals.slice(i, i + MAX_INTERVALS_PER_CALL));
      }
    } catch (err) {
      if (err.status === 404) {
        this.logger.info(`Contract ${contract.contractId}: device not added in Gladys yet, consumption kept for later`);
        return 0;
      }
      throw err;
    }

    this.cursors.set(contract.contractId, nextCursor(days, dates, today));
    return intervals.length;
  }

  /** Read everything again from the start of the month (new session). */
  reset() {
    this.cursors.clear();
  }
}
