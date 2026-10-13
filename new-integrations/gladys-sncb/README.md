# gladys-sncb

[Gladys Assistant](https://gladysassistant.com) external integration for the
**Belgian railways (SNCB / NMBS)** through the [iRail](https://docs.irail.be/)
API: next departures per station, delays, cancellations, platform changes,
network disturbances, scene triggers and dashboard widgets. **Unofficial,
not affiliated with SNCB/NMBS or iRail.**

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

## How it works

```
Gladys ⇄ SDK ⇄ src/app.js (SncbApp)
                 ├─ src/irail.js      stations, liveboard, disturbances (api.irail.be/v1)
                 ├─ src/stations.js   resolve typed names / ids, nearest stations (pure)
                 ├─ src/model.js      liveboard -> departures with countdowns (pure)
                 ├─ src/devices.js    devices, params, states (pure)
                 ├─ src/triggers.js   two readings -> scene events (pure)
                 └─ src/widget.js     the two widgets (pure)
```

- **Discovery** offers the stations typed in the configuration (with the
  destination filter and custom name stored as device params) and the
  stations closest to the houses of Gladys (`location: true`), plus the
  network device.
- **Reading**: only the devices the user created are read, one liveboard
  call each, spaced 400 ms apart (iRail asks for at most 3 requests per
  second), every `poll_frequency` seconds; the disturbances every 5
  minutes. States go through `publishChangedStates`.
- **Triggers** come from two consecutive readings of the same train (iRail's
  connection URL identifies it): every threshold crossed fires, the first
  reading fires nothing.

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npx github:GladysAssistant/integration-store .  # store admission checks
```

The fixtures in `test/fixtures/` are real iRail answers recorded on
2026-10-13 (Namur liveboard, disturbances, a few stations).

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release.

## License

Apache-2.0.
