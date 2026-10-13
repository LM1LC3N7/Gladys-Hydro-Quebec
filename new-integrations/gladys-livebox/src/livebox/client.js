// -----------------------------------------------------------------------------
// The Livebox "sysbus" client: the JSON-RPC-like API of the Livebox web
// interface (http://<livebox>/ws), as the Orange web UI, the `sysbus` tool
// and the aiosysbus library use it.
//
// Session: POST createContext with "Authorization: X-Sah-Login" -> a context
// id, then every call carries "X-Context: <id>" and the cookies the box set.
// An answer with `result.errors` means the context expired: log in again
// once and retry.
//
// Every call is { service, method, parameters } and answers { result:
// { status, data?, errors? } }. The methods below resolve `result`.
// -----------------------------------------------------------------------------

import { DEVICE_EXPRESSIONS } from '../constants.js';
import { LiveboxError, request } from '../http.js';

const CONTENT_TYPE = 'application/x-sah-ws-1-call+json';

export class LiveboxClient {
  constructor({ host, username, password }) {
    this.base = `http://${host}`;
    this.username = username;
    this.password = password;
    this.context = undefined;
    this.cookies = new Map();
    this.loggingIn = undefined;
  }

  get wsUrl() {
    return `${this.base}/ws`;
  }

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  rememberCookies(headers) {
    const list = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
    for (const header of list) {
      const [pair] = header.split(';');
      const index = pair.indexOf('=');
      if (index > 0) {
        this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
      }
    }
  }

  /** Open a session (single-flight). */
  login() {
    if (!this.loggingIn) {
      this.loggingIn = this.doLogin().finally(() => {
        this.loggingIn = undefined;
      });
    }
    return this.loggingIn;
  }

  async doLogin() {
    if (!this.password) {
      throw new LiveboxError('no_password', 'No Livebox password configured');
    }
    this.context = undefined;
    this.cookies.clear();
    // The web UI first loads the home page: the box sets its session cookies.
    const home = await request(`${this.base}/`);
    this.rememberCookies(home.headers);
    const answer = await request(this.wsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': CONTENT_TYPE,
        Authorization: 'X-Sah-Login',
        ...(this.cookies.size > 0 ? { Cookie: this.cookieHeader() } : {}),
      },
      body: JSON.stringify({
        service: 'sah.Device.Information',
        method: 'createContext',
        parameters: {
          applicationName: 'so_sdkut',
          username: this.username,
          password: this.password,
        },
      }),
    });
    this.rememberCookies(answer.headers);
    let body;
    try {
      body = JSON.parse(answer.text);
    } catch {
      throw new LiveboxError(
        'protocol',
        `The Livebox answered ${answer.status} without JSON: is this the Livebox address?`,
      );
    }
    if (answer.status === 401 || answer.status === 403 || !body?.data?.contextID) {
      throw new LiveboxError('bad_credentials', 'The Livebox refused the login (wrong password?)');
    }
    this.context = body.data.contextID;
    return this.context;
  }

  /** One call; resolves `result`. Re-logs in once on an expired context. */
  async call(service, method, parameters = {}, retry = true) {
    if (!this.context) {
      await this.login();
    }
    const answer = await request(this.wsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': CONTENT_TYPE,
        'X-Context': this.context,
        ...(this.cookies.size > 0 ? { Cookie: this.cookieHeader() } : {}),
      },
      body: JSON.stringify({ service, method, parameters }),
    });
    this.rememberCookies(answer.headers);
    let body;
    try {
      body = JSON.parse(answer.text);
    } catch {
      throw new LiveboxError(
        'protocol',
        `${service}.${method} answered ${answer.status} without JSON`,
      );
    }
    const result = body?.result ?? body;
    if (answer.status === 401 || answer.status === 403 || result?.errors?.length) {
      if (retry) {
        this.context = undefined;
        await this.login();
        return this.call(service, method, parameters, false);
      }
      const first = result?.errors?.[0];
      throw new LiveboxError(
        'refused',
        `${service}.${method}: ${first?.description ?? first?.info ?? answer.status}`,
      );
    }
    return result ?? {};
  }

  // --- The calls the integration needs ------------------------------------------

  /** The LAN devices: { wifi: [...], eth: [...] } (status). */
  async devices() {
    const result = await this.call('Devices', 'get', { expression: DEVICE_EXPRESSIONS });
    return result.status ?? {};
  }

  /** { LinkType, LinkState, ConnectionState, IPAddress, ... } (data). */
  async wanStatus() {
    return (await this.call('NMC', 'getWANStatus')).data ?? {};
  }

  /** { ProductClass, SoftwareVersion, UpTime, ExternalIPAddress, ... } (status). */
  async deviceInfo() {
    return (await this.call('DeviceInfo', 'get')).status ?? {};
  }

  async wifi() {
    return (await this.call('NMC.Wifi', 'get')).status ?? {};
  }

  setWifi(enable) {
    return this.call('NMC.Wifi', 'set', { Enable: enable, Status: enable });
  }

  async guestWifi() {
    return (await this.call('NMC.Guest', 'get')).status ?? {};
  }

  setGuestWifi(enable) {
    return this.call('NMC.Guest', 'set', { Enable: enable });
  }

  /** The call log: [{ callId, remoteNumber, callType, startTime, duration, ... }]. */
  async callList() {
    const result = await this.call('VoiceService.VoiceApplication', 'getCallList', {});
    const list = result.status ?? [];
    return Array.isArray(list) ? list : [];
  }

  /** The DSL line (xDSL boxes): { DownstreamCurrRate, UpstreamCurrRate, ... } or {}. */
  async dslLine() {
    const result = await this.call('NeMo.Intf.data', 'getMIBs', {
      mibs: 'dsl',
      flag: '',
      traverse: 'down',
    });
    return result.status?.dsl?.dsl0 ?? {};
  }

  reboot() {
    return this.call('NMC', 'reboot', { reason: 'GUI_Reboot' });
  }
}
