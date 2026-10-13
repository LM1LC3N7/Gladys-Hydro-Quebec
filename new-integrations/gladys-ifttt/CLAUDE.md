# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors.

## What this is

A Gladys Assistant **external integration** of type `provider` (no device):
a Node.js service (Node 22+, ESM, no build step) in its own sandboxed Docker
container, talking to Gladys through `@gladysassistant/integration-sdk`
(v0.15). It bridges Gladys scenes and the **IFTTT Webhooks service**: scene
actions trigger applets, an inbound webhook relayed by Gladys Plus fires a
scene trigger, a widget puts a trigger button on the dashboard. Unofficial:
not affiliated with IFTTT.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npm run audit                             # npm audit --omit=dev
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` and `audit` before every commit.

## Architecture

```
index.js            SDK wiring only (handlers registered before connect())
src/app.js          IftttApp: lifecycle, scene actions, inbound, widget, test
src/ifttt.js        the Webhooks client (values and JSON endpoints, errors)
src/inbound.js      relayed request -> scene event data (pure)
src/config.js       config_schema normalized
src/constants.js    endpoint, limits, the manifest keys
src/i18n.js         runtime texts (en/fr)
src/http.js         the only network access (fetch, timeout)
test/helpers/       fake fetch; Gladys is the SDK's fake
```

## Rules

- **Unofficial.** Every user-facing surface says "unofficial connector, not
  affiliated with IFTTT". Never use the IFTTT logo.
- **Keys are forever**: the manifest `config_schema`, `actions`, `widgets`,
  `webhooks`, `scene_triggers` and `scene_actions` keys (`src/constants.js`)
  are stored in user scenes and dashboards. Never rename them.
- **Trigger, not data**: an inbound request only fires a scene event with
  bounded strings (≤ 1000 characters); it never writes a state or the config.
- **Nothing in the background**: no polling, no timer. IFTTT is called only
  on a scene action, a widget tap or the test button.
- **Read-only rootfs**: write nothing on disk.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag.
- **Changelog**: every user-visible change adds a line under
  `## [Unreleased]` in `CHANGELOG.md`.
- **Manifest texts** are `{ en, fr }` objects; the catalog description holds
  10 to 100 characters per language; `test/manifest.test.js` ties the
  manifest to the code.
- **User-facing text** is bilingual, `docs/en.md` and `docs/fr.md` kept in
  sync. Comments explain why, in English.
- **Tests never touch the network** (`installFetch` replaces `fetch`).

## CI and pushes

- Group the commits and push **at most once a day**, unless the maintainer
  explicitly asks otherwise: the GitHub Actions quota is limited.
- If every CI job fails in under 2 seconds, the quota is exhausted: it is
  not a bug in the code.
- The Docker image cannot be built in the Claude Code cloud container (no
  network for `apk` inside `docker build`): the CI builds it.
