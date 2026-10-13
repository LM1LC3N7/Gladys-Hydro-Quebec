// -----------------------------------------------------------------------------
// The only place that talks to the network: `fetch` with a timeout and an
// identifiable User-Agent. The tests replace it with `setFetch()`.
// -----------------------------------------------------------------------------

import { HTTP_TIMEOUT, USER_AGENT } from './constants.js';

let fetchImpl = (...args) => globalThis.fetch(...args);

/** Replace the fetch implementation (tests only). Returns the previous one. */
export function setFetch(impl) {
  const previous = fetchImpl;
  fetchImpl = impl;
  return previous;
}

export class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} on ${new URL(url).pathname}${body ? `: ${body}` : ''}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

/**
 * One request. `body` is JSON-encoded (or form-encoded with `form: true`);
 * resolves the parsed JSON answer (undefined on an empty body), throws an
 * HttpError on a non-2xx status.
 */
export async function request(
  url,
  { method = 'GET', headers = {}, body, form = false, timeout = HTTP_TIMEOUT } = {},
) {
  const init = {
    method,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(Math.max(1, timeout)),
  };
  if (body !== undefined) {
    init.headers['Content-Type'] = form ? 'application/x-www-form-urlencoded' : 'application/json';
    init.body = form ? new URLSearchParams(body).toString() : JSON.stringify(body);
  }
  const response = await fetchImpl(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(response.status, url, text.slice(0, 300));
  }
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
