// -----------------------------------------------------------------------------
// The integration itself: the homes of the account, the price sensors moved
// at every slot, tomorrow's publication, the hourly consumption fed to the
// energy monitoring, the live measurements of a Pulse, the scene triggers
// and actions, the widgets and the delegated contract. index.js only wires
// the SDK handlers to it.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import {
  CONSUMPTION_HOURS,
  CONSUMPTION_INTERVAL,
  LIVE_THROTTLE,
  PRICES_INTERVAL,
  TOMORROW_FROM,
  TOMORROW_RETRY,
  WIDGETS,
} from './constants.js';
import {
  FEATURE,
  buildHomeDevice,
  dailyStates,
  ids,
  liveStates,
  parseExternalId,
  priceStates,
} from './devices.js';
import { hoursToFetch, intervalCosts, rangeStart } from './energy.js';
import { T } from './i18n.js';
import { PERIODS, cheapestWindowOutputs, priceOutputs } from './scenes.js';
import { TibberClient } from './tibber/api.js';
import { LiveSubscription } from './tibber/live.js';
import {
  dailyTotals,
  halfHours,
  liveOf,
  localClock,
  localDate,
  priceState,
  slotsOf,
} from './tibber/model.js';
import { powerEvents, priceEvents, tomorrowEvent } from './triggers.js';
import { TibberError } from './http.js';
import { liveWidget, pricesWidget } from './widget.js';

const defaultTimers = { setTimeout, clearTimeout, setInterval, clearInterval };

