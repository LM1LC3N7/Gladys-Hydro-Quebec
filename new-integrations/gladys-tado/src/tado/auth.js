// -----------------------------------------------------------------------------
// tado authentication: the OAuth2 "device code" flow (the only one tado has
// accepted since March 2025) and the refresh of the access token.
//
//   1. startDeviceFlow()  -> a URL the user opens and approves in the browser
//   2. pollDeviceFlow()   -> the tokens, once approved (polled every `interval`)
//   3. refresh()          -> a fresh access token from the refresh token
//
// Refresh tokens rotate: every refresh returns a new one, which the app
// persists (Gladys config, off-schema key). A refresh token unused for 30
// days expires: the user has to link the account again.
// -----------------------------------------------------------------------------

import { TADO_AUTH_URL, TADO_CLIENT_ID, TADO_SCOPE, TOKEN_MARGIN } from '../constants.js';
import { HttpError, request } from '../http.js';

export class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

function oauthError(err) {
  if (err instanceof HttpError) {
    let code = `http_${err.status}`;
    try {
      code = JSON.parse(err.body).error ?? code;
    } catch {
      // not JSON
    }
    return new AuthError(code, err.message);
  }
  return new AuthError('network', err?.message ?? String(err));
}

/** Ask tado for a device code. Resolves { deviceCode, url, interval, expiresAt }. */
export async function startDeviceFlow({ now = Date.now } = {}) {
  let answer;
  try {
    answer = await request(`${TADO_AUTH_URL}/device_authorize`, {
      method: 'POST',
      form: true,
      body: { client_id: TADO_CLIENT_ID, scope: TADO_SCOPE },
    });
  } catch (err) {
    throw oauthError(err);
  }
  return {
    deviceCode: answer.device_code,
    userCode: answer.user_code,
    url: answer.verification_uri_complete ?? answer.verification_uri,
    interval: Math.max(1, Number(answer.interval) || 5) * 1000,
    expiresAt: now() + (Number(answer.expires_in) || 300) * 1000,
  };
}

/**
 * One poll of the token endpoint. Resolves the tokens once the user approved,
 * `undefined` while pending, throws an AuthError when the code expired or was
 * denied.
 */
export async function pollDeviceFlow(deviceCode, { now = Date.now } = {}) {
  try {
    return tokens(
      await request(`${TADO_AUTH_URL}/token`, {
        method: 'POST',
        form: true,
        body: {
          client_id: TADO_CLIENT_ID,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: deviceCode,
        },
      }),
      now,
    );
  } catch (err) {
    const error = oauthError(err);
    if (error.code === 'authorization_pending' || error.code === 'slow_down') {
      return undefined;
    }
    throw error;
  }
}

/** A fresh access token (and the rotated refresh token). */
export async function refresh(refreshToken, { now = Date.now } = {}) {
  try {
    return tokens(
      await request(`${TADO_AUTH_URL}/token`, {
        method: 'POST',
        form: true,
        body: {
          client_id: TADO_CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        },
      }),
      now,
    );
  } catch (err) {
    throw oauthError(err);
  }
}

function tokens(answer, now) {
  if (!answer?.access_token) {
    throw new AuthError('no_token', 'tado answered without an access token');
  }
  return {
    accessToken: answer.access_token,
    refreshToken: answer.refresh_token,
    expiresAt: now() + (Number(answer.expires_in) || 600) * 1000,
  };
}

/**
 * Keeps a valid access token: refreshes it ahead of its expiry, serializes
 * the refreshes, and hands every rotated refresh token to `onRefreshToken`
 * so it can be persisted.
 */
export class TokenManager {
  constructor({ refreshToken, onRefreshToken, now = Date.now }) {
    this.refreshToken = refreshToken ?? '';
    this.accessToken = undefined;
    this.expiresAt = 0;
    this.onRefreshToken = onRefreshToken ?? (async () => {});
    this.now = now;
    this.refreshing = undefined;
  }

  get linked() {
    return Boolean(this.refreshToken);
  }

  /** Adopt the tokens of a device flow (or a refresh). */
  async adopt({ accessToken, refreshToken, expiresAt }) {
    this.accessToken = accessToken;
    this.expiresAt = expiresAt;
    if (refreshToken && refreshToken !== this.refreshToken) {
      this.refreshToken = refreshToken;
      await this.onRefreshToken(refreshToken);
    }
  }

  forget() {
    this.accessToken = undefined;
    this.refreshToken = '';
    this.expiresAt = 0;
  }

  /** A valid access token, refreshed when needed. Single-flight. */
  async get({ force = false } = {}) {
    if (!this.linked) {
      throw new AuthError('not_linked', 'No tado account linked');
    }
    if (!force && this.accessToken && this.now() < this.expiresAt - TOKEN_MARGIN) {
      return this.accessToken;
    }
    if (!this.refreshing) {
      this.refreshing = refresh(this.refreshToken, { now: this.now })
        .then((fresh) => this.adopt(fresh))
        .finally(() => {
          this.refreshing = undefined;
        });
    }
    await this.refreshing;
    return this.accessToken;
  }
}
