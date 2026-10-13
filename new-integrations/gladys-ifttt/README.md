# gladys-ifttt

[Gladys Assistant](https://gladysassistant.com) external integration for
**IFTTT**: trigger IFTTT applets from Gladys scenes through the Webhooks
service, and start Gladys scenes from IFTTT through the Gladys Plus webhook
relay. **Unofficial, not affiliated with IFTTT.**

- Scene actions: **Trigger an IFTTT event** (value1..3) and **Trigger an
  IFTTT event (JSON)**.
- Scene trigger: **IFTTT event received** (needs Gladys Plus).
- Dashboard widget: **IFTTT button**.
- Manifest type `provider` (no device), Gladys 5.1 or newer.

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

## How it works

```
Gladys scene ──onSceneAction──▶ src/app.js ──POST──▶ maker.ifttt.com/trigger/<event>/with/key/<key>
IFTTT applet ──POST──▶ Gladys Plus relay ──onWebhook──▶ src/inbound.js ──publishSceneEvent──▶ scene
```

`src/ifttt.js` is the Webhooks client (two endpoints, errors with a code),
`src/inbound.js` turns a relayed request (JSON, form or query string) into
the flat data of the `event_received` trigger, `src/app.js` holds the
lifecycle, the widget and the test button. `index.js` only wires the SDK.

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npx github:GladysAssistant/integration-store .  # store admission checks
```

Run it outside Docker against a Gladys instance with the three `GLADYS_*`
variables (see the [developer documentation](https://gladysassistant.com/docs/dev/external-integrations/)).

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release.

## License

Apache-2.0.
