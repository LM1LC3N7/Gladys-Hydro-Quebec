// -----------------------------------------------------------------------------
// The only place that talks to the network: `fetch` with a timeout. The tests
// replace it with `setFetch()`.
// -----------------------------------------------------------------------------

import { HTTP_TIMEOUT, USER_AGENT } from './constants.js';

let fetchImpl = (...args) => globalThis.fetch(...args);

/** Replace the fetch implementation (tests only). Returns the previous one. */
export function setFetch(impl) {
  const previous = fetchImpl;
  fetchImpl = impl;
  return previous;
}

export class LiveboxError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LiveboxError';
    this.code = code;
  }
}

/** One HTTP request; resolves { status, headers, text }. Never follows redirects. */
export async function request(url, { method = 'GET', headers = {}, body } = {}) {
  try {
    const response = await fetchImpl(url, {
      method,
      headers: { 'User-Agent': USER_AGENT, ...headers },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(HTTP_TIMEOUT),
    });
    return { status: response.status, headers: response.headers, text: await response.text() };
  } catch (err) {
    const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new LiveboxError(timeout ? 'timeout' : 'network', err?.message ?? String(err));
  }
}
