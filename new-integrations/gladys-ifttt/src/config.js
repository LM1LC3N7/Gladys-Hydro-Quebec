// -----------------------------------------------------------------------------
// The configuration the user fills (manifest `config_schema`), normalized:
// the rest of the code never deals with `undefined` or strings from a form.
// -----------------------------------------------------------------------------

const text = (value) => (typeof value === 'string' ? value.trim() : '');

export function normalizeConfig(raw = {}) {
  return {
    /** The IFTTT Webhooks key (https://ifttt.com/maker_webhooks/settings). */
    webhooksKey: text(raw.webhooks_key),
    /** Optional shared secret an inbound request must carry. */
    inboundSecret: text(raw.inbound_secret),
  };
}
