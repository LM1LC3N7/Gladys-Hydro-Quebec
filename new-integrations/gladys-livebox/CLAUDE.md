# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors.

## What this is

A Gladys Assistant **external integration** of type `device`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through `@gladysassistant/integration-sdk` (v0.15). It
reads an **Orange Livebox** on the LAN through its "sysbus" API (the one of
http://livebox/): presence of the LAN devices, internet link, Wi-Fi
switches, missed calls. Local only. Unofficial: not affiliated with Orange.

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
index.js               SDK wiring only (handlers registered before connect())
src/app.js             LiveboxApp: session, discovery, refresh loop, commands,
                       scene actions, widgets, buttons
src/livebox/client.js  the sysbus client: login (createContext), calls, retry
src/livebox/model.js   Livebox JSON -> hosts / WAN / info / line / calls (pure)
src/devices.js         the box and host devices, feature keys, states (pure)
src/triggers.js        transitions -> scene events (pure)
src/widget.js          the "network" and "devices" widgets (pure)
src/config.js          config_schema normalized
src/constants.js       pacing, manifest keys, the Devices expressions
src/i18n.js            runtime texts (en/fr)
src/http.js            the only network access (fetch, timeout, no redirects)
test/fixtures/         Livebox answers shaped after the datamodel (anonymized)
test/helpers/          a fake Livebox (login + routed calls), fake timers
```

## Rules

- **Unofficial.** Every user-facing surface says "unofficial connector, not
  affiliated with Orange". Never use the Orange or Livebox logos.
- **Keys are forever**: the manifest keys (`src/constants.js`), the feature
  keys (`FEATURE` in `src/devices.js`) and the external id shapes (`box`,
  `host:<mac without colons>`) are stored in user scenes and dashboards.
  Never rename them.
- **Local only**: the client only ever talks to the configured host over
  HTTP on the LAN; the password is sent to the box and nowhere else.
- **One session**: `createContext` once, `X-Context` on every call, one
  re-login on `result.errors`; never log in on every call (the box keeps a
  limited number of contexts).
- **Be polite with the box**: 30 s between two readings by default, never
  below 10 s; the box information every 10 minutes, the DSL line every 5.
- **One event per transition** (`src/triggers.js`): the first reading fires
  nothing; a call is announced once (by `callId`).
- **Built blind**: the field names come from aiosysbus and the Home
  Assistant component; keep every Livebox-specific name in
  `src/livebox/model.js` and `src/livebox/client.js` so a user report fixes
  one place.
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
- **Tests never touch the network** (`installLivebox` replaces `fetch`).

## CI and pushes

- Group the commits and push **at most once a day**, unless the maintainer
  explicitly asks otherwise: the GitHub Actions quota is limited.
- If every CI job fails in under 2 seconds, the quota is exhausted: it is
  not a bug in the code.
- The Docker image cannot be built in the Claude Code cloud container (no
  network for `apk` inside `docker build`): the CI builds it.
