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

export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    poll_frequency: Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency),
    preheat_duration_minutes: Number(raw.preheat_duration_minutes ?? DEFAULT_CONFIG.preheat_duration_minutes),
  };
}

export function isConfigured(config) {
  return Boolean(config.username && config.password);
}
