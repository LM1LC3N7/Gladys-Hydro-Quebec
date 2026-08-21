// -----------------------------------------------------------------------------
// Integration configuration: credentials + poll frequency.
//
// See `config_schema` in gladys-assistant-integration.json for the fields the
// user fills in. `username`/`password` are declared as `secret` there, so
// Gladys stores them encrypted and only ever gives them back to THIS
// container through `gladys.getConfig()` / `onConfigUpdated`.
// -----------------------------------------------------------------------------

export const DEFAULT_CONFIG = {
  username: '',
  password: '',
  poll_frequency: 3600, // seconds; must match the manifest's default.
  preheat_duration_minutes: 180, // minutes; must match the manifest's default (hydroqc's own default).
};

// Must mirror the `min`/`max` declared for each field in the manifest's
// config_schema. This poll_frequency is entirely our own concept (seconds
// between Hydro-Québec refreshes, driven by our own setInterval in index.js)
// - it is never forwarded to Gladys's `device.poll_frequency`, which is an
// unrelated enum of fixed 1-60s values for fast local devices.
const POLL_FREQUENCY_MIN = 300;
const POLL_FREQUENCY_MAX = 86400;
const PREHEAT_DURATION_MIN = 0;
const PREHEAT_DURATION_MAX = 360;

/**
 * Parse a config value as a number, falling back to `fallback` when it isn't
 * a finite number in [min, max]. Deliberately NOT just `value ?? fallback`:
 * an untouched optional number field on the Configuration screen can come
 * back as `''` (empty string) rather than `null`/`undefined` - `??` lets
 * that through, and `Number('')` is `0`, not NaN, so it would silently pass
 * as "configured" with a useless value instead of falling back.
 */
function toBoundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    poll_frequency: toBoundedNumber(
      raw.poll_frequency,
      DEFAULT_CONFIG.poll_frequency,
      POLL_FREQUENCY_MIN,
      POLL_FREQUENCY_MAX,
    ),
    preheat_duration_minutes: toBoundedNumber(
      raw.preheat_duration_minutes,
      DEFAULT_CONFIG.preheat_duration_minutes,
      PREHEAT_DURATION_MIN,
      PREHEAT_DURATION_MAX,
    ),
  };
}

export function isConfigured(config) {
  return Boolean(config.username && config.password);
}
