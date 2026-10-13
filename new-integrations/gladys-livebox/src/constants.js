// -----------------------------------------------------------------------------
// Constants of the Orange Livebox integration.
// -----------------------------------------------------------------------------

export const USER_AGENT = 'gladys-livebox/0.1 (+https://github.com/LM1LC3N7/gladys-livebox)';
export const HTTP_TIMEOUT = 10_000;

/** The slow-moving data: box information every 10 minutes, the line every 5. */
export const INFO_INTERVAL = 10 * 60_000;
export const LINE_INTERVAL = 5 * 60_000;

/** Manifest keys (forever: stored in user scenes and dashboards). */
export const ACTIONS = { TEST: 'test_connection', REBOOT: 'reboot' };
export const SCENE_ACTIONS = { DEVICES: 'get_devices', REBOOT: 'reboot', WIFI: 'set_wifi' };
export const SCENE_TRIGGERS = {
  CONNECTED: 'device_connected',
  DISCONNECTED: 'device_disconnected',
  MISSED_CALL: 'missed_call',
  INTERNET: 'internet_changed',
};
export const WIDGETS = { NETWORK: 'network', DEVICES: 'devices' };

/** The Devices expressions of the Livebox datamodel (as the web UI uses them). */
export const DEVICE_EXPRESSIONS = {
  wifi: 'wifi && (edev || hnid || wifi_bridge) and .PhysAddress!=""',
  eth: 'eth && (edev || hnid) and .PhysAddress!=""',
};
