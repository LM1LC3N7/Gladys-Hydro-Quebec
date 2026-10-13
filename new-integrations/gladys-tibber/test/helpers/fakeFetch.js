// -----------------------------------------------------------------------------
// Fake `fetch` for the GraphQL calls: routes by the query's first word
// ("viewer", "prices"...), records every call, fails loudly on an unexpected
// one. No test touches the network.
// -----------------------------------------------------------------------------

import { setFetch } from '../../src/http.js';

setFetch(async (url) => {
  throw new Error(`Network call without a fake fetch in a test: ${url}`);
});

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Which query is it: viewer | prices | consumption | priceRange. */
export function queryName(query) {
  if (query.includes('websocketSubscriptionUrl')) return 'viewer';
  if (query.includes('priceInfoRange')) return 'priceRange';
  if (query.includes('consumption(')) return 'consumption';
  if (query.includes('priceInfo')) return 'prices';
  return 'viewer';
}

/** `routes` maps a query name to handler({ query, variables, headers }) -> Response. */
export function installFetch(routes) {
  const calls = [];
  const previous = setFetch(async (url, init = {}) => {
    const body = JSON.parse(init.body);
    const call = {
      url,
      name: queryName(body.query),
      query: body.query,
      variables: body.variables,
      headers: init.headers,
    };
    calls.push(call);
    const handler = routes[call.name];
    if (!handler) {
      throw new Error(`Unexpected GraphQL call in a test: ${call.name}`);
    }
    return handler(call);
  });
  return { calls, restore: () => setFetch(previous) };
}
