# syntax=docker/dockerfile:1
FROM node:24.22.0-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@12.14.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# Build the native driver for this Linux image, never use a host binary.
RUN npm_config_build_from_source=true pnpm install --frozen-lockfile
COPY . .
ENV NX_DAEMON=false
RUN pnpm verify:native && pnpm nx build backend && pnpm prune --prod

FROM node:24.22.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/data/restaurant.sqlite
# Docker initializes an empty named volume from this owned directory.
RUN mkdir /data && chown node:node /data
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist/apps/backend ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/ready',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "main.cjs"]
