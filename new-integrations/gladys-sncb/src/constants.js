// -----------------------------------------------------------------------------
// Constants of the SNCB / NMBS integration.
// -----------------------------------------------------------------------------

/** iRail, the community API over the SNCB data (https://docs.irail.be). */
export const IRAIL_URL = 'https://api.irail.be/v1';

/** iRail asks every client to identify itself. */
export const USER_AGENT = 'gladys-sncb/0.1 (https://github.com/LM1LC3N7/gladys-sncb)';
export const HTTP_TIMEOUT = 15_000;

/** The station list changes a few times a year: keep it a day. */
export const STATIONS_TTL = 24 * 60 * 60_000;
/** The disturbances are read at this pace, whatever the departures pace. */
export const DISTURBANCES_INTERVAL = 5 * 60_000;
/** iRail wants at most 3 requests per second: space the stations. */
export const REQUEST_SPACING = 400;

/** The "minutes before the departure" marks a scene can wait for. */
export const DEPARTURE_THRESHOLDS = [1, 2, 3, 5, 10, 15];
/** The delays (minutes) a scene can wait for. */
export const DELAY_THRESHOLDS = [5, 10, 15, 30];

export const LANGUAGES = ['fr', 'nl', 'en', 'de'];

/** Manifest keys (forever: stored in user scenes and dashboards). */
export const ACTIONS = { TEST: 'test_connection', SEARCH: 'search_stations' };
export const SCENE_ACTIONS = {
  NEXT_DEPARTURES: 'get_next_departures',
  DISTURBANCES: 'get_disturbances',
};
export const SCENE_TRIGGERS = {
  APPROACHING: 'departure_approaching',
  DISRUPTED: 'train_disrupted',
  DISTURBANCE: 'disturbance_published',
};
export const WIDGETS = { DEPARTURES: 'departures', DISTURBANCES: 'disturbances' };

/** Values of the `event` field of the train_disrupted trigger. */
export const DISRUPTION_EVENTS = {
  DELAYED: 'delayed',
  CANCELED: 'canceled',
  PLATFORM: 'platform_changed',
};
