// -----------------------------------------------------------------------------
// The configuration the user fills (manifest `config_schema`), normalized.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './constants.js';

// Defaults: they MUST match the `default` values of the manifest.
export const DEFAULTS = {
  nearby_stations: 2,
  stations: '',
  max_departures: 3,
  poll_frequency: 60,
  language: 'fr',
  watch_disturbances: true,
};

const number = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

/**
 * One watched station of the `stations` field: "Namur", "Namur@Dinant|Ciney",
 * "Namur@Dinant:Train du retour", "BE.NMBS.008863008".
 *   { query, filters: ['dinant', 'ciney'], name: 'Train du retour' }
 */
export function parseStationEntry(entry) {
  const text = String(entry ?? '').trim();
  if (!text) {
    return undefined;
  }
  const [head, ...rest] = text.split(':');
  const name = rest.join(':').trim() || undefined;
  const [query, filter] = head.split('@');
  const filters = String(filter ?? '')
    .split('|')
    .map((f) => f.trim().toLowerCase())
    .filter(Boolean);
  return { query: query.trim(), filters, name };
}

export function normalizeConfig(raw = {}) {
  const language = String(raw.language ?? DEFAULTS.language).toLowerCase();
  return {
    nearbyStations: number(raw.nearby_stations, DEFAULTS.nearby_stations, 0, 5),
    stations: String(raw.stations ?? '')
      .split(',')
      .map(parseStationEntry)
      .filter(Boolean),
    maxDepartures: number(raw.max_departures, DEFAULTS.max_departures, 1, 5),
    pollFrequency: number(raw.poll_frequency, DEFAULTS.poll_frequency, 30, 600),
    language: LANGUAGES.includes(language) ? language : DEFAULTS.language,
    watchDisturbances: raw.watch_disturbances !== false && raw.watch_disturbances !== 'false',
  };
}
