# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors.

## What this is

A Gladys Assistant **external integration** of type `device`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through `@gladysassistant/integration-sdk` (v0.15). It
reads the **iRail** API (SNCB / NMBS open data, no key) and turns the
departures of watched stations and the network disturbances into devices,
scene triggers, scene actions and dashboard widgets. Unofficial: not
affiliated with SNCB/NMBS or iRail. Same family as the LM1LC3N7 transit
integrations (STM, RTC, OC Transpo, TTC, TransLink, Calgary, Edmonton).

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
src/app.js          SncbApp: directory, discovery, refresh loop, scene
                    actions, widgets, buttons
src/irail.js        the iRail client
src/stations.js     name/id resolution, nearest stations (pure)
src/model.js        liveboard -> departures, disturbances (pure)
src/devices.js      devices, params (the watch settings), states (pure)
src/triggers.js     transitions -> scene events (pure)
src/widget.js       the two widgets (pure)
src/config.js       config_schema normalized, the `stations` grammar
src/constants.js    endpoint, pacing, thresholds, manifest keys
src/i18n.js         runtime texts (en/fr)
src/http.js         the only network access (fetch, timeout, User-Agent)
test/fixtures/      real iRail answers (2026-10-13)
test/helpers/       fake fetch, fake timers; Gladys is the SDK's fake
```

## Rules

- **Unofficial.** Every user-facing surface says "unofficial connector, not
  affiliated with SNCB/NMBS or iRail". Never use the SNCB logo.
- **Keys are forever**: the manifest keys (`src/constants.js`), the feature
  keys (`FEATURE` in `src/devices.js`) and the external id shapes
  (`station:<irailId>`, `network`) are stored in user scenes and dashboards.
  Never rename them.
- **The watch settings live in the device params** (station id, filters,
  max departures): the poll path reads the device Gladys hands back, never
  the configuration, so a device keeps working after the config changed.
- **Be polite with iRail**: identify with the User-Agent, never more than 3
  requests per second (`REQUEST_SPACING`), 60 s minimum between two reads of
  a station, the disturbances every 5 minutes, the station list once a day.
- **One event per transition** (`src/triggers.js`), keyed by iRail's
  connection URL: a train that just entered the window fires nothing, every
  threshold crossed in one step fires.
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

## Refreshing the fixtures

```bash
UA='gladys-sncb/dev (https://github.com/LM1LC3N7/gladys-sncb)'
curl -sA "$UA" 'https://api.irail.be/v1/liveboard?station=Namur&format=json&lang=fr&alerts=true' | python3 -m json.tool --indent 1 > test/fixtures/liveboard-namur.json
curl -sA "$UA" 'https://api.irail.be/v1/disturbances?format=json&lang=fr' | python3 -m json.tool --indent 1 > test/fixtures/disturbances.json
```

`FIXTURE_NOW` in `test/helpers/fakeFetch.js` is the `timestamp` of the
liveboard; the expected countdowns in the tests follow.
