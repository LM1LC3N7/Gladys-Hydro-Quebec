// -----------------------------------------------------------------------------
// Constants of the IFTTT integration.
// -----------------------------------------------------------------------------

/** The IFTTT Webhooks service ("Maker") endpoint. */
export const IFTTT_BASE_URL = 'https://maker.ifttt.com';

/** Identifies the integration to IFTTT. */
export const USER_AGENT = 'gladys-ifttt (+https://github.com/LM1LC3N7/gladys-ifttt)';

/** Network timeout of one request to IFTTT, in milliseconds. */
export const HTTP_TIMEOUT = 10_000;

/** An IFTTT event name: letters, digits and underscores, as IFTTT accepts. */
export const EVENT_NAME = /^[A-Za-z0-9_]{1,64}$/;

/** Longest value relayed in a scene event (the core caps strings at 1000). */
export const MAX_VALUE_LENGTH = 1000;

/** Manifest keys (forever: stored in user scenes and dashboards). */
export const ACTIONS = { TEST: 'test_connection' };
export const SCENE_ACTIONS = { TRIGGER: 'trigger_event', TRIGGER_JSON: 'trigger_event_json' };
export const SCENE_TRIGGERS = { RECEIVED: 'event_received' };
export const WEBHOOKS = { INBOUND: 'inbound' };
export const WIDGETS = { BUTTON: 'button' };
