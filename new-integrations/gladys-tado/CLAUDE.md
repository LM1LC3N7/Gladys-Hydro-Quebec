# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors.

## What this is

A Gladys Assistant **external integration** of type `device`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through `@gladysassistant/integration-sdk` (v0.15). It
connects a **tado°** account (device-code sign-in) and exposes the homes,
zones (heating, hot water, air conditioning) and tado X rooms as Gladys
devices, with scene triggers, scene actions and two dashboard widgets.
Unofficial: not affiliated with tado.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
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
src/app.js          TadoApp: linking, discovery, refresh loop, commands,
                    scene actions, widgets, buttons
src/tado/auth.js    device-code flow, refresh, TokenManager
src/tado/api.js     REST client (v2 + hops), one retry on 401
src/tado/model.js   tado JSON -> plain zones / presence / weather (pure)
src/devices.js      Gladys devices, feature keys, states (pure)
src/commands.js     Gladys command -> tado overlay / resume / presence (pure)
src/triggers.js     transitions -> scene events (pure)
src/widget.js       the "home" and "zone" widgets (pure)
src/config.js       config_schema normalized (+ the off-schema token key)
src/constants.js    endpoints, limits, manifest keys, Gladys enums
src/i18n.js         runtime texts (en/fr)
src/http.js         the only network access (fetch, timeout)
test/fixtures/      tado answers (v2 and X), anonymized
test/helpers/       fake fetch, fake timers; Gladys is the SDK's fake
```

## Rules

- **Unofficial.** Every user-facing surface says "unofficial connector, not
  affiliated with tado". Never use the tado logo.
- **Keys are forever**: the manifest keys (`src/constants.js`), the feature
  keys (`FEATURE` in `src/devices.js`) and the external id shapes
  (`home:`, `zone:`, `phone:`) are stored in user scenes and dashboards.
  Never rename them.
- **No password**: the only credential is the refresh token tado hands out,
  stored through `setConfig` under `TOKEN_KEYS.REFRESH` (off-schema). A
  config update that only rotated the token must not restart the app
  (`configFingerprint`).
- **Be polite with tado**: never read faster than once a minute per home;
  the weather every 15 minutes, the zone list every hour. A command re-reads
  its home once.
- **One event per transition** (`src/triggers.js`): the first reading fires
  nothing.
- **tado X is blind**: the hops mapping comes from public documentation; keep
  it isolated in `zoneFromX` / the hops methods so a field name can be fixed
  from a user report without touching the rest.
- **Read-only rootfs**: write nothing on disk; the token lives in Gladys.
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
