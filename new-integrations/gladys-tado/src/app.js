// -----------------------------------------------------------------------------
// The integration itself: account linking, the refresh loop, the devices and
// their states, the commands, the scene triggers and actions, the widgets.
// index.js only wires the SDK handlers to it.
//
// Pace: every home is read every `refresh_interval` seconds (zone states,
// presence), the weather every 15 minutes, the device list (batteries)
// every hour. A command refreshes its home right away.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import {
  DEVICES_INTERVAL,
  PRESENCE,
  TEMPERATURE,
  TERMINATION,
  TOKEN_KEYS,
  WEATHER_INTERVAL,
  WIDGETS,
} from './constants.js';
import { CommandError, homeCommand, settingFor, terminationFor, zoneCommand } from './commands.js';
import {
  FEATURE,
  buildHomeDevice,
  buildPhoneDevice,
  buildZoneDevice,
  homeStates,
  ids,
  parseExternalId,
  phoneStates,
  thermostatMode,
  zoneStates,
} from './devices.js';
import { T } from './i18n.js';
import { AuthError, TokenManager, pollDeviceFlow, startDeviceFlow } from './tado/auth.js';
import { TadoClient } from './tado/api.js';
import {
  GENERATIONS,
  ZONE_TYPES,
  isActive,
  phonesFromDevices,
  presenceFromState,
  weatherFromState,
  zoneFromV2,
  zoneFromX,
} from './tado/model.js';
import { homeEvents } from './triggers.js';
import { homeWidget, zoneWidget } from './widget.js';

const defaultTimers = { setTimeout, clearTimeout, setInterval, clearInterval };

/** The config keys that restart the integration when they change. */
export function configFingerprint(raw = {}) {
  const { [TOKEN_KEYS.REFRESH]: _token, ...rest } = raw ?? {};
  return JSON.stringify(rest, Object.keys(rest).sort());
}

