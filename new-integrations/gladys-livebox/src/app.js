// -----------------------------------------------------------------------------
// The integration itself: the Livebox session, discovery (the box and its
// LAN devices), the refresh loop, the commands (Wi-Fi switches), the scene
// triggers and actions, the widgets. index.js only wires the SDK handlers.
//
// Pace: every `poll_frequency` seconds the LAN devices, the WAN status, the
// Wi-Fi switches and the call log; the box information every 10 minutes,
// the xDSL line every 5. Everything stays on the LAN: no cloud.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { INFO_INTERVAL, LINE_INTERVAL, WIDGETS } from './constants.js';
import {
  FEATURE,
  boxStates,
  buildBoxDevice,
  buildHostDevice,
  hostStates,
  ids,
  parseExternalId,
} from './devices.js';
import { LiveboxError } from './http.js';
import { T } from './i18n.js';
import { LiveboxClient } from './livebox/client.js';
import { callsOf, hostsOf, infoOf, lineOf, wanOf } from './livebox/model.js';
import { callEvents, hostEvents, internetEvents } from './triggers.js';
import { devicesWidget, networkWidget } from './widget.js';

const defaultTimers = { setTimeout, clearTimeout, setInterval, clearInterval };

export class LiveboxApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'livebox' }),
    now = Date.now,
    timers = defaultTimers,
    clientFactory = (config) => new LiveboxClient(config),
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.clientFactory = clientFactory;
    this.config = normalizeConfig();
    this.client = undefined;
    /** The last reading: { wan, info, wifi, guest, hosts, calls, line, infoAt, lineAt } */
    this.reading = undefined;
    this.previousHosts = undefined;
    this.previousCalls = undefined;
    this.refreshTimer = undefined;
    this.refreshing = undefined;
    this.lastStatus = undefined;
    this.generation = 0;
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(raw = {}) {
    this.stop();
    const generation = ++this.generation;
    this.config = normalizeConfig(raw);
    this.client = this.clientFactory(this.config);
    this.reading = undefined;
    this.previousHosts = undefined;
    this.previousCalls = undefined;
    if (!this.config.password) {
      await this.setStatus(false, T.noPassword);
      return;
    }
    try {
      await this.refresh();
      await this.publishDevices();
    } catch (err) {
      await this.reportError(err);
      if (err instanceof LiveboxError && err.code === 'bad_credentials') {
        return;
      }
    }
    if (generation !== this.generation) {
      return;
    }
    this.refreshTimer = this.timers.setInterval(
      () => this.refresh().catch((err) => this.reportError(err)),
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

  async reportError(err) {
    this.logger.warn(`Livebox: ${err.message}`);
    if (err instanceof LiveboxError && err.code === 'bad_credentials') {
      this.timers.clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
      await this.setStatus(false, T.badCredentials);
      return;
    }
    if (err instanceof LiveboxError && err.code === 'no_password') {
      await this.setStatus(false, T.noPassword);
      return;
    }
    await this.setStatus(Boolean(this.reading), T.unreachable(this.config.host, err.message));
  }

  // --- Discovery -------------------------------------------------------------------

  /** The box and every LAN device the Livebox knows (wired ones only when asked). */
  async publishDevices() {
    if (!this.reading) {
      await this.refresh();
    }
    const { hosts = [], info, line } = this.reading;
    const devices = [buildBoxDevice(this.gladys, { info, line })];
    for (const host of hosts) {
      if (host.wireless || this.config.trackWired) {
        devices.push(buildHostDevice(this.gladys, host));
      }
    }
    await this.gladys.publishDiscoveredDevices(devices);
  }

  /** The host devices the user created, by MAC without colons. */
  trackedHosts() {
    const map = new Map();
    for (const device of this.gladys.devices ?? []) {
      const parsed = parseExternalId(device.external_id);
      if (parsed?.kind === 'host') {
        map.set(parsed.id, device);
      }
    }
    return map;
  }

  // --- Reading ---------------------------------------------------------------------

  refresh() {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = undefined;
      });
    }
    return this.refreshing;
  }

  async doRefresh() {
    const now = this.now();
    const previous = this.reading;
    const reading = { ...(previous ?? {}) };
    reading.hosts = hostsOf(await this.client.devices());
    reading.wan = wanOf(await this.client.wanStatus());
    reading.wifi = (await this.client.wifi()).Enable === true;
    reading.guest = (await this.client.guestWifi()).Enable === true;
    if (this.config.watchCalls) {
      try {
        reading.calls = callsOf(await this.client.callList());
      } catch (err) {
        this.logger.debug?.(`Call log unavailable: ${err.message}`);
        reading.calls = reading.calls ?? [];
      }
    } else {
      reading.calls = undefined;
    }
    if (!reading.infoAt || now - reading.infoAt >= INFO_INTERVAL) {
      try {
        reading.info = infoOf(await this.client.deviceInfo());
        reading.infoAt = now;
      } catch (err) {
        this.logger.debug?.(`Device info unavailable: ${err.message}`);
      }
    }
    if (
      reading.wan.linkType === 'dsl' &&
      (!reading.lineAt || now - reading.lineAt >= LINE_INTERVAL)
    ) {
      try {
        reading.line = lineOf(await this.client.dslLine());
        reading.lineAt = now;
      } catch (err) {
        this.logger.debug?.(`DSL line unavailable: ${err.message}`);
      }
    }
    this.reading = reading;
    await this.publishStates(previous, reading);
    const online = reading.hosts.filter((h) => h.active).length;
    await this.setStatus(
      true,
      T.ok({
        model: reading.info?.model,
        online,
        tracked: this.trackedHosts().size,
        internet: reading.wan.connected,
      }),
    );
  }

  async publishStates(previous, reading) {
    const states = [];
    states.push(...boxStates(ids.box(this.gladys), reading));
    const tracked = this.trackedHosts();
    const hostsByKey = new Map(
      reading.hosts.map((h) => [h.mac.toLowerCase().replace(/:/g, ''), h]),
    );
    for (const [key, device] of tracked) {
      const host = hostsByKey.get(key);
      // A host the Livebox forgot is simply away.
      states.push(...hostStates(device.external_id, host ?? { active: false }));
    }
    await this.gladys
      .publishChangedStates(states, { heartbeat: 15 * 60_000 })
      .catch((err) => this.logger.warn(`States failed: ${err.message}`));
    const events = [
      ...hostEvents(
        (mac) => tracked.get(mac.toLowerCase().replace(/:/g, ''))?.external_id,
        this.previousHosts,
        reading.hosts,
      ),
      ...callEvents(this.previousCalls, reading.calls ?? []),
      ...internetEvents(previous?.wan, reading.wan),
    ];
    this.previousHosts = new Map(reading.hosts.map((h) => [h.mac, h]));
    this.previousCalls = reading.calls ?? this.previousCalls;
    for (const event of events) {
      await this.gladys
        .publishSceneEvent(event.key, event.data)
        .catch((err) => this.logger.warn(`Scene event ${event.key} failed: ${err.message}`));
    }
    this.gladys.requestWidgetRefresh(WIDGETS.NETWORK);
    this.gladys.requestWidgetRefresh(WIDGETS.DEVICES);
  }

  // --- Commands --------------------------------------------------------------------

  async setValue(device, feature, value) {
    const key = String(feature.external_id).split(':').at(-1);
    if (parseExternalId(device.external_id)?.kind !== 'box') {
      throw new Error(`${device.external_id} accepts no command`);
    }
    const enable = Number(value) === 1;
    if (key === FEATURE.WIFI) {
      await this.client.setWifi(enable);
    } else if (key === FEATURE.GUEST_WIFI) {
      await this.client.setGuestWifi(enable);
    } else {
      throw new Error(`${key} is not a command`);
    }
    await this.gladys.publishState(feature.external_id, enable ? 1 : 0).catch(() => {});
    if (this.reading) {
      this.reading[key === FEATURE.WIFI ? 'wifi' : 'guest'] = enable;
    }
  }

  // --- Scene actions ---------------------------------------------------------------

  async getDevices() {
    if (!this.reading) {
      await this.refresh();
    }
    const online = this.reading.hosts.filter((h) => h.active);
    return {
      online: online.length,
      wifi_online: online.filter((h) => h.wireless).length,
      names: online
        .map((h) => h.name)
        .sort()
        .join(', ')
        .slice(0, 2000),
      internet: this.reading.wan?.connected ?? false,
    };
  }

  async setWifi(fields = {}) {
    const enable = fields.state === 'on' || fields.state === true || fields.state === '1';
    if (fields.network === 'guest') {
      await this.client.setGuestWifi(enable);
    } else {
      await this.client.setWifi(enable);
    }
    return { enabled: enable };
  }

  async reboot() {
    await this.client.reboot();
    return { requested: true };
  }

  // --- Widgets ---------------------------------------------------------------------

  async getWidget(key, { language } = {}) {
    if (key === WIDGETS.DEVICES) {
      return devicesWidget({ reading: this.reading, language });
    }
    return networkWidget({ gladys: this.gladys, reading: this.reading, language });
  }

  // --- Configuration screen buttons --------------------------------------------------

  async testConnection() {
    try {
      const info = infoOf(await this.client.deviceInfo());
      const wan = wanOf(await this.client.wanStatus());
      return {
        en: `${info.model ?? 'Livebox'} (firmware ${info.software ?? '?'}) answers at ${this.config.host}: internet ${wan.connected ? 'connected' : 'disconnected'}${wan.ip ? `, IP ${wan.ip}` : ''}.`,
        fr: `${info.model ?? 'Livebox'} (firmware ${info.software ?? '?'}) répond à ${this.config.host} : internet ${wan.connected ? 'connecté' : 'coupé'}${wan.ip ? `, IP ${wan.ip}` : ''}.`,
      };
    } catch (err) {
      if (err instanceof LiveboxError && err.code === 'bad_credentials') {
        return T.badCredentials;
      }
      if (err instanceof LiveboxError && err.code === 'no_password') {
        return T.noPassword;
      }
      return T.unreachable(this.config.host, err.message);
    }
  }

  async rebootAction() {
    try {
      await this.client.reboot();
      return T.rebooting;
    } catch (err) {
      return T.unreachable(this.config.host, err.message);
    }
  }
}
