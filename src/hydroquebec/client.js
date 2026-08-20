// -----------------------------------------------------------------------------
// Hydro-Québec HTTP client.
//
// Ported from `hydroqc.hydro_api.client.HydroClient` (Python, aiohttp-based,
// https://gitlab.com/hydroqc/hydroqc). There is no JavaScript equivalent of
// this library, so the whole authentication flow (Azure AD B2C with PKCE) and
// every endpoint used below are a line-by-line port of hydroqc's source as it
// stood on 2026-08-20. Comments quoting hydroqc explain WHY a step exists;
// see hydroqc's own source for the canonical reference if Hydro-Québec changes
// its portal again.
// -----------------------------------------------------------------------------

import crypto from 'node:crypto';
import { CookieJar } from './cookieJar.js';
import { generatePkcePair } from './pkce.js';
import { HydroQcAuthError, HydroQcHttpError } from './errors.js';
import {
  ANNUAL_DATA_URL,
  AUTHORIZE_URL,
  AUTH_CALLBACK_URL,
  AUTH_URL,
  AZB2C_CLIENT_ID_WEB,
  AZB2C_POLICY,
  AZB2C_SCOPE_WEB,
  AZB2C_TIMEOUT_SKEW_SECONDS,
  CONFIRMED_URL,
  CONTRACT_LIST_URL,
  CONTRACT_SUMMARY_URL,
  CUSTOMER_INFO_URL,
  DAILY_CONSUMPTION_URL,
  FLEXD_DATA_URL,
  FLEXD_PEAK_URL,
  GET_CPC_API_URL,
  IS_HYDRO_PORTAL_UP_URL,
  MONTHLY_DATA_URL,
  OPEN_DATA_PEAK_URL,
  OUTAGES_URL,
  PERIOD_DATA_URL,
  PORTRAIT_URL,
  RELATION_URL,
  REQUESTS_TIMEOUT_MS,
  SESSION_URL,
  TOKEN_URL,
} from './consts.js';

const USER_AGENT = 'GladysHydroQuebecIntegration/0.1.0 (+https://github.com/LM1LC3N7/Gladys-Hydro-Quebec)';