export class TadoApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'tado' }),
    now = Date.now,
    timers = defaultTimers,
    clientFactory = (tokens) => new TadoClient({ tokens }),
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.clientFactory = clientFactory;
    this.config = normalizeConfig();
    this.tokens = undefined;
    this.client = undefined;
    /** homeId -> { home, zones: Map, presence, weather, phones: Map, readAt, weatherAt, devicesAt } */
    this.homes = new Map();
    this.previous = new Map();
    this.refreshTimer = undefined;
    this.pending = undefined; // the device flow in progress
    this.lastStatus = undefined;
    this.fingerprint = undefined;
    this.refreshing = undefined;
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(raw = {}) {
    this.stop();
    this.fingerprint = configFingerprint(raw);
    this.config = normalizeConfig(raw);
    this.tokens = new TokenManager({
      refreshToken: this.config.refreshToken,
      onRefreshToken: (token) => this.persistToken(token),
      now: this.now,
    });
    this.client = this.clientFactory(this.tokens);
    if (!this.tokens.linked) {
      await this.setStatus(false, T.notLinked);
      return;
    }
    await this.connectAccount();
  }

  /** A configuration update: only the tokens changed -> nothing to restart. */
  async configUpdated(raw = {}) {
    if (configFingerprint(raw) === this.fingerprint) {
      const token = typeof raw[TOKEN_KEYS.REFRESH] === 'string' ? raw[TOKEN_KEYS.REFRESH] : '';
      if (this.tokens && token && token !== this.tokens.refreshToken) {
        this.tokens.refreshToken = token;
      }
      return;
    }
    await this.start(raw);
  }

  stop() {
    this.timers.clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
    this.cancelPending();
  }

  async persistToken(token) {
    await this.gladys
      .setConfig({ [TOKEN_KEYS.REFRESH]: token })
      .catch((err) => this.logger.warn(`Saving the tado session failed: ${err.message}`));
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

  /** Linked: discover, read once, then read on a timer. */
  async connectAccount() {
    try {
      await this.discover();
      await this.refresh();
    } catch (err) {
      await this.reportError(err);
      if (err instanceof AuthError) {
        return;
      }
    }
    this.timers.clearInterval(this.refreshTimer);
    this.refreshTimer = this.timers.setInterval(
      () => this.refresh().catch((err) => this.reportError(err)),
      this.config.refreshInterval * 1000,
    );
  }

  async reportError(err) {
    if (err instanceof AuthError) {
      this.logger.warn(`tado session invalid (${err.code}): ${err.message}`);
      this.timers.clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
      await this.setStatus(false, err.code === 'not_linked' ? T.notLinked : T.tokenExpired);
      return;
    }
    this.logger.warn(`tado unreachable: ${err.message}`);
    await this.setStatus(this.homes.size > 0, T.unreachable(err.message));
  }

  // --- Account linking (device code flow) ----------------------------------------

  cancelPending() {
    if (this.pending) {
      this.timers.clearTimeout(this.pending.timer);
      this.pending = undefined;
    }
  }

  /** "Link my tado° account" clicked: the URL the user opens. */
  async authorizeUrl() {
    this.cancelPending();
    const flow = await startDeviceFlow({ now: this.now });
    this.pending = { ...flow, timer: undefined };
    this.schedulePoll(flow.interval);
    await this.setStatus(false, T.linking(flow.url));
    this.logger.info(`Device flow started, user code ${flow.userCode}`);
    return flow.url;
  }

  schedulePoll(delay) {
    if (!this.pending) {
      return;
    }
    this.pending.timer = this.timers.setTimeout(() => this.pollLink(), delay);
  }

  async pollLink() {
    const pending = this.pending;
    if (!pending) {
      return;
    }
    if (this.now() > pending.expiresAt) {
      this.cancelPending();
      await this.setStatus(false, T.linkExpired);
      return;
    }
    let tokens;
    try {
      tokens = await pollDeviceFlow(pending.deviceCode, { now: this.now });
    } catch (err) {
      this.logger.warn(`Device flow failed (${err.code}): ${err.message}`);
      this.cancelPending();
      await this.setStatus(false, T.linkExpired);
      return;
    }
    if (!tokens) {
      this.schedulePoll(pending.interval);
      return;
    }
    this.cancelPending();
    await this.tokens.adopt(tokens);
    this.logger.info('tado account linked');
    await this.connectAccount();
  }

  async unlink() {
    this.stop();
    this.tokens?.forget();
    this.homes.clear();
    this.previous.clear();
    await this.persistToken('');
    await this.setStatus(false, T.notLinked);
    return T.unlinked;
  }

  // --- Discovery -------------------------------------------------------------------

  /** The homes and their zones; publishes the Gladys devices. */
  async discover() {
    const me = await this.client.me();
    const homes = new Map();
    for (const entry of me.homes ?? []) {
      const detail = await this.client.home(entry.id).catch(() => ({}));
      const home = {
        id: String(entry.id),
        name: entry.name ?? detail.name ?? `Home ${entry.id}`,
        timeZone: detail.dateTimeZone ?? null,
        generation: detail.generation === 'LINE_X' ? GENERATIONS.X : GENERATIONS.V2,
      };
      const known = this.homes.get(home.id);
      homes.set(home.id, {
        home,
        zones: new Map(),
        presence: known?.presence,
        weather: known?.weather,
        phones: known?.phones ?? new Map(),
        weatherAt: known?.weatherAt ?? 0,
        devicesAt: 0,
      });
    }
    this.homes = homes;
    for (const entry of this.homes.values()) {
      await this.readZones(entry);
    }
    await this.publishDevices();
  }

  /** The zone definitions (and batteries): /zones, or /roomsAndDevices on X. */
  async readZones(entry) {
    const { home } = entry;
    if (home.generation === GENERATIONS.X) {
      const answer = await this.client.roomsAndDevices(home.id);
      entry.roomDevices = new Map(
        (answer.rooms ?? []).map((room) => [String(room.id ?? room.roomId), room.devices ?? []]),
      );
      for (const room of answer.rooms ?? []) {
        const zone = zoneFromX(
          { id: room.id ?? room.roomId, name: room.roomName ?? room.name },
          room.devices ?? [],
        );
        entry.zones.set(zone.id, { ...(entry.zones.get(zone.id) ?? {}), ...zone });
      }
    } else {
      const raws = await this.client.zones(home.id);
      const previousDefinitions = entry.zoneDefinitions;
      entry.zoneDefinitions = new Map();
      for (const raw of raws) {
        const definition = { ...raw };
        if (raw.type === ZONE_TYPES.HOT_WATER && definition.canSetTemperature === undefined) {
          const known = previousDefinitions?.get(String(raw.id))?.canSetTemperature;
          definition.canSetTemperature =
            known ??
            (await this.client
              .zoneCapabilities(home.id, raw.id)
              .then((c) => c?.canSetTemperature === true)
              .catch(() => false));
        }
        entry.zoneDefinitions.set(String(raw.id), definition);
        const zone = zoneFromV2(definition, {});
        const current = entry.zones.get(zone.id);
        entry.zones.set(
          zone.id,
          current
            ? { ...current, name: zone.name, lowBattery: zone.lowBattery, devices: zone.devices }
            : zone,
        );
      }
    }
    entry.devicesAt = this.now();
  }

  async publishDevices() {
    const devices = [];
    for (const { home, zones, phones } of this.homes.values()) {
      devices.push(buildHomeDevice(this.gladys, home));
      for (const zone of zones.values()) {
        devices.push(buildZoneDevice(this.gladys, home, zone));
      }
      if (this.config.trackPhones) {
        for (const phone of phones.values()) {
          devices.push(buildPhoneDevice(this.gladys, home, phone));
        }
      }
    }
    await this.gladys.publishDiscoveredDevices(devices);
  }

  // --- Reading ---------------------------------------------------------------------

  /** Read every home. Single-flight. */
  refresh() {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = undefined;
      });
    }
    return this.refreshing;
  }

  async doRefresh() {
    let failure;
    for (const entry of this.homes.values()) {
      try {
        await this.refreshHome(entry);
      } catch (err) {
        if (err instanceof AuthError) {
          throw err;
        }
        failure = err;
      }
    }
    if (failure) {
      throw failure;
    }
    const zones = [...this.homes.values()].reduce((n, e) => n + e.zones.size, 0);
    await this.setStatus(true, T.ok(this.homes.size, zones));
  }

  async refreshHome(entry) {
    const { home } = entry;
    const now = this.now();
    if (now - entry.devicesAt >= DEVICES_INTERVAL) {
      await this.readZones(entry);
    }
    if (home.generation === GENERATIONS.X) {
      for (const room of await this.client.rooms(home.id)) {
        const zone = zoneFromX(room, entry.roomDevices?.get(String(room.id)) ?? []);
        entry.zones.set(zone.id, zone);
      }
    } else {
      const { zoneStates: states = {} } = await this.client.zoneStates(home.id);
      for (const [zoneId, state] of Object.entries(states)) {
        const definition = entry.zoneDefinitions?.get(String(zoneId)) ?? {
          id: zoneId,
          name: `Zone ${zoneId}`,
        };
        entry.zones.set(String(zoneId), zoneFromV2(definition, state));
      }
    }
    entry.presence = presenceFromState(await this.client.homeState(home.id));
    if (now - entry.weatherAt >= WEATHER_INTERVAL) {
      try {
        entry.weather = weatherFromState(await this.client.weather(home.id));
        entry.weatherAt = now;
      } catch (err) {
        this.logger.warn(`Weather of ${home.name} unavailable: ${err.message}`);
      }
    }
    if (this.config.trackPhones) {
      const phones = phonesFromDevices(await this.client.mobileDevices(home.id));
      const before = entry.phones.size;
      entry.phones = new Map(phones.map((p) => [p.id, p]));
      if (entry.phones.size !== before) {
        await this.publishDevices();
      }
    }
    await this.publishStates(entry);
  }

  async publishStates(entry) {
    const { home } = entry;
    const states = [...homeStates(this.gladys, home, entry)];
    for (const zone of entry.zones.values()) {
      states.push(...zoneStates(this.gladys, home, zone));
    }
    if (this.config.trackPhones) {
      for (const phone of entry.phones.values()) {
        states.push(...phoneStates(this.gladys, home, phone));
      }
    }
    await this.gladys.publishChangedStates(states, { heartbeat: 30 * 60_000 });
    const previous = this.previous.get(home.id);
    const current = { presence: entry.presence, zones: new Map(entry.zones) };
    const events = homeEvents(
      {
        gladys: this.gladys,
        homeDeviceId: ids.home(this.gladys, home.id),
        zoneDeviceId: (zoneId) => ids.zone(this.gladys, home.id, zoneId),
      },
      previous,
      current,
    );
    this.previous.set(home.id, current);
    for (const event of events) {
      await this.gladys
        .publishSceneEvent(event.key, event.data)
        .catch((err) => this.logger.warn(`Scene event ${event.key} failed: ${err.message}`));
    }
    this.gladys.requestWidgetRefresh(WIDGETS.HOME);
    this.gladys.requestWidgetRefresh(WIDGETS.ZONE);
  }

  // --- Commands --------------------------------------------------------------------

  locate(externalId) {
    const parsed = parseExternalId(externalId);
    const entry = parsed && this.homes.get(parsed.homeId);
    if (!entry) {
      throw new CommandError(`Unknown tado device ${externalId}`);
    }
    if (parsed.kind === 'zone') {
      const zone = entry.zones.get(parsed.id);
      if (!zone) {
        throw new CommandError(`Unknown tado zone ${externalId}`);
      }
      return { kind: 'zone', entry, zone };
    }
    return { kind: parsed.kind, entry };
  }

  /** A command from Gladys (onSetValue). */
  async setValue(device, feature, value) {
    const key = String(feature.external_id).split(':').at(-1);
    const target = this.locate(device.external_id);
    if (target.kind === 'home') {
      await this.execute(target.entry, undefined, homeCommand(key, value));
    } else if (target.kind === 'zone') {
      await this.execute(
        target.entry,
        target.zone,
        zoneCommand(target.zone, key, value, this.config),
      );
    } else {
      throw new CommandError(`${device.external_id} accepts no command`);
    }
  }

  async execute(entry, zone, command) {
    const { home } = entry;
    if (command.kind === 'presence') {
      await this.client.setPresence(home.id, command.value);
    } else if (command.kind === 'resume') {
      if (home.generation === GENERATIONS.X) {
        await this.client.resumeRoomSchedule(home.id, zone.id);
      } else {
        await this.client.deleteOverlay(home.id, zone.id);
      }
    } else if (command.kind === 'overlay') {
      if (home.generation === GENERATIONS.X) {
        await this.client.setRoomManualControl(
          home.id,
          zone.id,
          command.setting,
          command.termination,
        );
      } else {
        await this.client.setOverlay(home.id, zone.id, command.setting, command.termination);
      }
    }
    await this.refreshHome(entry).catch((err) =>
      this.logger.warn(`Refresh after command failed: ${err.message}`),
    );
  }

  // --- Scene actions ---------------------------------------------------------------

  zoneOf(fields) {
    const target = this.locate(fields.device);
    if (target.kind !== 'zone') {
      throw new CommandError('Pick a tado zone, not the home');
    }
    return target;
  }

  async setTemperature(fields = {}) {
    const { entry, zone } = this.zoneOf(fields);
    const termination = Object.values(TERMINATION).includes(fields.termination)
      ? fields.termination
      : undefined;
    const config = {
      ...this.config,
      timerMinutes: Number(fields.minutes) > 0 ? Number(fields.minutes) : this.config.timerMinutes,
    };
    await this.execute(
      entry,
      zone,
      zoneCommand(zone, FEATURE.TARGET, fields.temperature, config, { termination }),
    );
    return this.zoneOutputs(entry.zones.get(zone.id) ?? zone);
  }

  async resumeSchedule(fields = {}) {
    const { entry, zone } = this.zoneOf(fields);
    await this.execute(entry, zone, { kind: 'resume' });
    return this.zoneOutputs(entry.zones.get(zone.id) ?? zone);
  }

  async setPresence(fields = {}) {
    const target = this.locate(fields.device);
    const mode = String(fields.presence ?? PRESENCE.AUTO);
    await this.execute(target.entry, undefined, homeCommand(FEATURE.PRESENCE_MODE, mode));
    return {
      presence: target.entry.presence?.presence ?? null,
      mode: target.entry.presence?.mode ?? mode,
    };
  }

  async getZone(fields = {}) {
    const { zone } = this.zoneOf(fields);
    return this.zoneOutputs(zone);
  }

  zoneOutputs(zone) {
    return {
      zone: zone.name,
      temperature: zone.temperature,
      humidity: zone.humidity,
      target_temperature: zone.targetTemperature,
      heating: isActive(zone),
      heating_power: zone.heatingPower,
      mode:
        zone.type === ZONE_TYPES.HEATING
          ? ['off', 'manual', 'cooling', 'schedule'][thermostatMode(zone)]
          : zone.power
            ? 'on'
            : 'off',
      manual: Boolean(zone.overlay),
      open_window: zone.openWindow,
      low_battery: zone.lowBattery,
    };
  }

  // --- Widgets ---------------------------------------------------------------------

  async getWidget(key, { settings = {}, language } = {}) {
    let target;
    try {
      target = this.locate(settings.device);
    } catch {
      return {
        ttl_seconds: 300,
        components: [
          {
            type: 'text',
            text: key === WIDGETS.ZONE ? T.widget.noZone : T.widget.noHome,
            variant: 'body',
          },
        ],
      };
    }
    if (key === WIDGETS.ZONE) {
      return zoneWidget({
        gladys: this.gladys,
        home: target.entry.home,
        zone: target.zone,
        language,
      });
    }
    return homeWidget({
      gladys: this.gladys,
      home: target.entry.home,
      reading: this.previous.get(target.entry.home.id),
      language,
    });
  }

  async widgetAction(key, actionKey, params = {}, { settings = {} } = {}) {
    try {
      const target = this.locate(settings.device);
      if (key === WIDGETS.ZONE && target.kind === 'zone') {
        const { entry, zone } = target;
        if (actionKey === 'resume') {
          await this.execute(entry, zone, { kind: 'resume' });
        } else if (actionKey === 'off') {
          await this.execute(entry, zone, {
            kind: 'overlay',
            setting: settingFor(zone, { power: false }),
            termination: terminationFor(zone.generation, this.config),
          });
        } else if (actionKey === 'target') {
          const t = Number(params.target);
          await this.execute(
            entry,
            zone,
            zoneCommand(
              zone,
              FEATURE.TARGET,
              Number.isFinite(t) ? t : TEMPERATURE.MIN,
              this.config,
            ),
          );
        }
      } else if (key === WIDGETS.HOME && actionKey === 'presence') {
        await this.execute(
          target.entry,
          undefined,
          homeCommand(FEATURE.PRESENCE_MODE, params.mode),
        );
      }
      return T.widget.done;
    } catch (err) {
      return T.widget.failed(err.message);
    }
  }

  // --- Configuration screen buttons --------------------------------------------------

  async testConnection() {
    if (!this.tokens?.linked) {
      return T.notLinked;
    }
    try {
      const me = await this.client.me();
      const homes = (me.homes ?? []).map((h) => h.name).join(', ');
      return {
        en: `Signed in as ${me.email ?? me.name ?? '?'}: ${homes || 'no home'}.`,
        fr: `Connecté en tant que ${me.email ?? me.name ?? '?'} : ${homes || 'aucune maison'}.`,
      };
    } catch (err) {
      if (err instanceof AuthError) {
        return T.tokenExpired;
      }
      return T.unreachable(err.message);
    }
  }
}

// Re-exported for the widgets and tests.
export { thermostatMode, TEMPERATURE };
