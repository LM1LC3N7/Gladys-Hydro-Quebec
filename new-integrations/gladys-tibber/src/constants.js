// -----------------------------------------------------------------------------
// Constants of the Tibber integration.
// -----------------------------------------------------------------------------

/** The Tibber GraphQL API (https://developer.tibber.com). */
export const TIBBER_API_URL = 'https://api.tibber.com/v1-beta/gql';
/** The real-time subscriptions (also returned by viewer.websocketSubscriptionUrl). */
export const TIBBER_WS_URL = 'wss://websocket-api.tibber.com/v1-beta/gql/subscriptions';
/** Tibber requires an identifiable User-Agent on the websocket. */
export const USER_AGENT = 'gladys-tibber/0.1 (+https://github.com/LM1LC3N7/gladys-tibber)';
export const HTTP_TIMEOUT = 20_000;

/** The prices are read at start and every hour (tomorrow appears around 13:00). */
export const PRICES_INTERVAL = 60 * 60_000;
/** Tomorrow is asked from 12:45 local time, every 10 minutes until published. */
export const TOMORROW_FROM = { hour: 12, minute: 45 };
export const TOMORROW_RETRY = 10 * 60_000;
/** The hourly consumption is read every hour, 48 hours back. */
export const CONSUMPTION_INTERVAL = 60 * 60_000;
export const CONSUMPTION_HOURS = 48;
/** The live measurements are published at most every N milliseconds. */
export const LIVE_THROTTLE = 10_000;
export const LIVE_RECONNECT = { base: 5_000, max: 5 * 60_000 };
/** Power marks (W) a scene can wait for. */
export const POWER_THRESHOLDS = [500, 1000, 2000, 3000, 5000, 8000, 11000];

export const LEVELS = ['VERY_CHEAP', 'CHEAP', 'NORMAL', 'EXPENSIVE', 'VERY_EXPENSIVE'];

/** Manifest keys (forever: stored in user scenes, dashboards and contracts). */
export const ACTIONS = { TEST: 'test_connection' };
export const SCENE_ACTIONS = { GET_PRICE: 'get_price', CHEAPEST_WINDOW: 'cheapest_window' };
export const SCENE_TRIGGERS = {
  CHEAP_STARTED: 'cheap_period_started',
  CHEAP_ENDED: 'cheap_period_ended',
  LEVEL_CHANGED: 'price_level_changed',
  TOMORROW: 'tomorrow_prices_published',
  POWER: 'power_threshold_crossed',
};
export const WIDGETS = { PRICES: 'prices', LIVE: 'live' };
export const CONTRACT_TEMPLATE = 'tibber';
