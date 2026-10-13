// -----------------------------------------------------------------------------
// The station directory: resolve what the user typed, find the stations near
// a house. Pure: works on the list iRail returns.
// -----------------------------------------------------------------------------

/** Lowercase, no accents, no punctuation: "Liège-Guillemins" -> "liege guillemins". */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** A station of the directory, normalized. */
export function stationOf(raw) {
  return {
    id: raw.id,
    name: raw.name,
    standardName: raw.standardname ?? raw.name,
    latitude: Number(raw.locationY),
    longitude: Number(raw.locationX),
  };
}

const ID_PATTERN = /^(?:BE\.NMBS\.)?(\d{9})$/i;

/**
 * The station matching a query: an iRail id, an exact name (any language
 * of the standard name "Brussel-Centraal/Bruxelles-Central"), else the
 * shortest name containing the query. Undefined when nothing matches.
 */
export function findStation(stations, query) {
  const text = String(query ?? '').trim();
  if (!text) {
    return undefined;
  }
  const id = ID_PATTERN.exec(text);
  if (id) {
    return stations.find((s) => s.id === `BE.NMBS.${id[1]}`);
  }
  const wanted = fold(text);
  const names = (s) => [s.name, ...String(s.standardName).split('/')].map(fold);
  const exact = stations.find((s) => names(s).includes(wanted));
  if (exact) {
    return exact;
  }
  return stations
    .filter((s) => names(s).some((n) => n.includes(wanted)))
    .sort((a, b) => a.name.length - b.name.length)[0];
}

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The `count` stations closest to a point, with their distance. */
export function nearestStations(stations, point, count) {
  if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
    return [];
  }
  return stations
    .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
    .map((s) => ({ ...s, distanceKm: distanceKm(point, s) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, count);
}
