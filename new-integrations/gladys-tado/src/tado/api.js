// -----------------------------------------------------------------------------
// The tado REST client. Two APIs exist:
//   - my.tado.com/api/v2: the classic homes (V3+, V3, V2), with zones;
//   - hops.tado.com: the tado X homes (generation "LINE_X"), with rooms.
// Both share the authentication and the home-level endpoints (presence,
// weather, mobile devices). Every method resolves raw JSON: turning it into
// values is src/tado/model.js's job.
// -----------------------------------------------------------------------------

import { TADO_API_URL, TADO_HOPS_URL } from '../constants.js';
import { HttpError, request } from '../http.js';
import { AuthError } from './auth.js';

export class TadoClient {
  constructor({ tokens, apiUrl = TADO_API_URL, hopsUrl = TADO_HOPS_URL }) {
    this.tokens = tokens;
    this.apiUrl = apiUrl;
    this.hopsUrl = hopsUrl;
  }

  /** One authenticated call, retried once with a fresh token on a 401. */
  async call(url, options = {}, retry = true) {
    const token = await this.tokens.get();
    try {
      return await request(url, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
      });
    } catch (err) {
      if (err instanceof HttpError && err.status === 401 && retry) {
        await this.tokens.get({ force: true });
        return this.call(url, options, false);
      }
      if (err instanceof HttpError && err.status === 401) {
        throw new AuthError('unauthorized', 'tado refused the access token');
      }
      throw err;
    }
  }

  v2(path, options) {
    return this.call(`${this.apiUrl}${path}`, options);
  }

  hops(path, options) {
    return this.call(`${this.hopsUrl}${path}`, options);
  }

  // --- Account and homes ---------------------------------------------------------

  /** The account: { name, email, homes: [{ id, name }], ... }. */
  me() {
    return this.v2('/me');
  }

  /** A home: { id, name, dateTimeZone, temperatureUnit, generation, ... }. */
  home(homeId) {
    return this.v2(`/homes/${homeId}`);
  }

  /** { presence: 'HOME' | 'AWAY', presenceLocked: boolean }. */
  homeState(homeId) {
    return this.v2(`/homes/${homeId}/state`);
  }

  /** Force HOME or AWAY (`presence`), or `null` to go back to automatic. */
  setPresence(homeId, presence) {
    if (presence === null) {
      return this.v2(`/homes/${homeId}/presenceLock`, { method: 'DELETE' });
    }
    return this.v2(`/homes/${homeId}/presenceLock`, {
      method: 'PUT',
      body: { homePresence: presence },
    });
  }

  weather(homeId) {
    return this.v2(`/homes/${homeId}/weather`);
  }

  /** The phones of the home, with their geofencing location when enabled. */
  mobileDevices(homeId) {
    return this.v2(`/homes/${homeId}/mobileDevices`);
  }

  // --- Classic homes (zones) -------------------------------------------------------

  zones(homeId) {
    return this.v2(`/homes/${homeId}/zones`);
  }

  /** Every zone state in one call: { zoneStates: { '<zoneId>': state } }. */
  zoneStates(homeId) {
    return this.v2(`/homes/${homeId}/zoneStates`);
  }

  zoneCapabilities(homeId, zoneId) {
    return this.v2(`/homes/${homeId}/zones/${zoneId}/capabilities`);
  }

  /** The devices of the home (thermostats, valves, bridge), with batteries. */
  devices(homeId) {
    return this.v2(`/homes/${homeId}/devices`);
  }

  /** A manual setting until `termination` ends. */
  setOverlay(homeId, zoneId, setting, termination) {
    return this.v2(`/homes/${homeId}/zones/${zoneId}/overlay`, {
      method: 'PUT',
      body: { setting, termination },
    });
  }

  /** Back to the schedule. */
  deleteOverlay(homeId, zoneId) {
    return this.v2(`/homes/${homeId}/zones/${zoneId}/overlay`, { method: 'DELETE' });
  }

  // --- tado X homes (rooms) -----------------------------------------------------------

  /** { rooms: [...], otherDevices: [...] } of a tado X home. */
  roomsAndDevices(homeId) {
    return this.hops(`/homes/${homeId}/roomsAndDevices`);
  }

  /** The rooms of a tado X home with their live state. */
  rooms(homeId) {
    return this.hops(`/homes/${homeId}/rooms`);
  }

  setRoomManualControl(homeId, roomId, setting, termination) {
    return this.hops(`/homes/${homeId}/rooms/${roomId}/manualControl`, {
      method: 'POST',
      body: { setting, termination },
    });
  }

  resumeRoomSchedule(homeId, roomId) {
    return this.hops(`/homes/${homeId}/rooms/${roomId}/resumeSchedule`, { method: 'POST' });
  }
}
