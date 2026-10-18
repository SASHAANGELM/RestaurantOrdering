# syntax=docker/dockerfile:1
FROM node:24.22.0-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@12.14.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN npm_config_build_from_source=true pnpm install --frozen-lockfile
COPY . .
ENV NX_DAEMON=false
RUN pnpm nx build frontend

FROM nginx:1.30.0-alpine AS runtime
COPY apps/frontend/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist/apps/frontend/browser /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health
# Run directly: no root startup scripts or environment templating is needed.
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
