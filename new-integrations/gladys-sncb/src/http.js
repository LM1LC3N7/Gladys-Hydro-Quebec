// -----------------------------------------------------------------------------
// The only place that talks to the network: `fetch` with a timeout and the
// User-Agent iRail asks for. The tests replace it with `setFetch()`.
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

/** GET a JSON document; throws an HttpError on a non-2xx status. */
export async function getJson(url, { timeout = HTTP_TIMEOUT } = {}) {
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    redirect: 'follow',
    signal: AbortSignal.timeout(Math.max(1, timeout)),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 200);
    try {
      message = JSON.parse(text).message ?? message;
    } catch {
      // not JSON
    }
    throw new HttpError(response.status, url, message);
  }
  return text ? JSON.parse(text) : undefined;
}
