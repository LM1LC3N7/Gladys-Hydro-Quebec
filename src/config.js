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
};

export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    poll_frequency: Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency),
  };
}

export function isConfigured(config) {
  return Boolean(config.username && config.password);
}
