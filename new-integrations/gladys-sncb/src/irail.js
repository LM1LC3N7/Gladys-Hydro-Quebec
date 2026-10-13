// -----------------------------------------------------------------------------
// The iRail client (https://docs.irail.be): stations, liveboards and
// disturbances, as raw JSON. Turning them into readings is src/model.js's job.
// -----------------------------------------------------------------------------

import { IRAIL_URL } from './constants.js';
import { getJson } from './http.js';

export class IrailClient {
  constructor({ baseUrl = IRAIL_URL, language = 'fr' } = {}) {
    this.baseUrl = baseUrl;
    this.language = language;
  }

  url(path, params) {
    const search = new URLSearchParams({ format: 'json', lang: this.language, ...params });
    return `${this.baseUrl}/${path}?${search}`;
  }

  /** Every station iRail knows: [{ id, name, standardname, locationX, locationY }]. */
  async stations() {
    const answer = await getJson(this.url('stations', {}));
    return answer?.station ?? [];
  }

  /** The departures of a station, by iRail id (BE.NMBS.0088...). */
  async liveboard(stationId) {
    return getJson(this.url('liveboard', { id: stationId, arrdep: 'departure', alerts: 'true' }));
  }

  /** The current disturbances and planned works of the network. */
  async disturbances() {
    const answer = await getJson(this.url('disturbances', { lineBreakCharacter: '\n' }));
    return answer?.disturbance ?? [];
  }
}
