# gladys-livebox

[Gladys Assistant](https://gladysassistant.com) external integration for the
**Orange Livebox** (3 to 7): Wi-Fi presence of your devices, internet link
state and rates, Wi-Fi and guest Wi-Fi switches, missed calls, scene
triggers and dashboard widgets. Local, no cloud. **Unofficial, not
affiliated with Orange.**

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

## How it works

```
Gladys ⇄ SDK ⇄ src/app.js (LiveboxApp)
                 ├─ src/livebox/client.js  the "sysbus" API of http://<livebox>/ws
                 ├─ src/livebox/model.js   hosts, WAN, info, DSL line, calls (pure)
                 ├─ src/devices.js         the box and host devices, states (pure)
                 ├─ src/triggers.js        transitions -> scene events (pure)
                 └─ src/widget.js          the two widgets (pure)
```

- **Session**: `sah.Device.Information createContext` with the
  `X-Sah-Login` authorization (after a GET of the home page for the
  cookies) gives a context id, sent as `X-Context` on every call; an answer
  with `result.errors` means the context expired: one re-login and retry.
- **Calls**: `Devices get` (the web UI's `wifi` / `eth` expressions),
  `NMC getWANStatus`, `NMC.Wifi get/set`, `NMC.Guest get/set`,
  `VoiceService.VoiceApplication getCallList`, `DeviceInfo get`,
  `NeMo.Intf.data getMIBs` (DSL), `NMC reboot`. The same calls the
  Home Assistant integration and the `sysbus` tool use.
- **Presence**: a host device per MAC address; the `Active` flag of the box
  is the presence, with its own timeouts. States go through
  `publishChangedStates`, the first reading fires no event.

Built **without the hardware**, from the public datamodel: the field names
come from the aiosysbus library and the Home Assistant component. Please
report what differs on your box.

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npx github:GladysAssistant/integration-store .  # store admission checks
```

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release.

## License

Apache-2.0.
