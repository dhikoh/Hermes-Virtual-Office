# Hermes3D - 3D agent visualization for Hermes.
# Multi-stage build: install prod deps -> build Next.js -> run with custom server.
#
# Node 22 is required: the runner ships next.config.ts without the `typescript`
# devDependency, so Next auto-installs it at startup, which pulls in transitive
# deps (e.g. camera-controls) that require Node >=22. On Node 20 that install
# fails and the app crash-loops before ever binding to a port.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev

FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time gateway URL (overridden at runtime by HERMES3D_GATEWAY_URL).
ENV NEXT_PUBLIC_GATEWAY_URL=ws://127.0.0.1:18789
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install runtime libraries for Firefox / Camoufox anti-detect headless & virtual browser execution
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    xvfb \
    libgtk-3-0 \
    libasound2 \
    libx11-xcb1 \
    libdbus-glib-1-2 \
    libxtst6 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxfixes3 \
    libpango-1.0-0 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    && rm -rf /var/lib/apt/lists/*

# Links images to the repository on GHCR, so packages created by a push
# automatically grant this repo's workflows access and show up on the repo page.
LABEL org.opencontainers.image.source="https://github.com/dhikoh/Hermes-Virtual-Office"
LABEL org.opencontainers.image.description="Hermes3D — a 3D workspace for AI agents."
LABEL org.opencontainers.image.licenses="MIT"

# Copy built app + custom server + production node_modules only.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/server ./server
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/scripts ./scripts
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

# Ensure Firefox profile directories exist and pre-fetch Camoufox browser binary (if network reachable)
RUN mkdir -p /root/.camoufox /root/.cache/camoufox && \
    (npx camoufox fetch || true)

EXPOSE 3000

CMD ["node", "server/index.js"]

