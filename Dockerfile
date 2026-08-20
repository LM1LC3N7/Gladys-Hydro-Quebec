# -----------------------------------------------------------------------------
# Integration image: Node.js (Gladys SDK/plumbing) + Python (the community-
# maintained `hydroqc` library, see bridge/hq_bridge.py) in a single container
# - Gladys only cares that ONE container speaks its protocol, not what runs
# inside it.
#
# Multi-stage: pip, py3-pip's build machinery and the npm dev toolchain only
# ever exist in the builder stages below. The final image ships just the
# built Python venv, node_modules, dumb-init and a bare python3 interpreter -
# no pip, no compiler, no npm - which is both smaller and a smaller attack
# surface (fewer tools available to abuse from inside the container, and
# `--ignore-scripts` on `npm ci` means a compromised/malicious transitive
# dependency never gets to run arbitrary code at install time).
#
# hydroqc's dependencies (aiohttp, python-dateutil, pytz) all ship prebuilt
# musllinux (Alpine) wheels for amd64 AND arm64, so `--only-binary=:all:`
# below never needs a C compiler - confirmed by downloading them directly
# (see the PR description / commit message for the check).
#
# Gladys sandbox constraints ("the sandbox is the defense"):
#   - rootfs mounted READ-ONLY -> never write outside /data
#   - a single writable volume: /data
#   - runs as a non-root user
#   - multi-arch image (linux/amd64 + linux/arm64)
# -----------------------------------------------------------------------------

# ---- Builder: Python deps (hydroqc, pinned in bridge/requirements.txt) ------
FROM node:24-alpine AS python-builder
RUN apk add --no-cache python3 py3-pip
RUN python3 -m venv /opt/venv
COPY bridge/requirements.txt /tmp/requirements.txt
RUN /opt/venv/bin/pip install --no-cache-dir --only-binary=:all: -r /tmp/requirements.txt \
    # pip/setuptools/wheel are build-time only - nothing in bridge/hq_bridge.py
    # ever imports them, so they don't need to ride along into the final image.
    && rm -rf /opt/venv/lib/python3.*/site-packages/pip* \
              /opt/venv/lib/python3.*/site-packages/setuptools* \
              /opt/venv/lib/python3.*/site-packages/wheel* \
              /opt/venv/bin/pip*

# ---- Builder: Node deps -------------------------------------------------------
FROM node:24-alpine AS node-builder
WORKDIR /app
COPY package.json package-lock.json* ./
# --ignore-scripts: none of our dependencies need an install-time build step,
# and this stops a compromised transitive dependency from running arbitrary
# code during `npm ci`.
RUN npm ci --omit=dev --ignore-scripts

# ---- Final runtime -------------------------------------------------------------
FROM node:24-alpine

# dumb-init: correct PID 1 signal handling AND zombie reaping - more important
# here than in a plain Node image, since this container also runs a Python
# child process (bridge/hq_bridge.py) that dumb-init must reap on exit/crash.
# python3: interpreter only (no py3-pip, no compiler) to run the venv below.
RUN apk add --no-cache dumb-init python3

WORKDIR /app
COPY --from=python-builder /opt/venv /opt/venv
COPY --from=node-builder /app/node_modules ./node_modules
COPY package.json ./
COPY index.js ./
COPY src ./src
COPY bridge ./bridge
COPY gladys-assistant-integration.json ./

ENV NODE_ENV=production \
    PYTHON_EXECUTABLE=/opt/venv/bin/python3
VOLUME ["/data"]

USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