export class TibberApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'tibber' }),
    now = Date.now,
    timers = defaultTimers,
    clientFactory = (token) => new TibberClient({ token }),
    liveFactory = (options) => new LiveSubscription(options),
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.clientFactory = clientFactory;
    this.liveFactory = liveFactory;
    this.config = normalizeConfig();
    this.client = undefined;
    /** homeId -> entry { home, slots, price, announced: Set, totals, live, lastLive, lastLiveAt, lastPower, liveConnected } */
    this.homes = new Map();
    this.timerIds = [];
    this.tickTimer = undefined;
    this.tomorrowTimer = undefined;
    this.lastStatus = undefined;
    this.generation = 0;
    this.lifecycle = Promise.resolve();
  }

  // --- Lifecycle -------------------------------------------------------------

  start(raw = {}) {
    return this.serialize(() => this.doStart(raw));
  }

  stop() {
    return this.serialize(() => this.doStop());
  }

  serialize(job) {
    const run = this.lifecycle.then(job, job);
    this.lifecycle = run.catch(() => {});
    return run;
  }

  async doStart(raw) {
    await this.doStop();
    const generation = ++this.generation;
    this.config = normalizeConfig(raw);
    this.client = this.clientFactory(this.config.accessToken);
    if (!this.config.accessToken) {
      await this.setStatus(false, T.noToken);
      return;
    }
    try {
      await this.discover();
      await this.refreshPrices();
      await this.refreshConsumption();
    } catch (err) {
      await this.reportError(err);
      if (err instanceof TibberError && (err.code === 'bad_token' || err.code === 'no_token')) {
        return;
      }
    }
    if (generation !== this.generation) {
      return;
    }
    this.timerIds.push(
      this.timers.setInterval(
        () => this.refreshPrices().catch((err) => this.reportError(err)),
        PRICES_INTERVAL,
      ),
    );
    this.timerIds.push(
      this.timers.setInterval(
        () => this.refreshConsumption().catch((err) => this.reportError(err)),
        CONSUMPTION_INTERVAL,
      ),
    );
    this.scheduleTick();
    this.startLive();
  }

  async doStop() {
    this.generation += 1;
    for (const id of this.timerIds) {
      this.timers.clearInterval(id);
    }
    this.timerIds = [];
    this.timers.clearTimeout(this.tickTimer);
    this.timers.clearTimeout(this.tomorrowTimer);
    this.tickTimer = undefined;
    this.tomorrowTimer = undefined;
    for (const entry of this.homes.values()) {
      entry.live?.stop();
      entry.live = undefined;
    }
  }

  async setStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => this.logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  async reportError(err) {
    this.logger.warn(`Tibber: ${err.message}`);
    if (err instanceof TibberError && err.code === 'bad_token') {
      await this.setStatus(false, T.badToken);
      return;
    }
    if (err instanceof TibberError && err.code === 'no_token') {
      await this.setStatus(false, T.noToken);
      return;
    }
    await this.setStatus(this.homes.size > 0, T.unreachable(err.message));
  }

  async reportOk() {
    const live = [...this.homes.values()].filter((e) => e.liveConnected).map((e) => e.home.name);
    await this.setStatus(true, T.ok(this.homes.size, live.join(', ')));
  }

  // --- Discovery -------------------------------------------------------------------

  async discover() {
    const viewer = await this.client.viewer();
    const homes = new Map();
    for (const raw of viewer.homes ?? []) {
      if (raw.currentSubscription?.status && raw.currentSubscription.status !== 'running') {
        this.logger.info(`Home ${raw.id} skipped: subscription ${raw.currentSubscription.status}`);
      }
      const home = {
        id: String(raw.id),
        name: raw.appNickname || raw.address?.address1 || `Home ${raw.id}`,
        timeZone: raw.timeZone || 'Europe/Oslo',
        currency: raw.currentSubscription?.priceInfo?.current?.currency ?? null,
        live: this.config.live && raw.features?.realTimeConsumptionEnabled === true,
      };
      const known = this.homes.get(home.id);
      homes.set(home.id, {
        home,
        slots: known?.slots ?? [],
        price: known?.price,
        announced: known?.announced ?? new Set(),
        totals: known?.totals,
        lastLive: known?.lastLive,
        lastLiveAt: 0,
        lastPower: known?.lastPower ?? null,
        liveConnected: false,
      });
    }
    this.homes = homes;
    if (this.homes.size === 0) {
      await this.setStatus(false, T.noHome);
    }
    await this.gladys.publishDiscoveredDevices(
      [...this.homes.values()].map((e) => buildHomeDevice(this.gladys, e.home)),
    );
  }

  deviceId(homeId) {
    return ids.home(this.gladys, homeId);
  }

  // --- Prices ----------------------------------------------------------------------

  /** True from 12:45 local time: tomorrow's prices may be out. */
  tomorrowDue(timeZone, t = this.now()) {
    const { hour, minute } = localClock(t, timeZone);
    return (
      hour > TOMORROW_FROM.hour || (hour === TOMORROW_FROM.hour && minute >= TOMORROW_FROM.minute)
    );
  }

  async refreshPrices() {
    let failure;
    let tomorrowMissing = false;
    for (const entry of this.homes.values()) {
      try {
        const info = await this.client.prices(entry.home.id);
        entry.slots = slotsOf([
          ...(info.today ?? []),
          ...(info.tomorrow ?? []),
          ...(info.current ? [info.current] : []),
        ]);
        if (entry.slots.length > 0 && !entry.home.currency) {
          entry.home.currency = entry.slots[0].currency;
        }
        const now = this.now();
        const tomorrowDate = localDate(now + 24 * 60 * 60_000, entry.home.timeZone);
        const tomorrow = priceState(entry.slots, now, {
          timeZone: entry.home.timeZone,
          cheapHours: this.config.cheapHours,
        })?.tomorrow;
        if (tomorrow) {
          if (!entry.announced.has(tomorrowDate)) {
            entry.announced.add(tomorrowDate);
            if (entry.price) {
              await this.publishEvent(
                tomorrowEvent(this.deviceId(entry.home.id), tomorrow, this.config.cheapHours),
              );
            }
          }
        } else if (this.tomorrowDue(entry.home.timeZone)) {
          tomorrowMissing = true;
        }
      } catch (err) {
        if (err instanceof TibberError && err.code === 'bad_token') {
          throw err;
        }
        failure = err;
      }
    }
    await this.tick();
    if (failure) {
      throw failure;
    }
    await this.reportOk();
    if (tomorrowMissing && !this.tomorrowTimer) {
      this.tomorrowTimer = this.timers.setTimeout(() => {
        this.tomorrowTimer = undefined;
        return this.refreshPrices().catch((err) => this.reportError(err));
      }, TOMORROW_RETRY);
    }
  }

  /** Move the sensors to the current slot, fire the transitions. */
  async tick() {
    const now = this.now();
    for (const entry of this.homes.values()) {
      const price = priceState(entry.slots, now, {
        timeZone: entry.home.timeZone,
        cheapHours: this.config.cheapHours,
      });
      if (!price) {
        continue;
      }
      price.allSlots = entry.slots;
      const device = this.deviceId(entry.home.id);
      const previous = entry.price;
      entry.price = price;
      await this.gladys
        .publishChangedStates(priceStates(device, price), { heartbeat: 60 * 60_000 })
        .catch((err) => this.logger.warn(`States of ${entry.home.name} failed: ${err.message}`));
      for (const event of priceEvents(device, previous, price)) {
        await this.publishEvent(event);
      }
    }
    this.gladys.requestWidgetRefresh(WIDGETS.PRICES);
  }

  scheduleTick() {
    this.timers.clearTimeout(this.tickTimer);
    const now = this.now();
    let next = Infinity;
    for (const entry of this.homes.values()) {
      const end = entry.price?.slot?.endsAt;
      if (end) {
        next = Math.min(next, Date.parse(end));
      }
    }
    const delay = Number.isFinite(next) ? Math.max(1000, next - now + 500) : 15 * 60_000;
    this.tickTimer = this.timers.setTimeout(async () => {
      try {
        await this.tick();
      } catch (err) {
        this.logger.warn(`Tick failed: ${err.message}`);
      }
      this.scheduleTick();
    }, delay);
  }

  async publishEvent(event) {
    await this.gladys
      .publishSceneEvent(event.key, event.data)
      .catch((err) => this.logger.warn(`Scene event ${event.key} failed: ${err.message}`));
  }

  // --- Consumption --------------------------------------------------------------

  async refreshConsumption() {
    for (const entry of this.homes.values()) {
      let nodes;
      try {
        nodes = await this.client.consumption(entry.home.id, CONSUMPTION_HOURS);
      } catch (err) {
        if (err instanceof TibberError && err.code === 'bad_token') {
          throw err;
        }
        this.logger.warn(`Consumption of ${entry.home.name} unavailable: ${err.message}`);
        continue;
      }
      const device = this.deviceId(entry.home.id);
      entry.totals = dailyTotals(nodes, entry.home.timeZone, this.now());
      await this.gladys
        .publishChangedStates(dailyStates(device, entry.totals), { heartbeat: 6 * 60 * 60_000 })
        .catch((err) =>
          this.logger.warn(`Daily states of ${entry.home.name} failed: ${err.message}`),
        );
      const intervals = halfHours(nodes);
      if (intervals.length === 0) {
        continue;
      }
      try {
        await this.gladys.publishEnergyConsumption(
          ids.feature(device, FEATURE.CONSUMPTION),
          intervals,
        );
      } catch (err) {
        // 404: the device is not created yet; 400: an interval too recent.
        this.logger.debug?.(
          `Energy consumption of ${entry.home.name} not published: ${err.message}`,
        );
      }
    }
  }

  // --- Live (Pulse / Watty) ---------------------------------------------------------

  startLive() {
    for (const entry of this.homes.values()) {
      if (!entry.home.live) {
        continue;
      }
      entry.live = this.liveFactory({
        homeId: entry.home.id,
        token: this.config.accessToken,
        logger: this.logger,
        timers: this.timers,
        onMeasurement: (m) => this.onMeasurement(entry, m),
        onStatus: (connected) => {
          entry.liveConnected = connected;
          this.reportOk().catch(() => {});
        },
      });
      entry.live.start();
    }
  }

  /** A measurement arrived (every 2 s on a Pulse): throttled publication. */
  async onMeasurement(entry, measurement) {
    const live = liveOf(measurement);
    entry.lastLive = live;
    const now = this.now();
    if (now - entry.lastLiveAt < LIVE_THROTTLE) {
      return;
    }
    entry.lastLiveAt = now;
    const device = this.deviceId(entry.home.id);
    await this.gladys
      .publishChangedStates(liveStates(device, live), { heartbeat: 5 * 60_000 })
      .catch((err) => this.logger.warn(`Live states of ${entry.home.name} failed: ${err.message}`));
    for (const event of powerEvents(device, entry.lastPower, live.power)) {
      await this.publishEvent(event);
    }
    entry.lastPower = live.power;
    this.gladys.requestWidgetRefresh(WIDGETS.LIVE);
  }

  // --- Scene actions ------------------------------------------------------------------

  entryOf(externalId) {
    const parsed = parseExternalId(externalId);
    const entry = parsed && this.homes.get(parsed.homeId);
    if (!entry) {
      throw new Error(`Unknown Tibber home device ${externalId}`);
    }
    return entry;
  }

  async getPrice(fields = {}) {
    const entry = this.entryOf(fields.device);
    return priceOutputs(entry.price, {
      timeZone: entry.home.timeZone,
      cheapHours: this.config.cheapHours,
    });
  }

  async getCheapestWindow(fields = {}) {
    const entry = this.entryOf(fields.device);
    const period = PERIODS.includes(fields.period) ? fields.period : PERIODS[0];
    const hours = Math.min(12, Math.max(1, Number(fields.hours) || this.config.cheapHours));
    return cheapestWindowOutputs(entry.slots, {
      period,
      hours,
      now: this.now(),
      timeZone: entry.home.timeZone,
    });
  }

  // --- Widgets --------------------------------------------------------------------------

  async getWidget(key, { settings = {}, language } = {}) {
    let entry;
    try {
      entry = this.entryOf(settings.device);
    } catch {
      return {
        ttl_seconds: 300,
        components: [{ type: 'text', text: T.widget.noHome, variant: 'body' }],
      };
    }
    if (key === WIDGETS.LIVE) {
      return liveWidget({
        gladys: this.gladys,
        home: entry.home,
        live: entry.lastLive,
        liveEnabled: entry.home.live,
        language,
      });
    }
    return pricesWidget({
      home: entry.home,
      slots: entry.slots,
      price: entry.price,
      cheapHours: this.config.cheapHours,
      now: this.now(),
      language,
    });
  }

  // --- Energy contract (delegated pricing) -----------------------------------------------

  /** The home a contract refers to: its `home_id` input, else the first home. */
  contractHome(contract) {
    const wanted = String(contract?.inputs?.home_id ?? '').trim();
    const entry = wanted ? this.homes.get(wanted) : [...this.homes.values()][0];
    if (!entry) {
      throw new Error(wanted ? `Unknown Tibber home ${wanted}` : 'No Tibber home');
    }
    return entry;
  }

  async energyPrice({ contract, intervals = [] }) {
    if (intervals.length === 0) {
      return [];
    }
    const entry = this.contractHome(contract);
    const prices = await this.client.priceRange(
      entry.home.id,
      rangeStart(intervals),
      hoursToFetch(intervals),
    );
    const fallback = Number(contract?.inputs?.fallback_price);
    return intervalCosts(intervals, prices, {
      fallbackPrice: Number.isFinite(fallback) ? fallback : null,
    });
  }

  async energyCurrent({ contract }) {
    const entry = this.contractHome(contract);
    const price = entry.price;
    if (!price) {
      return { price: null };
    }
    return {
      price: price.slot.price,
      valid_until: price.slot.endsAt,
      next_price: price.next?.price ?? null,
      label: 'Tibber',
    };
  }

  // --- Configuration screen button --------------------------------------------------------

  async testConnection() {
    try {
      const viewer = await this.client.viewer();
      const homes = (viewer.homes ?? []).map((h) => {
        const price = h.currentSubscription?.priceInfo?.current;
        const name = h.appNickname || h.address?.address1 || h.id;
        return price
          ? `${name}: ${price.total} ${price.currency}/kWh (${price.level})`
          : `${name}: no price`;
      });
      return {
        en: `Signed in as ${viewer.name ?? viewer.login}. ${homes.length > 0 ? homes.join('; ') : 'No home.'}`,
        fr: `Connecté en tant que ${viewer.name ?? viewer.login}. ${homes.length > 0 ? homes.join(' ; ') : 'Aucune maison.'}`,
      };
    } catch (err) {
      if (err instanceof TibberError && err.code === 'bad_token') {
        return T.badToken;
      }
      if (err instanceof TibberError && err.code === 'no_token') {
        return T.noToken;
      }
      return T.unreachable(err.message);
    }
  }
}
