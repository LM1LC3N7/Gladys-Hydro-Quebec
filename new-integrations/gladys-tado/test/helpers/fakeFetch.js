// -----------------------------------------------------------------------------
// Fake `fetch` for the tests: routes requests to handlers, records every
// call, and fails loudly on an unexpected URL. No test touches the network.
// -----------------------------------------------------------------------------

import { setFetch } from '../../src/http.js';

setFetch(async (url) => {
  throw new Error(`Network call without a fake fetch in a test: ${url}`);
});

export const json = (body, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/**
 * Install a fake fetch. `routes` is a list of [method, pattern, handler]:
 * the first route whose method and RegExp match answers handler(call),
 * `call` being { url, method, headers, body (parsed JSON or form) }.
 */
export function installFetch(routes) {
  const calls = [];
  const previous = setFetch(async (url, init = {}) => {
    const method = init.method ?? 'GET';
    let body = init.body;
    if (typeof body === 'string') {
      body = init.headers?.['Content-Type']?.includes('form')
        ? Object.fromEntries(new URLSearchParams(body))
        : JSON.parse(body);
    }
    const call = { url, method, headers: init.headers ?? {}, body };
    calls.push(call);
    const route = routes.find(([m, pattern]) => m === method && pattern.test(url));
    if (!route) {
      throw new Error(`Unexpected network call in a test: ${method} ${url}`);
    }
    return route[2](call);
  });
  return { calls, restore: () => setFetch(previous) };
}
