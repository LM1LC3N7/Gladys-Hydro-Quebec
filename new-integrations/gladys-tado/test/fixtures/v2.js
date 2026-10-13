// tado v2 answers, shaped like my.tado.com (anonymized). The home 1234 has a
// living room (heating, manual overlay), a bedroom (schedule), hot water.
export const me = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  id: 'u1',
  homes: [{ id: 1234, name: 'Maison' }],
};

export const home = {
  id: 1234,
  name: 'Maison',
  dateTimeZone: 'Europe/Paris',
  temperatureUnit: 'CELSIUS',
  generation: 'PRE_LINE_X',
};

export const zones = [
  {
    id: 1,
    name: 'Salon',
    type: 'HEATING',
    devices: [
      {
        deviceType: 'RU02',
        serialNo: 'RU1',
        batteryState: 'NORMAL',
        connectionState: { value: true },
      },
      {
        deviceType: 'VA02',
        serialNo: 'VA1',
        batteryState: 'LOW',
        connectionState: { value: true },
      },
    ],
    openWindowDetection: { supported: true, enabled: true, timeoutInSeconds: 900 },
  },
  {
    id: 2,
    name: 'Chambre',
    type: 'HEATING',
    devices: [
      {
        deviceType: 'VA02',
        serialNo: 'VA2',
        batteryState: 'NORMAL',
        connectionState: { value: true },
      },
    ],
  },
  {
    id: 3,
    name: 'Eau chaude',
    type: 'HOT_WATER',
    devices: [],
  },
];

export const zoneStates = (overrides = {}) => ({
  zoneStates: {
    1: {
      tadoMode: 'HOME',
      setting: { type: 'HEATING', power: 'ON', temperature: { celsius: 21.5, fahrenheit: 70.7 } },
      overlayType: 'MANUAL',
      overlay: {
        type: 'MANUAL',
        setting: { type: 'HEATING', power: 'ON', temperature: { celsius: 21.5 } },
        termination: { type: 'TIMER', typeSkillBasedApp: 'TIMER', expiry: '2026-10-13T15:00:00Z' },
      },
      openWindow: null,
      openWindowDetected: false,
      nextScheduleChange: {
        start: '2026-10-13T21:00:00Z',
        setting: { type: 'HEATING', power: 'ON', temperature: { celsius: 18 } },
      },
      link: { state: 'ONLINE' },
      activityDataPoints: {
        heatingPower: { type: 'PERCENTAGE', percentage: 42.0, timestamp: '2026-10-13T12:00:00Z' },
      },
      sensorDataPoints: {
        insideTemperature: {
          celsius: 20.37,
          fahrenheit: 68.67,
          timestamp: '2026-10-13T12:00:00Z',
          precision: { celsius: 0.1 },
        },
        humidity: { type: 'PERCENTAGE', percentage: 55.3, timestamp: '2026-10-13T12:00:00Z' },
      },
      ...(overrides[1] ?? {}),
    },
    2: {
      tadoMode: 'HOME',
      setting: { type: 'HEATING', power: 'ON', temperature: { celsius: 18 } },
      overlayType: null,
      overlay: null,
      openWindow: null,
      nextScheduleChange: null,
      link: { state: 'ONLINE' },
      activityDataPoints: { heatingPower: { type: 'PERCENTAGE', percentage: 0.0 } },
      sensorDataPoints: {
        insideTemperature: { celsius: 19.0 },
        humidity: { type: 'PERCENTAGE', percentage: 60.0 },
      },
      ...(overrides[2] ?? {}),
    },
    3: {
      tadoMode: 'HOME',
      setting: { type: 'HOT_WATER', power: 'OFF', temperature: null },
      overlayType: null,
      overlay: null,
      link: { state: 'ONLINE' },
      activityDataPoints: {},
      sensorDataPoints: {},
      ...(overrides[3] ?? {}),
    },
  },
});

export const homeState = (presence = 'HOME', presenceLocked = false) => ({
  presence,
  presenceLocked,
});

export const weather = {
  solarIntensity: { type: 'PERCENTAGE', percentage: 61.2 },
  outsideTemperature: { celsius: 12.34, fahrenheit: 54.2 },
  weatherState: { type: 'WEATHER_STATE', value: 'CLOUDY_PARTLY' },
};

export const mobileDevices = [
  {
    id: 11,
    name: 'Phone Jane',
    settings: { geoTrackingEnabled: true },
    location: { stale: false, atHome: true },
  },
  { id: 12, name: 'Tablet', settings: { geoTrackingEnabled: false } },
];

export const tokens = {
  access_token: 'acc1',
  refresh_token: 'ref1',
  expires_in: 599,
  token_type: 'bearer',
};
