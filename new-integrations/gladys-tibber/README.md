# gladys-tibber

[Gladys Assistant](https://gladysassistant.com) external integration for
**Tibber**: hourly electricity prices and Tibber's price levels, cheap hours,
consumption and cost, Tibber Pulse / Watty live power, scene triggers and
actions, dashboard widgets and a delegated energy contract. **Unofficial,
not affiliated with Tibber.**

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

## How it works

```
Gladys ⇄ SDK ⇄ src/app.js (TibberApp)
                 ├─ src/tibber/api.js    GraphQL queries (api.tibber.com/v1-beta/gql)
                 ├─ src/tibber/live.js   graphql-transport-ws subscription (Pulse)
                 ├─ src/tibber/model.js  prices -> slots, stats, cheap hours; consumption; live (pure)
                 ├─ src/devices.js       the home device and its states (pure)
                 ├─ src/triggers.js      transitions -> scene events (pure)
                 ├─ src/scenes.js        scene action outputs (pure)
                 ├─ src/energy.js        delegated pricing of 30-minute intervals (pure)
                 └─ src/widget.js        the two widgets (pure)
```

- **Prices**: `priceInfo { current today tomorrow }` at start and every
  hour; tomorrow retried every 10 minutes from 12:45 local time. A tick at
  the end of every slot moves the sensors and fires the transitions.
- **Consumption**: the last 48 hourly nodes every hour; complete hours are
  split in two halves and published with `publishEnergyConsumption`.
- **Live**: one websocket per home with `realTimeConsumptionEnabled`, the
  `liveMeasurement` subscription, states published at most every 10 s,
  reconnection with backoff (5 s to 5 min).
- **Contract**: `pricing_mode: delegated`; `onEnergyPrice` reads
  `priceInfoRange(resolution: HOURLY)` from one hour before the first
  interval and prices each half hour with the hourly `total`; the monthly
  subscription is a `fixed` component the core handles.

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npx github:GladysAssistant/integration-store .  # store admission checks
```

The queries were validated against the live schema with Tibber's demo
token; the fixtures in `test/fixtures/` follow the introspected types.

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release.

## License

Apache-2.0.
