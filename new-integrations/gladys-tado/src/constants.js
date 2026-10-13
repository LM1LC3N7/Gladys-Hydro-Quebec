// -----------------------------------------------------------------------------
// Constants of the tado° integration.
// -----------------------------------------------------------------------------

/** OAuth2 device-code flow of tado (public client id of the tado web app). */
export const TADO_AUTH_URL = 'https://login.tado.com/oauth2';
export const TADO_CLIENT_ID = '1bb50063-6b0c-4d11-bd99-387f4a91cc46';
export const TADO_SCOPE = 'offline_access';

/** The classic API (V3+, V3, V2) and the tado X API ("hops"). */
export const TADO_API_URL = 'https://my.tado.com/api/v2';
export const TADO_HOPS_URL = 'https://hops.tado.com';

export const USER_AGENT = 'gladys-tado (+https://github.com/LM1LC3N7/gladys-tado)';
export const HTTP_TIMEOUT = 15_000;

/** An access token lives 10 minutes: refresh it a little before. */
export const TOKEN_MARGIN = 60_000;

/** Refresh pace of the slow-moving data, in milliseconds. */
export const WEATHER_INTERVAL = 15 * 60_000;
export const DEVICES_INTERVAL = 60 * 60_000;

/** Setpoint bounds the API accepts (°C). */
export const TEMPERATURE = { MIN: 5, MAX: 25, STEP: 0.5, HOT_WATER_MIN: 30, HOT_WATER_MAX: 65 };

/** Manifest keys (forever: stored in user scenes and dashboards). */
export const ACTIONS = { TEST: 'test_connection', UNLINK: 'unlink' };
export const CONFIG_KEYS = { ACCOUNT: 'account' };
export const SCENE_ACTIONS = {
  SET_TEMPERATURE: 'set_temperature',
  RESUME_SCHEDULE: 'resume_schedule',
  SET_PRESENCE: 'set_presence',
  GET_ZONE: 'get_zone',
};
export const SCENE_TRIGGERS = {
  PRESENCE_CHANGED: 'presence_changed',
  OPEN_WINDOW: 'open_window_detected',
  LOW_BATTERY: 'low_battery',
  HEATING_CHANGED: 'heating_changed',
};
export const WIDGETS = { HOME: 'home', ZONE: 'zone' };

/** The off-schema config keys holding the tokens (never shown in the UI). */
export const TOKEN_KEYS = { REFRESH: 'tado_refresh_token' };

/** Gladys enums (mirror of server/utils/constants.js). */
export const THERMOSTAT_MODE = { OFF: 0, HEATING: 1, COOLING: 2, AUTO: 3 };
export const THERMOSTAT_OPERATING_STATE = { IDLE: 0, HEATING: 1, COOLING: 2 };
export const WATER_HEATER_MODE = { OFF: 0, AUTO: 1, MANUAL: 4 };
export const AC_MODE = { AUTO: 0, COOLING: 1, HEATING: 2, DRYING: 3, FAN: 4 };
export const OPENING_SENSOR_STATE = { OPEN: 0, CLOSE: 1 };

/** Values of the home "presence" select feature. */
export const PRESENCE = { AUTO: 'auto', HOME: 'home', AWAY: 'away' };

/** How a manual setpoint ends. */
export const TERMINATION = { NEXT_TIME_BLOCK: 'next_time_block', TIMER: 'timer', MANUAL: 'manual' };
