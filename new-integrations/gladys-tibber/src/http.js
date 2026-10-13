// -----------------------------------------------------------------------------
// The only place that talks to the network over HTTP: one GraphQL POST with a
// timeout and an identifiable User-Agent. The tests replace `fetch` with
// `setFetch()`.
// -----------------------------------------------------------------------------

import { HTTP_TIMEOUT, TIBBER_API_URL, USER_AGENT } from './constants.js';

let fetchImpl = (...args) => globalThis.fetch(...args);

/** Replace the fetch implementation (tests only). Returns the previous one. */
export function setFetch(impl) {
  const previous = fetchImpl;
  fetchImpl = impl;
  return previous;
}

export class TibberError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TibberError';
    this.code = code;
  }
}

/** POST a GraphQL query; resolves `data`, throws a TibberError otherwise. */
export async function graphql(token, query, variables = {}, { url = TIBBER_API_URL } = {}) {
  if (!token) {
    throw new TibberError('no_token', 'No Tibber access token configured');
  }
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT),
    });
  } catch (err) {
    const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new TibberError(timeout ? 'timeout' : 'network', err?.message ?? String(err));
  }
  const text = await response.text();
  if (response.status === 401 || response.status === 403) {
    throw new TibberError('bad_token', 'Tibber refused the access token');
  }
  if (!response.ok) {
    throw new TibberError('http', `Tibber answered ${response.status}: ${text.slice(0, 200)}`);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new TibberError('http', 'Tibber answered something that is not JSON');
  }
  if (body.errors?.length) {
    const first = body.errors[0];
    const code = first.extensions?.code === 'UNAUTHENTICATED' ? 'bad_token' : 'graphql';
    throw new TibberError(code, first.message ?? 'GraphQL error');
  }
  return body.data;
}
