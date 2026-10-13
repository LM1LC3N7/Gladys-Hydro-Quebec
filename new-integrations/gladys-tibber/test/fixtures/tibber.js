// Tibber answers shaped after the GraphQL schema (introspected 2026-10-13).
// One home in Oslo, hourly prices in NOK on 2026-10-13 and 2026-10-14.
export const HOME_ID = '96a14971-525a-4420-aae9-e5aedaa129ff';
export const TZ = 'Europe/Oslo';

/** 24 hourly Price nodes of a local day (CEST: 22:00Z the day before). */
export function dayPrices(date, prices, { currency = 'NOK' } = {}) {
  const start = Date.parse(`${date}T00:00:00+02:00`);
  return prices.map((total, h) => ({
    total,
    energy: Math.round(total * 0.8 * 10000) / 10000,
    tax: Math.round(total * 0.2 * 10000) / 10000,
    startsAt: new Date(start + h * 3600_000).toISOString(),
    currency,
    level:
      total < 0.6
        ? 'VERY_CHEAP'
        : total < 0.8
          ? 'CHEAP'
          : total < 1.2
            ? 'NORMAL'
            : total < 1.6
              ? 'EXPENSIVE'
              : 'VERY_EXPENSIVE',
  }));
}

export const TODAY = '2026-10-13';
export const TOMORROW = '2026-10-14';
export const TODAY_PRICES = [
  0.55, 0.52, 0.5, 0.49, 0.51, 0.6, 0.9, 1.3, 1.5, 1.2, 1.0, 0.95, 0.9, 0.85, 0.88, 1.0, 1.4, 1.8,
  1.7, 1.3, 1.1, 0.9, 0.7, 0.6,
];
export const TOMORROW_PRICES = TODAY_PRICES.map((p) => Math.round(p * 0.5 * 100) / 100);

/** 12:00 local (10:00Z) on TODAY. */
export const NOW = Date.parse('2026-10-13T10:00:00Z');

export const viewer = (features = { realTimeConsumptionEnabled: true }) => ({
  login: 'jane@example.com',
  name: 'Jane Doe',
  websocketSubscriptionUrl: 'wss://websocket-api.tibber.com/v1-beta/gql/subscriptions',
  homes: [
    {
      id: HOME_ID,
      timeZone: TZ,
      appNickname: 'Hytta',
      type: 'HOUSE',
      address: { address1: 'Kvartsveien 1', postalCode: '0100', city: 'Oslo', country: 'NO' },
      meteringPointData: { priceAreaCode: 'NO1', gridCompany: 'Elvia' },
      features,
      currentSubscription: {
        status: 'running',
        priceInfo: { current: dayPrices(TODAY, TODAY_PRICES)[12] },
      },
    },
  ],
});

export const priceInfo = ({ tomorrow = true } = {}) => ({
  current: dayPrices(TODAY, TODAY_PRICES)[12],
  today: dayPrices(TODAY, TODAY_PRICES),
  tomorrow: tomorrow ? dayPrices(TOMORROW, TOMORROW_PRICES) : [],
});

/** Hourly consumption nodes for the 48 hours before NOW (the last hour is incomplete). */
export const consumption = () => {
  const nodes = [];
  for (let i = 48; i >= 1; i -= 1) {
    const from = NOW - i * 3600_000;
    nodes.push({
      from: new Date(from).toISOString(),
      to: new Date(from + 3600_000).toISOString(),
      consumption: i === 1 ? null : 1.5,
      consumptionUnit: 'kWh',
      cost: i === 1 ? null : 1.2,
      unitPrice: 0.8,
      unitPriceVAT: 0.16,
      currency: 'NOK',
    });
  }
  return nodes;
};

export const measurement = (power = 1234) => ({
  timestamp: '2026-10-13T10:00:02.000+02:00',
  power,
  powerProduction: 0,
  accumulatedConsumption: 12.345,
  accumulatedProduction: 0,
  accumulatedCost: 10.5,
  currency: 'NOK',
  minPower: 200,
  averagePower: 900,
  maxPower: 4200,
  voltagePhase1: 230.1,
  voltagePhase2: 231.5,
  voltagePhase3: 229.9,
  currentL1: 2.1,
  currentL2: 1.4,
  currentL3: 1.9,
  signalStrength: -62,
  lastMeterConsumption: 12345.6,
});
