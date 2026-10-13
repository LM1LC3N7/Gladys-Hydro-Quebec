// -----------------------------------------------------------------------------
// Fake `fetch` playing a Livebox: the login (GET / sets a cookie, POST /ws
// createContext answers a context id) and the sysbus calls, routed by
// "<service>.<method>". No test touches the network.
// -----------------------------------------------------------------------------

import { setFetch } from '../../src/http.js';

setFetch(async (url) => {
  throw new Error(`Network call without a fake fetch in a test: ${url}`);
});

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/x-sah-ws-1-call+json', ...headers },
  });

/**
 * Install a fake Livebox. `routes` maps "Service.method" to a handler
 * (parameters, call) -> the `result` object ({ status } or { data }).
 * Options: `password` (the accepted one), `contextLife` (calls before the
 * context expires, Infinity by default).
 */
export function installLivebox(routes, { password = 'secret', contextLife = Infinity } = {}) {
  const calls = [];
  let contexts = 0;
  let served = 0;
  const previous = setFetch(async (url, init = {}) => {
    const call = {
      url,
      method: init.method ?? 'GET',
      headers: init.headers ?? {},
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    if (call.method === 'GET') {
      return new Response('<html></html>', {
        status: 200,
        headers: { 'set-cookie': 'sessid=abc; Path=/', 'content-type': 'text/html' },
      });
    }
    const { service, method, parameters } = call.body;
    if (service === 'sah.Device.Information' && method === 'createContext') {
      if (parameters.password !== password) {
        return json(
          { result: { errors: [{ error: 196639, description: 'Permission denied' }] } },
          401,
        );
      }
      contexts += 1;
      served = 0;
      return json({
        status: 0,
        data: { contextID: `ctx${contexts}`, username: parameters.username, groups: 'http,admin' },
      });
    }
    if (call.headers['X-Context'] !== `ctx${contexts}` || served >= contextLife) {
      return json({
        result: {
          errors: [{ error: 13, description: 'Permission denied', info: `${service}.${method}` }],
        },
      });
    }
    served += 1;
    const handler = routes[`${service}.${method}`];
    if (!handler) {
      throw new Error(`Unexpected Livebox call in a test: ${service}.${method}`);
    }
    return json({ result: handler(parameters, call) });
  });
  return {
    calls,
    restore: () => setFetch(previous),
    get contexts() {
      return contexts;
    },
  };
}
