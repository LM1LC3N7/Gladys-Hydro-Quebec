// -----------------------------------------------------------------------------
// The IFTTT Webhooks service client: one call per applet trigger.
//
// Two endpoints exist. `/trigger/<event>/with/key/<key>` takes up to three
// values (the "value1".."value3" ingredients of the applet), and
// `/trigger/<event>/json/with/key/<key>` takes any JSON object, exposed to
// the applet as a single "JSON payload" ingredient.
// -----------------------------------------------------------------------------

import { EVENT_NAME, IFTTT_BASE_URL } from './constants.js';
import { HttpError, postJson } from './http.js';

export class IftttError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'IftttError';
    this.code = code;
  }
}

/** The name as IFTTT accepts it, or an IftttError. */
export function validateEventName(event) {
  const name = String(event ?? '').trim();
  if (!EVENT_NAME.test(name)) {
    throw new IftttError('invalid_event', `Invalid IFTTT event name "${name}"`);
  }
  return name;
}

/** The ingredients of a value-based trigger, empty values left out. */
export function valueBody({ value1, value2, value3 } = {}) {
  const body = {};
  for (const [key, value] of Object.entries({ value1, value2, value3 })) {
    if (value !== undefined && value !== null && String(value) !== '') {
      body[key] = String(value);
    }
  }
  return body;
}

/** Parse the JSON payload typed by the scene author (an object). */
export function parsePayload(text) {
  const raw = String(text ?? '').trim();
  if (!raw) {
    return {};
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new IftttError('invalid_json', 'The payload is not valid JSON');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new IftttError('invalid_json', 'The payload must be a JSON object');
  }
  return payload;
}

function wrap(err) {
  if (err instanceof HttpError) {
    if (err.status === 401 || err.status === 403) {
      return new IftttError('bad_key', 'IFTTT refused the Webhooks key');
    }
    if (err.status === 404) {
      return new IftttError('bad_key', 'IFTTT does not know this key (404)');
    }
    return new IftttError('ifttt_error', `IFTTT answered ${err.status}`);
  }
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return new IftttError('timeout', 'IFTTT did not answer in time');
  }
  return new IftttError('network', err?.message ?? String(err));
}

export class IftttClient {
  constructor({ key, baseUrl = IFTTT_BASE_URL }) {
    this.key = String(key ?? '').trim();
    this.baseUrl = baseUrl;
  }

  /** Trigger `event` with up to three values. Resolves the IFTTT answer text. */
  async trigger(event, values) {
    return this.send(
      `${this.path(event)}/with/key/${encodeURIComponent(this.key)}`,
      valueBody(values),
    );
  }

  /** Trigger `event` with an arbitrary JSON object. */
  async triggerJson(event, payload) {
    return this.send(`${this.path(event)}/json/with/key/${encodeURIComponent(this.key)}`, payload);
  }

  path(event) {
    return `${this.baseUrl}/trigger/${encodeURIComponent(validateEventName(event))}`;
  }

  async send(url, body) {
    if (!this.key) {
      throw new IftttError('no_key', 'No IFTTT Webhooks key configured');
    }
    try {
      return await postJson(url, body);
    } catch (err) {
      throw wrap(err);
    }
  }
}
