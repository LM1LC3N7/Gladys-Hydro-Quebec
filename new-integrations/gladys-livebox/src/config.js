// -----------------------------------------------------------------------------
// The configuration the user fills (manifest `config_schema`), normalized.
// -----------------------------------------------------------------------------

// Defaults: they MUST match the `default` values of the manifest.
export const DEFAULTS = {
  host: '192.168.1.1',
  username: 'admin',
  poll_frequency: 30,
  track_wired: false,
  watch_calls: true,
};

const number = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

const text = (value, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

export function normalizeConfig(raw = {}) {
  const host = text(raw.host, DEFAULTS.host)
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  return {
    host,
    username: text(raw.username, DEFAULTS.username),
    password: typeof raw.password === 'string' ? raw.password : '',
    pollFrequency: number(raw.poll_frequency, DEFAULTS.poll_frequency, 10, 600),
    trackWired: raw.track_wired === true || raw.track_wired === 'true',
    watchCalls: raw.watch_calls !== false && raw.watch_calls !== 'false',
  };
}
