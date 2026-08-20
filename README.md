# Gladys Hydro-Québec

External integration for [Gladys Assistant](https://gladysassistant.com) that
connects an Hydro-Québec online account: daily consumption, average outdoor
temperature, account balance, outages, and — for the dynamic rate options —
Winter Credit (CPC) and Flex D (DPC) peak events. One Gladys device is
created per Hydro-Québec **contract** on the account (an account can have
several: a primary residence, a rental, a cottage...).

This integration is developed independently and is **not supported by
Hydro-Québec**.

## The idea: an adapter, not a port

A Gladys external integration is just a Docker container that speaks Gladys'
WebSocket/HTTP protocol — Gladys does not care what runs inside it. The
official [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-template-js)
handles that protocol for you in JavaScript/Node.js, but nothing about
Hydro-Québec itself has to be written in JS.

The community already maintains a real Hydro-Québec API client in Python —
[`hydroqc`](https://gitlab.com/hydroqc/hydroqc) (PyPI: `Hydro-Quebec-API-Wrapper`),
the same library [`hydroqc-ha`](https://github.com/hydroqc/hydroqc-ha) (the
Home Assistant integration) is built on. It already implements Hydro-Québec's
login flow (Azure AD B2C + PKCE), contract discovery, consumption figures,
and the full Winter Credit / Flex D peak-calendar math (anchor periods,
pre-heat windows, current state...). None of that is worth re-implementing
by hand in JavaScript — it's fragile, Hydro-Québec-specific, and someone else
already maintains it.

So this repository is a single container that runs **both** runtimes, each
doing the part it's good at:

```
┌─────────────────────────── one Docker container ───────────────────────────┐
│                                                                              │
│   Gladys  ⇄ WebSocket ⇄  Node.js (index.js, @gladysassistant/integration-sdk)│
│                                 │                                           │
│                                 │  one JSON object per line, over           │
│                                 │  the child process's stdin/stdout         │
│                                 ▼                                           │
│                          Python (bridge/hq_bridge.py)                      │
│                                 │                                           │
│                                 │  calls straight into                     │
│                                 ▼                                           │
│                    hydroqc (pip: Hydro-Quebec-API-Wrapper)                 │
│                                 │                                           │
└─────────────────────────────── │ ────────────────────────────────────────┘
                                  ▼
                       Hydro-Québec's own servers
```

- **Node.js owns the Gladys side**: the WebSocket connection, config schema,
  device discovery/polling lifecycle, manifest actions. This is exactly what
  the SDK is for, and it never has to know anything Hydro-Québec-specific.
- **Python owns the Hydro-Québec side**: `bridge/hq_bridge.py` is a thin
  wrapper (~200 lines, see its own docstring) around `hydroqc`'s `WebUser` /
  `Customer` / `Account` / `Contract` classes. It reads one JSON command per
  line on stdin (`login`, `discover`, `poll`) and writes one JSON response
  per line on stdout — nothing more. **All the actual business logic
  (authentication, peak math, contract typing) is `hydroqc`'s, not this
  repo's.**
- `src/hydroquebec/pythonBridge.js` spawns that Python process once and keeps
  it alive for the container's lifetime (re-logging in for every single poll
  would be wasteful, and `hydroqc` already handles its own token refresh);
  `src/hydroquebec/session.js` is the thin translation layer that turns its
  JSON into what the Gladys device blueprint needs.

Because the two sides only talk over stdin/stdout with a tiny hand-rolled
protocol, upgrading `hydroqc` to pick up a Hydro-Québec portal change is a
one-line version bump in `bridge/requirements.txt` — nothing in the Node.js
code has to change.

## Project structure

```
├─ index.js                       # SDK wiring: discovery, polling, config, actions
├─ src/
│  ├─ config.js                   # Config schema defaults/normalization
│  ├─ devices/
│  │  └─ contract.js              # One Gladys device per Hydro-Québec contract
│  └─ hydroquebec/
│     ├─ pythonBridge.js          # Spawns bridge/hq_bridge.py, JSON-line request/response
│     ├─ session.js               # snake_case (Python) -> camelCase (JS) translation
│     └─ discovery.js             # isCpcContract/isDpcContract: pure helpers, no I/O
├─ bridge/
│  ├─ hq_bridge.py                # The actual adapter over `hydroqc` (see its docstring)
│  └─ requirements.txt            # Pinned `Hydro-Quebec-API-Wrapper` version
├─ docs/{en,fr}.md                # User-facing documentation (required by the Gladys store)
├─ gladys-assistant-integration.json  # Manifest: config_schema, categories, docker image
└─ Dockerfile                     # node:24-alpine + a Python venv for hydroqc
```

## The bridge protocol

One JSON object per line, both ways. Node → Python:

```json
{"id": 1, "cmd": "discover", "username": "...", "password": "..."}
{"id": 2, "cmd": "poll", "contract_id": "0123456789"}
```

Python → Node:

```json
{"id": 1, "ok": true, "result": [ { "contract_id": "0123456789", "rate": "D", "rate_option": "CPC", ... } ]}
{"id": 2, "ok": false, "error": "Error Fetching ... - 403"}
```

`discover` walks `hydroqc`'s `WebUser.customers -> .accounts -> .contracts`
tree (each `Contract` already the right subclass — `ContractD`,
`ContractDCPC`, `ContractDPC`...) and flattens it. `poll` reads straight off
already-computed `hydroqc` properties for one contract — `contract.balance`,
`peak_handler.cumulated_credit`, `peak_handler.current_state`,
`contract.critical_called_hours`... — there is no Hydro-Québec-specific
parsing left in this repo, only field renaming.

All three Python↔Node calls are serialized (an `asyncio.Lock` in
`hq_bridge.py`): every contract under one login shares the same underlying
`hydroqc` HTTP client (cookies, the "currently selected contract" on the
portal, token refresh state), so two commands running at once could corrupt
each other's session.

## Image size and attack surface

The `Dockerfile` is a 3-stage build specifically to keep the final image
small and the tools available inside it minimal:

- `python-builder` and `node-builder` each install one side's dependencies
  (`pip`, `py3-pip`'s build machinery, `npm`) — none of that ships in the
  final image, only the results: `/opt/venv` and `node_modules`.
- `hydroqc`'s dependencies (`aiohttp`, `python-dateutil`, `pytz`) all publish
  prebuilt `musllinux` (Alpine-compatible) wheels for both amd64 and arm64,
  so `pip install --only-binary=:all:` never needs a C compiler — no
  `gcc`/`musl-dev` anywhere, even at build time.
- `pip`, `setuptools` and `wheel` are stripped out of the venv right after
  install (build-time only; nothing in `bridge/hq_bridge.py` imports them) —
  about 27 MB off `site-packages`, verified locally.
- `npm ci --omit=dev --ignore-scripts`: no devDependencies, and no
  lifecycle script from a (compromised) transitive dependency gets to run
  arbitrary code at install time — none of ours declare one, so this is free.
- The final stage installs only `dumb-init` (correct PID 1 signal handling
  _and_ zombie reaping — more important here than in a plain Node image,
  since this container also runs a Python child process to reap) and a bare
  `python3` interpreter (no `pip`, no compiler).

**Why not a smaller/alternate JS runtime (Deno, "the Rust one")?** Not
recommended here: the official `@gladysassistant/integration-sdk` is an npm
package whose behavior under Deno's Node-compat layer is untested, and this
integration also `spawn()`s a child process (`node:child_process`) — another
untested surface under Deno. The size/attack-surface win in this image comes
overwhelmingly from Python/npm build-time tooling, not from the JS runtime
itself, so swapping it would add real compatibility risk for little
additional gain. If that trade-off is ever worth revisiting, it's a separate,
deliberate experiment — not a drop-in change.

Two further, more invasive options exist if even less surface is wanted
later: a distroless final stage (no shell/package manager at all — harder to
`docker exec` into for troubleshooting a login issue) or a hardened base like
Chainguard's `cgr.dev/chainguard/node`. Neither is wired up: both are a
bigger departure from the plain `node:*-alpine` base the official
[integration-template-js](https://github.com/GladysAssistant/integration-template-js)
ships, worth doing only as its own deliberate follow-up.

## Local development

Node side:

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="gladys-hydro-quebec" \
LOG_LEVEL=debug \
npm start
```

Python side (needed for the above to actually reach Hydro-Québec — otherwise
`pythonBridge.js` falls back to whatever `python3` resolves to on `$PATH`):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r bridge/requirements.txt
export PYTHON_EXECUTABLE="$(pwd)/.venv/bin/python3"
```

Checks:

```bash
npm run lint
npm run format:check
npm test                                    # Node: protocol/plumbing tests
python -m py_compile bridge/hq_bridge.py    # Python: syntax + import check
```

`npm test` covers the Node-side plumbing only (`PythonBridge`'s request/
response correlation, against a fake bridge process in `test-fixtures/`) —
it deliberately does **not** re-test `hydroqc`'s own login flow or peak math;
that's upstream's job, and upstream already has its own test suite.

### Testing the built image against a real Hydro-Québec account

Standing up a full local Gladys instance just to check "does my login/
contract actually work" is slow. `scripts/debug_bridge.py` skips that: it
builds the image (or reuses it) and speaks the bridge's own protocol
straight to a throwaway container, printing the pretty-printed JSON response
— no Gladys involved.

```bash
export HQ_USERNAME=you@example.com
export HQ_PASSWORD=secret

python3 scripts/debug_bridge.py login              # just check the credentials
python3 scripts/debug_bridge.py discover            # list every contract on the account
python3 scripts/debug_bridge.py poll 0123456789     # one contract's full poll snapshot

# Iterating on bridge/hq_bridge.py itself? Skip the rebuild:
SKIP_BUILD=1 python3 scripts/debug_bridge.py poll 0123456789
```

For quick ad-hoc pokes at the image, an interactive shell is also still
available (deliberately not a distroless image, see "Image size and attack
surface" above):

```bash
docker run --rm -it --entrypoint sh gladys-hydro-quebec:dev
# inside: /opt/venv/bin/python3 -c "import hydroqc; print(hydroqc.__file__)"
```

## Keeping `hydroqc` up to date

`bridge/requirements.txt` pins an exact `Hydro-Quebec-API-Wrapper` version
(reproducible builds; an untested upstream release should never silently
change production behavior). [`.github/dependabot.yml`](.github/dependabot.yml)
opens a PR bumping that pin — and the npm deps, the `node:24-alpine` base
image, and GitHub Actions versions — on a weekly schedule;
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every PR,
including an import-only smoke test of `bridge/hq_bridge.py` against the new
`hydroqc` version (catches a renamed/removed class or property without
needing real Hydro-Québec credentials). Merging that PR and cutting a release
is what actually ships the update.

## Known limitations / follow-ups

- Hourly consumption and the CSV export endpoints (`hydroqc` supports both)
  are not wired up yet — daily/period consumption and the CPC/DPC endpoints
  are.
- The "average daily cost" feature is the current billing period's average
  $/day (`contract.cp_daily_bill_mean`): Hydro-Québec's API does not expose
  an exact $ figure per individual day for the base "D" rate.
- `cover.png` (800×534, ≤150 KB) and a GitHub Actions release workflow
  (multi-arch build to `ghcr.io`, per the
  [integration-template-js](https://github.com/GladysAssistant/integration-template-js)
  publishing flow) still need to be added before this can be submitted to the
  Gladys integration store.
- The Docker build itself (see "Image size and attack surface" above) has not
  been verified end-to-end against a real Docker daemon in this environment —
  wheel availability was checked directly against PyPI, but a real
  `docker build` + a real login should still happen before a first release.
- `hydroqc`'s own disclaimer applies here too: this is a non-official way to
  access Hydro-Québec's data, and it can break whenever Hydro-Québec changes
  its portal.

## License

This repository is Apache-2.0. `bridge/requirements.txt` pulls in `hydroqc`
(`Hydro-Quebec-API-Wrapper`), licensed LGPL-3.0-or-later; it runs as a
separate process communicating over stdin/stdout, not linked into this
repo's own code, so this repo's license is unaffected.