function formatDateDerniereVisite(date) {
  const pad = (n) => String(n).padStart(2, '0');
  // The literal ".000+0000" suffix is not real milliseconds/offset: Hydro-Québec's
  // API expects this exact static suffix (mirrors hydroqc's strftime format string).
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.000+0000`;
}

export class HydroClient {
  constructor(username, password, { logger } = {}) {
    this.username = username;
    this.password = password;
    this._logger = logger ?? console;
    this.cookieJar = new CookieJar();
    this.guid = crypto.randomUUID();
    this._reset();
  }

  _reset() {
    this._idToken = '';
    this.accessToken = '';
    this.accessTokenExpiry = new Date(0);
    this.refreshToken = '';
    this.refreshTokenExpiry = new Date(0);
    this.webSessionExpiry = new Date(0);
    this._selectedContract = '';
    this._selectedCustomer = '';
  }

  // --- Low-level HTTP -------------------------------------------------------

  async _rawFetch(url, method, { params, data, headers = {}, formEncoded = false } = {}) {
    const fullUrl = new URL(url);
    if (params) {
      for (const [key, value] of Object.entries(params)) fullUrl.searchParams.set(key, value);
    }
    const cookie = this.cookieJar.header(fullUrl.toString());
    const finalHeaders = { 'User-Agent': USER_AGENT, ...headers };
    if (cookie) finalHeaders.Cookie = cookie;

    let body;
    if (data !== undefined) {
      if (typeof data === 'string') body = data;
      else if (formEncoded) body = new URLSearchParams(data).toString();
      else body = JSON.stringify(data);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUESTS_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(fullUrl.toString(), {
        method,
        headers: finalHeaders,
        body,
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    this.cookieJar.extract(fullUrl.toString(), response.headers);
    return response;
  }

  /** Follow redirects manually (fetch's automatic follow loses intermediate Set-Cookie headers). */
  async _fetchFollowingRedirects(url, method, opts, maxHops = 10) {
    let currentUrl = url;
    let currentMethod = method;
    let currentOpts = opts;
    for (let hop = 0; hop < maxHops; hop += 1) {
      const response = await this._rawFetch(currentUrl, currentMethod, currentOpts);
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        currentUrl = new URL(location, currentUrl).toString();
        currentMethod = 'get';
        currentOpts = {};
        continue;
      }
      return response;
    }
    throw new HydroQcHttpError(`Too many redirects fetching ${url}`, 310);
  }

  async httpRequest(url, method, { expectStatus = 200, followRedirects = false, ...opts } = {}) {
    const response = followRedirects
      ? await this._fetchFollowingRedirects(url, method, opts)
      : await this._rawFetch(url, method, opts);
    if (expectStatus !== null && response.status !== expectStatus) {
      const text = await response.text().catch(() => '');
      throw new HydroQcHttpError(`Error fetching ${url} - ${response.status}: ${text.slice(0, 300)}`, response.status);
    }
    return response;
  }

  _loadJson(text) {
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new HydroQcHttpError(`Bad JSON response: ${err.message}. Preview: ${text.slice(0, 300)}`);
    }
  }

  getTokenData() {
    if (!this._idToken) return null;
    const payloadSegment = this._idToken.split('.')[1];
    const padded = payloadSegment.padEnd(payloadSegment.length + ((4 - (payloadSegment.length % 4)) % 4), '=');
    return this._loadJson(Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  }

  // --- Authentication (Azure AD B2C, PKCE) -----------------------------------

  async checkPortalStatus() {
    const res = await this.httpRequest(IS_HYDRO_PORTAL_UP_URL, 'get', { expectStatus: null });
    return res.status === 200;
  }

  /**
   * Log in to the Hydro-Québec customer portal.
   *
   * Hydro-Québec authenticates through Azure AD B2C. This is a 4-step dance
   * (see hydroqc's hydro_api/client.py `login()` for the original, heavily
   * commented, reverse-engineered flow):
   *   1. GET the authorize endpoint (follows redirects) to obtain a page that
   *      embeds a `csrf` token and a `transId`.
   *   2. POST the credentials to the `SelfAsserted` endpoint using that csrf
   *      token.
   *   3. GET the `.../confirmed` endpoint: on success it 302-redirects to a
   *      custom URI scheme carrying an authorization `code` in the query
   *      string of its `Location` header (never actually followed).
   *   4. Exchange that code (+ PKCE verifier) for the OAuth2 tokens.
   */
  async login() {
    this._logger.info(`Login using ${this.username}`);
    this._reset();
    this.cookieJar.clear();

    const { verifier, challenge } = generatePkcePair();

    const authorizeRes = await this.httpRequest(AUTHORIZE_URL, 'get', {
      headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      params: {
        redirect_uri: AUTH_CALLBACK_URL,
        client_id: AZB2C_CLIENT_ID_WEB,
        response_type: 'code',
        scope: AZB2C_SCOPE_WEB,
        prompt: 'login',
        ui_locales: 'fr',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        mobile: 'false',
      },
      followRedirects: true,
    });
    const html = await authorizeRes.text();
    const csrfMatch = html.match(/csrf":"(.+?)"/);
    const transIdMatch = html.match(/transId":"(.+?)"/);
    if (!csrfMatch || !transIdMatch) {
      throw new HydroQcAuthError(
        'Could not find the csrf token / transId on the Hydro-Québec login page (the portal may have changed, or credentials are already locked out).',
      );
    }
    const csrfToken = csrfMatch[1];
    const transId = transIdMatch[1];

    const selfAssertedUrl = `${AUTH_URL}?tx=${encodeURIComponent(transId)}&p=${AZB2C_POLICY}`;
    const selfAssertedRes = await this.httpRequest(selfAssertedUrl, 'post', {
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        accept: 'application/json, text/javascript, */*; q=0.01',
        'x-csrf-token': csrfToken,
      },
      data: { request_type: 'RESPONSE', signInName: this.username, password: this.password },
      formEncoded: true,
    });
    const selfAssertedJson = this._loadJson(await selfAssertedRes.text());
    if (String(selfAssertedJson.status) !== '200') {
      throw new HydroQcAuthError(`Login failed: ${selfAssertedJson.message ?? 'invalid credentials'}`);
    }

    const confirmedUrl =
      `${CONFIRMED_URL}?rememberMe=false&csrf_token=${encodeURIComponent(csrfToken)}` +
      `&tx=${encodeURIComponent(transId)}&p=${AZB2C_POLICY}`;
    const confirmedRes = await this.httpRequest(confirmedUrl, 'get', {
      headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      expectStatus: 302,
    });
    const location = confirmedRes.headers.get('location') || '';
    const codeMatch = location.match(/code=(.+)$/);
    if (!codeMatch) {
      throw new HydroQcAuthError('Could not find the authorization code in the redirect (login likely failed).');
    }
    const code = codeMatch[1];

    const tokenRes = await this.httpRequest(TOKEN_URL, 'post', {
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: '*/*' },
      data: {
        grant_type: 'authorization_code',
        client_id: AZB2C_CLIENT_ID_WEB,
        redirect_uri: AUTH_CALLBACK_URL,
        code,
        code_verifier: verifier,
      },
      formEncoded: true,
    });
    this._applyTokenResponse(await tokenRes.json());
    this._logger.info(`Login completed using ${this.username}`);
    return true;
  }

  _applyTokenResponse(json) {
    this._idToken = json.id_token;
    this.accessToken = json.access_token;
    this.accessTokenExpiry = new Date(Date.now() + (Number(json.expires_in) - AZB2C_TIMEOUT_SKEW_SECONDS) * 1000);
    this.refreshToken = json.refresh_token;
    this.refreshTokenExpiry = new Date(
      Date.now() + (Number(json.refresh_token_expires_in) - AZB2C_TIMEOUT_SKEW_SECONDS) * 1000,
    );
  }

  async _refreshAccessToken() {
    this._logger.debug('Refreshing access token');
    const res = await this.httpRequest(TOKEN_URL, 'post', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json, text/plain, */*' },
      data: {
        grant_type: 'refresh_token',
        scope: AZB2C_SCOPE_WEB,
        client_id: AZB2C_CLIENT_ID_WEB,
        refresh_token: this.refreshToken,
      },
      formEncoded: true,
    });
    this._applyTokenResponse(await res.json());
  }

  isSessionExpired() {
    return this.refreshTokenExpiry < new Date();
  }

  async _getAccessToken(forceRefresh = true) {
    if (this.isSessionExpired()) {
      await this.login();
    } else if (forceRefresh || this.accessTokenExpiry < new Date()) {
      await this._refreshAccessToken();
    }
    return this.accessToken;
  }

  async _getCustomerHeaders(applicantId, customerId, forceRefresh = false) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await this._getAccessToken(forceRefresh)}`,
      NO_PARTENAIRE_DEMANDEUR: applicantId,
      NO_PARTENAIRE_TITULAIRE: customerId,
      DATE_DERNIERE_VISITE: formatDateDerniereVisite(new Date()),
      GUID_SESSION: this.guid,
    };
  }

  // --- Portal session (needed by the /portail/ style consumption endpoints) --

  async _createWebSession(applicantId, customerId) {
    this._logger.debug('Creating new portal web session');
    // Hydroqc clears every cookie here: the portal session is tied to the
    // freshest access token, so stale cookies from a previous contract
    // selection must not leak into the new one.
    this.cookieJar.clear();
    const headers = await this._getCustomerHeaders(applicantId, customerId, true);
    await this.httpRequest(SESSION_URL, 'get', { params: { mode: 'web' }, headers });
    this.webSessionExpiry = this.accessTokenExpiry;
  }

  /**
   * Select a contract on the portal ("click" the customer/contract box on the
   * portal home page). Unlike hydroqc (which only re-selects when the web
   * session has expired, which can leave the WRONG contract selected when
   * polling several contracts back-to-back within one token lifetime), this
   * also re-selects whenever the requested contract differs from the one
   * currently active - the extra request is cheap and this is required for
   * correct multi-contract support.
   */
  async _selectContract(applicantId, customerId, contractId) {
    const needsReselect = this._selectedContract !== contractId || this.webSessionExpiry <= new Date();
    if (!needsReselect) return;
    await this._createWebSession(applicantId, customerId);
    this._logger.debug(`Selecting contract ${contractId}`);
    await this.httpRequest(PORTRAIT_URL, 'get', { params: { noContrat: contractId } });
    this._selectedContract = contractId;
    this._selectedCustomer = customerId;
  }

  // --- Discovery ---------------------------------------------------------

  async getUserInfo() {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await this._getAccessToken()}`,
    };
    const res = await this.httpRequest(RELATION_URL, 'get', { headers });
    return res.json();
  }

  async getCustomerInfo(applicantId, customerId) {
    const headers = await this._getCustomerHeaders(applicantId, customerId);
    const res = await this.httpRequest(CUSTOMER_INFO_URL, 'get', {
      headers,
      params: { withCredentials: 'true' },
    });
    return res.json();
  }

  async listAccountContract(applicantId, customerId) {
    const headers = await this._getCustomerHeaders(applicantId, customerId);
    const res = await this.httpRequest(CONTRACT_SUMMARY_URL, 'get', { headers });
    return res.json();
  }

  async getContractInfo(applicantId, customerId, accountId, contractId) {
    const headers = await this._getCustomerHeaders(applicantId, customerId);
    const postData = {
      listeServices: ['PC'],
      comptesContrats: [{ listeNoContrat: [contractId], noCompteContrat: accountId, titulaire: customerId }],
    };
    const res = await this.httpRequest(CONTRACT_LIST_URL, 'post', {
      headers,
      data: JSON.stringify(postData),
    });
    const data = await res.json();
    if (!data.listeContrats || data.listeContrats.length === 0) {
      throw new HydroQcHttpError(`Contract ${contractId} not found`);
    }
    return data.listeContrats[0];
  }

  // --- Consumption / billing ----------------------------------------------

  async getPeriodsInfo(applicantId, customerId, contractId) {
    await this._selectContract(applicantId, customerId, contractId);
    const headers = await this._getCustomerHeaders(applicantId, customerId);
    const res = await this.httpRequest(PERIOD_DATA_URL, 'get', { headers });
    const data = this._loadJson(await res.text());
    const periods = (data.results ?? []).filter((p) => p.numeroContrat === contractId);
    if (periods.length === 0) throw new HydroQcHttpError(`No period found for contract ${contractId}`);
    return periods;
  }

  async getDailyConsumption(applicantId, customerId, contractId) {
    await this._selectContract(applicantId, customerId, contractId);
    const res = await this.httpRequest(DAILY_CONSUMPTION_URL, 'get');
    return this._loadJson(await res.text());
  }

  async getMonthlyConsumption(applicantId, customerId, contractId) {
    await this._selectContract(applicantId, customerId, contractId);
    const res = await this.httpRequest(MONTHLY_DATA_URL, 'get', { headers: { 'Content-Type': 'application/json' } });
    return this._loadJson(await res.text());
  }

  async getAnnualConsumption(applicantId, customerId, contractId) {
    await this._selectContract(applicantId, customerId, contractId);
    const res = await this.httpRequest(ANNUAL_DATA_URL, 'get', { headers: { 'Content-Type': 'application/json' } });
    return this._loadJson(await res.text());
  }

  // --- Outages -------------------------------------------------------------

  async getOutages(consumptionLocationId) {
    const res = await this.httpRequest(OUTAGES_URL + consumptionLocationId, 'get');
    const list = await res.json();
    return list.length > 0 ? list[0] : null;
  }

  // --- Winter Credit (CPC) / Flex D (DPC) -----------------------------------

  async getCpcCredit(applicantId, customerId, contractId) {
    const headers = await this._getCustomerHeaders(applicantId, customerId);
    const res = await this.httpRequest(GET_CPC_API_URL, 'get', { headers, params: { noContrat: contractId } });
    return res.json();
  }

  async getDpcData(applicantId, customerId, contractId) {
    await this._selectContract(applicantId, customerId, contractId);
    const headers = await this._getCustomerHeaders(applicantId, customerId);
    const res = await this.httpRequest(FLEXD_DATA_URL, 'get', { headers, params: { noContrat: contractId } });
    return this._loadJson(await res.text());
  }

  async getDpcPeakData(applicantId, customerId, contractId) {
    await this._selectContract(applicantId, customerId, contractId);
    const headers = await this._getCustomerHeaders(applicantId, customerId);
    const res = await this.httpRequest(FLEXD_PEAK_URL, 'get', { headers, params: { noContrat: contractId } });
    return this._loadJson(await res.text());
  }

  /** Public, unauthenticated feed of every past/upcoming peak event, for a given offer code. */
  async getOpenDataPeaks(offer) {
    const res = await this.httpRequest(OPEN_DATA_PEAK_URL, 'get');
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      // Hydro-Québec's open-data file sometimes ships with `//`/`#` comment lines.
      const cleaned = text
        .split('\n')
        .filter((line) => !line.startsWith('/') && !line.startsWith('#'))
        .join('\n');
      json = JSON.parse(cleaned);
    }
    const events = json.evenements ?? [];
    return offer ? events.filter((e) => e.offre === offer) : events;
  }

  async closeSession() {
    // Node's fetch has no persistent connection pool to explicitly close here;
    // kept for API symmetry with hydroqc's `close_session()`.
  }
}
