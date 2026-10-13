// -----------------------------------------------------------------------------
// The configuration the user fills (manifest `config_schema`), normalized.
// -----------------------------------------------------------------------------

// Defaults: they MUST match the `default` values of the manifest.
export const DEFAULTS = {
  cheap_hours: 4,
  live: true,
};

const number = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

export function normalizeConfig(raw = {}) {
  return {
    accessToken: typeof raw.access_token === 'string' ? raw.access_token.trim() : '',
    cheapHours: number(raw.cheap_hours, DEFAULTS.cheap_hours, 1, 12),
    live: raw.live !== false && raw.live !== 'false',
  };
}
