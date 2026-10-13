// -----------------------------------------------------------------------------
// The configuration the user fills (manifest `config_schema`), normalized.
// The tokens live in the same config object under off-schema keys
// (TOKEN_KEYS): they are read here too, never shown in the UI.
// -----------------------------------------------------------------------------

import { TERMINATION, TOKEN_KEYS } from './constants.js';

// Defaults: they MUST match the `default` values of the manifest.
export const DEFAULTS = {
  refresh_interval: 120,
  termination: TERMINATION.NEXT_TIME_BLOCK,
  timer_minutes: 60,
  track_phones: false,
};

const number = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

export function normalizeConfig(raw = {}) {
  const termination = String(raw.termination ?? '');
  return {
    refreshInterval: number(raw.refresh_interval, DEFAULTS.refresh_interval, 60, 3600),
    termination: Object.values(TERMINATION).includes(termination)
      ? termination
      : DEFAULTS.termination,
    timerMinutes: number(raw.timer_minutes, DEFAULTS.timer_minutes, 5, 1440),
    trackPhones: raw.track_phones === true || raw.track_phones === 'true',
    refreshToken: typeof raw[TOKEN_KEYS.REFRESH] === 'string' ? raw[TOKEN_KEYS.REFRESH] : '',
  };
}
