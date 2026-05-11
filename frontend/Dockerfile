# ---------- Stage 1: install deps ----------
# Cache npm install separately from the source code so editing a .tsx
# file doesn't re-trigger a full reinstall.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- Stage 2: build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the JS bundle at build time, so we
# pass it as a build arg here. Default points at the compose service name
# (we'll set ARG via docker-compose later).
ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:5100
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

RUN npm run build

# ---------- Stage 3: runtime ----------
# Smallest image — only what next/standalone needs to run.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# next.config.ts has output: "standalone", which drops a minimal server.js
# plus a pruned node_modules into .next/standalone. We copy that, and
# also the .next/static (CSS/JS chunks) and public/ folders that the
# standalone server expects to find next to it.
# Copy as the unprivileged 'node' user (UID 1000) baked into the official image.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node

EXPOSE 3000
CMD ["node", "server.js"]
