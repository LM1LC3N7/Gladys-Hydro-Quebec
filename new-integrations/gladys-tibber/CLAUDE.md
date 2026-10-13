# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors.

## What this is

A Gladys Assistant **external integration** of type `device`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through `@gladysassistant/integration-sdk` (v0.15). It
reads a **Tibber** account (GraphQL API, personal access token): prices and
levels, consumption, the live measurements of a Pulse over a websocket, and
offers a delegated energy contract. Unofficial: not affiliated with Tibber.
Sibling of `gladys-nord-pool` (same price model, same scene vocabulary).

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
src/app.js          TibberApp: discovery, prices + tick, tomorrow, consumption,
                    live, scene actions, widgets, delegated pricing
src/tibber/api.js   the GraphQL queries (QUERIES) and client
src/tibber/live.js  graphql-transport-ws client, reconnection
src/tibber/model.js prices -> slots / stats / cheap hours, consumption, live (pure)
src/devices.js      the home device, feature keys, states (pure)
src/triggers.js     transitions -> scene events (pure)
src/scenes.js       scene action outputs (pure)
src/energy.js       interval costs from hourly prices (pure)
src/widget.js       the "prices" and "live" widgets (pure)
src/config.js       config_schema normalized
src/constants.js    endpoints, pacing, thresholds, manifest keys
src/i18n.js         runtime texts (en/fr)
src/http.js         the only HTTP access (GraphQL POST, timeout, errors)
test/fixtures/      Tibber answers shaped after the introspected schema
test/helpers/       fake fetch (routed by query), fake socket, fake timers
```

## Rules

- **Unofficial.** Every user-facing surface says "unofficial connector, not
  affiliated with Tibber". Never use the Tibber logo.
- **Keys are forever**: the manifest keys (`src/constants.js`), the feature
  keys (`FEATURE` in `src/devices.js`), the external id shape `home:<id>`
  and the contract template keys (`tibber-no`, `tibber-se`, `tibber-de`,
  `tibber-nl`) are stored in user scenes, dashboards and contracts. Never
  rename them.
- **Prices are per kWh, VAT included** (Tibber's `total`), everywhere.
- **Be polite with Tibber**: prices every hour (tomorrow every 10 minutes
  only after 12:45 and only until published), consumption every hour, live
  states at most every 10 s (`LIVE_THROTTLE`). Never poll faster.
- **Queries live in `QUERIES`** (`src/tibber/api.js`) and were validated
  against the live schema; a new field is checked the same way (the demo
  token on developer.tibber.com validates syntax even without a home).
- **One event per transition** (`src/triggers.js`): the first reading fires
  nothing; tomorrow is announced once per date.
- **Delegated pricing is deterministic**: the same intervals always get the
  same costs (`priceInfoRange` history); a missing hour uses the contract's
  `fallback_price`, never a silent zero.
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
- **Tests never touch the network** (`installFetch` replaces `fetch`, the
  live client takes a socket factory).

## CI and pushes

- Group the commits and push **at most once a day**, unless the maintainer
  explicitly asks otherwise: the GitHub Actions quota is limited.
- If every CI job fails in under 2 seconds, the quota is exhausted: it is
  not a bug in the code.
- The Docker image cannot be built in the Claude Code cloud container (no
  network for `apk` inside `docker build`): the CI builds it.
