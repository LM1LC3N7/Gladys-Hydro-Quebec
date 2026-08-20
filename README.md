# Gladys Hydro-Québec

External integration for [Gladys Assistant](https://gladysassistant.com) that
connects an Hydro-Québec online account: daily consumption, average outdoor
temperature, account balance, outages, and — for the dynamic rate options —
Winter Credit (CPC) and Flex D (DPC) peak events. One Gladys device is
created per Hydro-Québec **contract** on the account.

This integration is developed independently and is **not supported by
Hydro-Québec**.

## Why this exists

There is a well-established Home Assistant integration for Hydro-Québec
([`hydroqc/hydroqc-ha`](https://github.com/hydroqc/hydroqc-ha)), built on the
Python [`hydroqc`](https://gitlab.com/hydroqc/hydroqc) library. There was no
equivalent for Gladys Assistant, and no JavaScript client for Hydro-Québec's
API either. This repository ports the relevant parts of `hydroqc` (the Azure
AD B2C / PKCE login flow, the consumption/CPC/DPC endpoints, and the peak
calendar reconstruction logic) to JavaScript, on top of Gladys' official
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-template-js).

## Project structure

```
├─ index.js                       # SDK wiring: discovery, polling, config, actions
├─ src/
│  ├─ config.js                   # Config schema defaults/normalization
│  ├─ devices/
│  │  └─ contract.js              # One Gladys device per Hydro-Québec contract
│  └─ hydroquebec/                # Hydro-Québec client (no official/community JS lib exists)
│     ├─ consts.js                # Endpoints + Azure B2C constants (ported from hydroqc)
│     ├─ cookieJar.js             # Minimal per-domain cookie jar (Node fetch has none built-in)
│     ├─ pkce.js                  # PKCE pair + JWT payload decoding
│     ├─ client.js                # HTTP client: login, token refresh, every endpoint call
│     ├─ discovery.js             # Customer/account/contract discovery (flattened)
│     ├─ peaks.js                 # CPC/DPC peak calendar + derived state (anchors, pre-heat...)
│     └─ session.js               # Ties it together; serializes calls on the shared client
├─ docs/{en,fr}.md                # User-facing documentation (required by the Gladys store)
├─ gladys-assistant-integration.json  # Manifest: config_schema, categories, docker image
└─ Dockerfile
```

## Local development

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="gladys-hydro-quebec" \
LOG_LEVEL=debug \
npm start
```

```bash
npm run lint
npm run format:check
npm test
```

## Known limitations / follow-ups

- Hourly consumption and the CSV export endpoints are not wired up yet
  (daily/monthly/annual consumption and the CPC/DPC endpoints are).
- The "average daily cost" feature is the current billing period's average
  $/day (`moyenneDollarsJourPeriode`): Hydro-Québec's free API does not
  expose an exact $ figure per day for the base "D" rate.
- `cover.png` (800×534, ≤150 KB) and a GitHub Actions release workflow
  (multi-arch build to `ghcr.io`, per the
  [integration-template-js](https://github.com/GladysAssistant/integration-template-js)
  publishing flow) still need to be added before this can be submitted to the
  Gladys integration store.
- The Hydro-Québec endpoints, request shapes and Azure B2C flow were ported
  from `hydroqc`'s source as it stood in August 2026; Hydro-Québec can change
  its portal at any time without notice.

## License

Apache-2.0
