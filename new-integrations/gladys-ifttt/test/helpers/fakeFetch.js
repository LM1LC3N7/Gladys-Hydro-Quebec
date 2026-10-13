// -----------------------------------------------------------------------------
// Fake `fetch` for the tests: records every call, answers what the test
// decides, and fails loudly on an unexpected URL. No test touches the network.
// -----------------------------------------------------------------------------

import { setFetch } from '../../src/http.js';

setFetch(async (url) => {
  throw new Error(`Network call without a fake fetch in a test: ${url}`);
});

export const text = (body, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain' } });

/** Install a fake fetch answering `handler({ url, init, body })`. */
export function installFetch(handler) {
  const calls = [];
  const previous = setFetch(async (url, init = {}) => {
    const call = { url, init, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    return handler(call);
  });
  return { calls, restore: () => setFetch(previous) };
}
