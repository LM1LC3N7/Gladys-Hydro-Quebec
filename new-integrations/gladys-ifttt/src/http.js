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
  constructor(status, body) {
    super(`HTTP ${status}${body ? `: ${body}` : ''}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

/** POST a JSON body, resolve the text of a 2xx answer, throw otherwise. */
export async function postJson(url, body, { timeout = HTTP_TIMEOUT } = {}) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.max(1, timeout)),
  });
  const text = (await response.text()).slice(0, 500);
  if (!response.ok) {
    throw new HttpError(response.status, text);
  }
  return text;
}
