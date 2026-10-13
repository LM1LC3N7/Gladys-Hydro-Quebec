// tado X answers (hops.tado.com), shaped after the public hops API.
export const home = { id: 5678, name: 'Loft', dateTimeZone: 'Europe/Berlin', generation: 'LINE_X' };

export const roomsAndDevices = {
  rooms: [
    {
      roomId: 7,
      roomName: 'Studio',
      devices: [
        {
          serialNumber: 'X1',
          type: 'VA04',
          batteryState: 'NORMAL',
          connection: { state: 'ONLINE' },
        },
      ],
    },
  ],
  otherDevices: [{ serialNumber: 'IB1', type: 'IB02' }],
};

export const rooms = (overrides = {}) => [
  {
    id: 7,
    name: 'Studio',
    sensorDataPoints: { insideTemperature: { value: 22.1 }, humidity: { percentage: 48 } },
    setting: { power: 'ON', temperature: { value: 23 } },
    manualControlTermination: null,
    boostMode: null,
    heatingPower: { percentage: 10 },
    connection: { state: 'ONLINE' },
    openWindow: { activated: false },
    nextScheduleChange: { start: '2026-10-13T20:00:00Z', temperature: { value: 19 } },
    ...overrides,
  },
];
