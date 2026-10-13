// -----------------------------------------------------------------------------
// The integration itself: the station directory, discovery (typed stations
// and stations near the houses), the refresh loop over the devices the user
// created, the scene triggers, the scene actions and the widgets. index.js
// only wires the SDK handlers to it.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { DISTURBANCES_INTERVAL, REQUEST_SPACING, STATIONS_TTL, WIDGETS } from './constants.js';
import {
  DEVICE_TYPES,
  buildNetworkDevice,
  buildStationDevice,
  ids,
  networkStates,
  parseExternalId,
  stationStates,
  watchOfDevice,
} from './devices.js';
import { T } from './i18n.js';
import { IrailClient } from './irail.js';
import { departureLine, disturbancesReading, stationReading } from './model.js';
import { findStation, nearestStations, stationOf } from './stations.js';
import { networkEvents, stationEvents } from './triggers.js';
import { departuresWidget, disturbancesWidget } from './widget.js';

const defaultTimers = { setTimeout, clearTimeout, setInterval, clearInterval };

export class SncbApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'sncb' }),
    now = Date.now,
    timers = defaultTimers,
    sleep,
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.sleep = sleep ?? ((ms) => new Promise((resolve) => this.timers.setTimeout(resolve, ms)));
    this.config = normalizeConfig();
    this.client = new IrailClient();
    this.stations = [];
    this.stationsAt = 0;
    /** station id -> last reading */
    this.readings = new Map();
    this.network = undefined;
    this.networkAt = 0;
    this.refreshTimer = undefined;
    this.lastStatus = undefined;
    this.refreshing = undefined;
    this.generation = 0;
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(raw = {}) {
    this.stop();
    const generation = ++this.generation;
    this.config = normalizeConfig(raw);
    this.client = new IrailClient({ language: this.config.language });
    this.readings.clear();
    this.network = undefined;
    this.networkAt = 0;
    try {
      await this.publishDevices();
      await this.refresh();
    } catch (err) {
      await this.setStatus(false, T.unreachable(err.message));
    }
    if (generation !== this.generation) {
      return;
    }
    this.refreshTimer = this.timers.setInterval(
      () => this.refresh().catch((err) => this.setStatus(false, T.unreachable(err.message))),
      this.config.pollFrequency * 1000,
    );
  }

  stop() {
    this.generation += 1;
    this.timers.clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
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

  // --- Station directory ---------------------------------------------------------

  async directory() {
    if (this.stations.length === 0 || this.now() - this.stationsAt > STATIONS_TTL) {
      this.stations = (await this.client.stations()).map(stationOf);
      this.stationsAt = this.now();
    }
    return this.stations;
  }

  // --- Discovery -----------------------------------------------------------------

  /** The devices to offer: the typed stations, the nearest ones, the network. */
  async discoveredDevices() {
    const stations = await this.directory();
    const watches = new Map();
    for (const entry of this.config.stations) {
      const station = findStation(stations, entry.query);
      if (!station) {
        this.logger.warn(`Unknown station "${entry.query}"`);
        continue;
      }
      watches.set(`${station.id}|${entry.filters.join('|')}`, {
        station,
        filters: entry.filters,
        name: entry.name,
      });
    }
    if (this.config.nearbyStations > 0) {
      let houses = [];
      try {
        houses = await this.gladys.getHouses();
      } catch (err) {
        this.logger.warn(`Houses unavailable (location not granted?): ${err.message}`);
      }
      for (const house of houses) {
        for (const station of nearestStations(stations, house, this.config.nearbyStations)) {
          const key = `${station.id}|`;
          if (!watches.has(key)) {
            watches.set(key, { station, filters: [], distanceKm: station.distanceKm });
          }
        }
      }
    }
    const devices = [...watches.values()].map((w) =>
      buildStationDevice(this.gladys, w, this.config.maxDepartures),
    );
    if (this.config.watchDisturbances) {
      devices.push(buildNetworkDevice(this.gladys));
    }
    return devices;
  }

  async publishDevices() {
    await this.gladys.publishDiscoveredDevices(await this.discoveredDevices());
  }

  /** The station devices the user created (one liveboard call each). */
  watchedDevices() {
    const stations = [];
    let network;
    for (const device of this.gladys.devices ?? []) {
      const parsed = parseExternalId(device.external_id);
      if (parsed?.kind === DEVICE_TYPES.STATION) {
        stations.push(device);
      } else if (parsed?.kind === DEVICE_TYPES.NETWORK) {
        network = device;
      }
    }
    return { stations, network };
  }

  // --- Reading -------------------------------------------------------------------

  refresh() {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = undefined;
      });
    }
    return this.refreshing;
  }

  async doRefresh() {
    const generation = this.generation;
    const { stations, network } = this.watchedDevices();
    let failure;
    let first = true;
    for (const device of stations) {
      if (!first) {
        await this.sleep(REQUEST_SPACING);
      }
      first = false;
      if (generation !== this.generation) {
        return;
      }
      try {
        await this.refreshStation(device);
      } catch (err) {
        failure = err;
        this.logger.warn(`Reading ${device.name} failed: ${err.message}`);
      }
    }
    if (network && this.now() - this.networkAt >= DISTURBANCES_INTERVAL) {
      try {
        await this.refreshNetwork(network);
      } catch (err) {
        failure = err;
        this.logger.warn(`Reading the disturbances failed: ${err.message}`);
      }
    }
    if (failure) {
      await this.setStatus(this.readings.size > 0, T.unreachable(failure.message));
    } else if (stations.length === 0 && !network) {
      await this.setStatus(true, T.noStation);
    } else {
      await this.setStatus(true, T.ok(stations.length));
    }
  }

  async refreshStation(device) {
    const watch = watchOfDevice(device);
    const liveboard = await this.client.liveboard(watch.stationId);
    const reading = stationReading(liveboard, {
      now: this.now(),
      filters: watch.filters,
      max: watch.maxDepartures,
    });
    const previous = this.readings.get(device.external_id);
    this.readings.set(device.external_id, reading);
    await this.gladys.publishChangedStates(
      stationStates(device.external_id, reading, watch.maxDepartures, this.config.language),
      { heartbeat: 10 * 60_000 },
    );
    for (const event of stationEvents(device.external_id, previous, reading)) {
      await this.gladys
        .publishSceneEvent(event.key, event.data)
        .catch((err) => this.logger.warn(`Scene event ${event.key} failed: ${err.message}`));
    }
    this.gladys.requestWidgetRefresh(WIDGETS.DEPARTURES);
  }

  async refreshNetwork(device) {
    const reading = disturbancesReading(await this.client.disturbances(), this.now());
    const previous = this.network;
    this.network = reading;
    this.networkAt = this.now();
    await this.gladys.publishChangedStates(networkStates(device.external_id, reading), {
      heartbeat: 60 * 60_000,
    });
    for (const event of networkEvents(previous, reading)) {
      await this.gladys
        .publishSceneEvent(event.key, event.data)
        .catch((err) => this.logger.warn(`Scene event ${event.key} failed: ${err.message}`));
    }
    this.gladys.requestWidgetRefresh(WIDGETS.DISTURBANCES);
  }

  /** A device was just created: read it now rather than at the next tick. */
  async deviceCreated(device) {
    const parsed = parseExternalId(device.external_id);
    try {
      if (parsed?.kind === DEVICE_TYPES.STATION) {
        await this.refreshStation(device);
      } else if (parsed?.kind === DEVICE_TYPES.NETWORK) {
        this.networkAt = 0;
        await this.refreshNetwork(device);
      }
    } catch (err) {
      this.logger.warn(`Reading ${device.name} after creation failed: ${err.message}`);
    }
  }

  // --- Scene actions ---------------------------------------------------------------

  stationDevice(externalId) {
    const device = (this.gladys.devices ?? []).find((d) => d.external_id === externalId);
    if (!device || parseExternalId(externalId)?.kind !== DEVICE_TYPES.STATION) {
      throw new Error(`Unknown SNCB station device ${externalId}`);
    }
    return device;
  }

  async getNextDepartures(fields = {}) {
    const device = this.stationDevice(fields.device);
    let reading = this.readings.get(device.external_id);
    if (!reading) {
      await this.refreshStation(device);
      reading = this.readings.get(device.external_id);
    }
    const next = reading.departures.find((d) => !d.canceled);
    return {
      station: watchOfDevice(device).stationName,
      count: reading.departures.length,
      list: reading.departures.map((d) => departureLine(d, this.config.language)).join('\n'),
      next_train: next?.train ?? null,
      next_destination: next?.destination ?? null,
      next_minutes: next?.minutes ?? null,
      next_delay: next?.delayMinutes ?? null,
      next_platform: next?.platform ?? null,
      next_time: next ? next.scheduledAt : null,
      delayed_count: reading.delayed,
      canceled_count: reading.canceled,
    };
  }

  async getDisturbances() {
    if (!this.network || this.now() - this.networkAt >= DISTURBANCES_INTERVAL) {
      this.network = disturbancesReading(await this.client.disturbances(), this.now());
      this.networkAt = this.now();
    }
    const live = this.network.items.filter((d) => d.type === 'disturbance');
    return {
      count: live.length,
      planned_count: this.network.planned,
      titles: live.map((d) => d.title).join('\n'),
      latest: live[0]?.title ?? null,
    };
  }

  // --- Widgets ---------------------------------------------------------------------

  async getWidget(key, { settings = {}, language } = {}) {
    const lang = language ?? this.config.language;
    if (key === WIDGETS.DISTURBANCES) {
      return disturbancesWidget({ reading: this.network, language: lang });
    }
    const device = (this.gladys.devices ?? []).find((d) => d.external_id === settings.device);
    if (!device) {
      return {
        ttl_seconds: 300,
        components: [{ type: 'text', text: T.widget.noStation, variant: 'body' }],
      };
    }
    return departuresWidget({
      stationName: device.name,
      reading: this.readings.get(device.external_id),
      language: lang,
    });
  }

  // --- Configuration screen buttons --------------------------------------------------

  async testConnection() {
    try {
      const stations = await this.directory();
      const { stations: watched } = this.watchedDevices();
      const unknown = this.config.stations
        .filter((e) => !findStation(stations, e.query))
        .map((e) => e.query);
      const lines = {
        en: [`iRail answers: ${stations.length} stations known, ${watched.length} watched.`],
        fr: [`iRail répond : ${stations.length} gares connues, ${watched.length} suivie(s).`],
      };
      for (const query of unknown) {
        const message = T.unknownStation(query);
        lines.en.push(message.en);
        lines.fr.push(message.fr);
      }
      return { en: lines.en.join('\n'), fr: lines.fr.join('\n') };
    } catch (err) {
      return T.unreachable(err.message);
    }
  }

  async searchStations(fields = {}) {
    const query = String(fields.query ?? '').trim();
    const stations = await this.directory();
    const matches = stations
      .filter((s) => findStation([s], query))
      .slice(0, 10)
      .map((s) => `${s.name} (${s.id})`);
    if (matches.length === 0) {
      return T.unknownStation(query);
    }
    return { en: matches.join('\n'), fr: matches.join('\n') };
  }
}

export { ids };
