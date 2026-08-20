# -----------------------------------------------------------------------------
# Integration image.
#
# Gladys sandbox constraints ("the sandbox is the defense"):
#   - rootfs mounted READ-ONLY -> never write outside /data
#   - a single writable volume: /data
#   - runs as a non-root user
#   - multi-arch image (linux/amd64 + linux/arm64), see .github/workflows/release.yml
# -----------------------------------------------------------------------------

FROM node:24-alpine

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY index.js ./
COPY src ./src
COPY gladys-assistant-integration.json ./

ENV NODE_ENV=production
VOLUME ["/data"]

USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
