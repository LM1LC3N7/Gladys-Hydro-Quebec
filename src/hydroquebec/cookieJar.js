// -----------------------------------------------------------------------------
// Minimal cookie jar.
//
// Node's global `fetch` has NO built-in cookie store (unlike a browser), and
// the Hydro-Québec login flow spans several hosts (connexion.solutions...,
// session.hydroquebec.com, services-cl.solutions...) with cookies that must
// survive manual redirect handling. This jar tracks cookies per declared
// `Domain` (falling back to the response host) and applies RFC 6265 "domain
// matching" (exact host, or a suffix of a domain-scoped cookie) when building
// the `Cookie` header for a given request URL. It intentionally ignores
// `Path`, `Secure` and `Expires`: every host involved here is HTTPS-only and
// the jar is cleared explicitly by the client when a new session must start
// (mirroring hydroqc's own aiohttp.CookieJar.clear() calls).
// -----------------------------------------------------------------------------

function parseSetCookie(rawCookie, requestHost) {
  const parts = rawCookie.split(';').map((part) => part.trim());
  const [nameValue, ...attributes] = parts;
  const eqIndex = nameValue.indexOf('=');
  if (eqIndex === -1) return null;
  const name = nameValue.slice(0, eqIndex).trim();
  const value = nameValue.slice(eqIndex + 1).trim();

  let domain = requestHost;
  for (const attribute of attributes) {
    const [rawKey, ...rest] = attribute.split('=');
    if (rawKey.trim().toLowerCase() === 'domain' && rest.length > 0) {
      domain = rest.join('=').trim().replace(/^\./, '');
    }
  }
  return { name, value, domain };
}

function hostMatchesDomain(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

export class CookieJar {
  constructor() {
    // domain -> Map(name -> value)
    this._byDomain = new Map();
  }

  /** Record every `Set-Cookie` header of a response, scoped by its declared domain. */
  extract(url, headers) {
    const requestHost = new URL(url).host;
    const setCookieHeaders = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
    for (const raw of setCookieHeaders) {
      const parsed = parseSetCookie(raw, requestHost);
      if (!parsed) continue;
      if (!this._byDomain.has(parsed.domain)) {
        this._byDomain.set(parsed.domain, new Map());
      }
      this._byDomain.get(parsed.domain).set(parsed.name, parsed.value);
    }
  }

  /** Build the `Cookie` header value applicable to `url`, or undefined if none apply. */
  header(url) {
    const host = new URL(url).host;
    const pairs = [];
    for (const [domain, cookies] of this._byDomain.entries()) {
      if (!hostMatchesDomain(host, domain)) continue;
      for (const [name, value] of cookies.entries()) {
        pairs.push(`${name}=${value}`);
      }
    }
    return pairs.length > 0 ? pairs.join('; ') : undefined;
  }

  clear() {
    this._byDomain.clear();
  }
}
