# -----------------------------------------------------------------------------
# Integration image: Node.js (Gladys SDK/plumbing) + Python (the community-
# maintained `hydroqc` library, see bridge/hq_bridge.py) in a single container
# - Gladys only cares that ONE container speaks its protocol, not what runs
# inside it.
#
# Gladys sandbox constraints ("the sandbox is the defense"):
#   - rootfs mounted READ-ONLY -> never write outside /data
#   - a single writable volume: /data
#   - runs as a non-root user
#   - multi-arch image (linux/amd64 + linux/arm64)
# -----------------------------------------------------------------------------

FROM node:24-alpine

RUN apk add --no-cache dumb-init python3 py3-pip

WORKDIR /app

# --- Python side: hydroqc, in its own venv (Alpine's Python is externally
# managed and refuses a bare `pip install`) -----------------------------------
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY bridge/requirements.txt ./bridge/requirements.txt
RUN pip install --no-cache-dir -r bridge/requirements.txt

# --- Node side -----------------------------------------------------------------
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

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
