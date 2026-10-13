// -----------------------------------------------------------------------------
// An iRail liveboard -> the departures of a station, and the disturbances
// -> plain items. Pure: `now` is a parameter (milliseconds).
// -----------------------------------------------------------------------------

import { fold } from './stations.js';

/** One departure of a liveboard. */
export function departureOf(raw, now) {
  const scheduled = Number(raw.time) * 1000;
  const delaySeconds = Number(raw.delay) || 0;
  const expected = scheduled + delaySeconds * 1000;
  return {
    /** iRail's connection URL: stable for one train on one day. */
    id: raw.departureConnection ?? `${raw.vehicle}@${raw.time}`,
    train: raw.vehicleinfo?.shortname ?? raw.vehicle ?? '?',
    type: raw.vehicleinfo?.type ?? null,
    destination: raw.station ?? '?',
    scheduledAt: new Date(scheduled).toISOString(),
    expectedAt: new Date(expected).toISOString(),
    delayMinutes: Math.round(delaySeconds / 60),
    /** Minutes until the expected departure, never negative. */
    minutes: Math.max(0, Math.round((expected - now) / 60_000)),
    platform: raw.platform && raw.platform !== '?' ? String(raw.platform) : null,
    platformChanged: raw.platforminfo?.normal === '0',
    canceled: raw.canceled === '1',
    left: raw.left === '1',
    extra: raw.isExtra === '1',
    occupancy: raw.occupancy?.name ?? null,
    alerts: (raw.alerts?.alert ?? []).map((a) => a.header ?? a.title ?? '').filter(Boolean),
  };
}

/**
 * The departures of a liveboard that still matter: not left, not in the
 * past, matching the destination filters when there are some, up to `max`.
 * Canceled trains are kept (the user wants to know), sorted by expected time.
 */
export function departuresOf(liveboard, { now, filters = [], max = 3 } = {}) {
  const all = (liveboard?.departures?.departure ?? []).map((raw) => departureOf(raw, now));
  const wanted = filters.map(fold).filter(Boolean);
  return all
    .filter((d) => !d.left)
    .filter((d) => Date.parse(d.expectedAt) >= now - 60_000)
    .filter((d) => wanted.length === 0 || wanted.some((w) => fold(d.destination).includes(w)))
    .sort((a, b) => Date.parse(a.expectedAt) - Date.parse(b.expectedAt))
    .slice(0, max);
}

/** The reading of a station: its departures and the counters. */
export function stationReading(liveboard, options) {
  const departures = departuresOf(liveboard, options);
  return {
    stationName: liveboard?.stationinfo?.name ?? liveboard?.station ?? null,
    readAt: new Date(options.now).toISOString(),
    departures,
    delayed: departures.filter((d) => !d.canceled && d.delayMinutes > 0).length,
    canceled: departures.filter((d) => d.canceled).length,
  };
}

/** One disturbance of the network. */
export function disturbanceOf(raw) {
  return {
    id: `${raw.type}:${raw.title}:${raw.timestamp}`,
    title: raw.title ?? '',
    description: (raw.description ?? '').trim(),
    type: raw.type === 'planned' ? 'planned' : 'disturbance',
    link: raw.link && /^https?:/.test(raw.link) ? raw.link.replace(/^http:/, 'https:') : null,
    publishedAt: raw.timestamp ? new Date(Number(raw.timestamp) * 1000).toISOString() : null,
  };
}

export function disturbancesReading(list, now) {
  const items = (list ?? []).map(disturbanceOf);
  return {
    readAt: new Date(now).toISOString(),
    items,
    disturbances: items.filter((d) => d.type === 'disturbance').length,
    planned: items.filter((d) => d.type === 'planned').length,
  };
}

/** A one-line text for a departure: "IC 2514 → Dinant · voie 6 · +3 min". */
export function departureLine(d, language = 'fr') {
  const t = {
    fr: { platform: 'voie', canceled: 'supprimé', changed: 'voie modifiée' },
    nl: { platform: 'spoor', canceled: 'afgeschaft', changed: 'spoor gewijzigd' },
    en: { platform: 'platform', canceled: 'canceled', changed: 'platform changed' },
    de: { platform: 'Gleis', canceled: 'ausgefallen', changed: 'Gleis geändert' },
  }[language] ?? { platform: 'platform', canceled: 'canceled', changed: 'platform changed' };
  const parts = [`${d.train} → ${d.destination}`];
  if (d.canceled) {
    parts.push(t.canceled);
  } else {
    if (d.platform) {
      parts.push(`${t.platform} ${d.platform}${d.platformChanged ? ` (${t.changed})` : ''}`);
    }
    if (d.delayMinutes > 0) {
      parts.push(`+${d.delayMinutes} min`);
    }
  }
  return parts.join(' · ');
}
