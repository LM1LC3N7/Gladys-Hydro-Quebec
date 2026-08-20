#!/usr/bin/env python3
"""Fast local debug loop for the built Docker image, without Gladys.

Talks the bridge's own JSON-line protocol (see bridge/hq_bridge.py) straight
to a throwaway container - the fastest way to check "does my Hydro-Québec
login/contract actually work against the image I just built" without wiring
up a whole Gladys instance first.

Usage:
    HQ_USERNAME=you@example.com HQ_PASSWORD=secret python3 scripts/debug_bridge.py login
    HQ_USERNAME=... HQ_PASSWORD=... python3 scripts/debug_bridge.py discover
    HQ_USERNAME=... HQ_PASSWORD=... python3 scripts/debug_bridge.py poll <contract_id>

Env vars:
    IMAGE        image tag to build/reuse (default: gladys-hydro-quebec:dev)
    SKIP_BUILD=1 reuse the existing image instead of rebuilding (faster once
                 you've already built it and are only iterating on credentials)
    LOG_LEVEL    forwarded into the container (default: debug)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
IMAGE = os.environ.get("IMAGE", "gladys-hydro-quebec:dev")


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in ("login", "discover", "poll"):
        print(f"Usage: {sys.argv[0]} login|discover|poll [contract_id]", file=sys.stderr)
        raise SystemExit(1)
    cmd = sys.argv[1]
    contract_id = sys.argv[2] if len(sys.argv) > 2 else None
    if cmd == "poll" and not contract_id:
        print("poll requires a contract_id - run `discover` first to find one", file=sys.stderr)
        raise SystemExit(1)

    username = os.environ.get("HQ_USERNAME")
    password = os.environ.get("HQ_PASSWORD")
    if not username or not password:
        print("Set HQ_USERNAME and HQ_PASSWORD first", file=sys.stderr)
        raise SystemExit(1)

    if os.environ.get("SKIP_BUILD") != "1":
        try:
            subprocess.run(["docker", "build", "-t", IMAGE, str(REPO_ROOT)], check=True)
        except (subprocess.CalledProcessError, FileNotFoundError) as exc:
            print(f"docker build failed: {exc}", file=sys.stderr)
            raise SystemExit(1) from None

    requests: list[dict[str, object]] = []
    if cmd == "poll":
        # `poll` reads from the bridge's in-memory contract cache, populated
        # by `discover` - both must run in the SAME process/container.
        requests.append({"id": 1, "cmd": "discover", "username": username, "password": password})
        requests.append({"id": 2, "cmd": "poll", "contract_id": contract_id})
    else:
        requests.append({"id": 1, "cmd": cmd, "username": username, "password": password})

    stdin_payload = "".join(json.dumps(r) + "\n" for r in requests)

    proc = subprocess.run(
        [
            "docker",
            "run",
            "--rm",
            "-i",
            "-e",
            f"LOG_LEVEL={os.environ.get('LOG_LEVEL', 'debug')}",
            "--entrypoint",
            "/opt/venv/bin/python3",
            IMAGE,
            "bridge/hq_bridge.py",
        ],
        input=stdin_payload,
        text=True,
        capture_output=True,
    )
    print(proc.stderr, file=sys.stderr, end="")
    for line in proc.stdout.splitlines():
        try:
            print(json.dumps(json.loads(line), indent=2, ensure_ascii=False))
        except json.JSONDecodeError:
            print(line)
    raise SystemExit(proc.returncode)


if __name__ == "__main__":
    main()
