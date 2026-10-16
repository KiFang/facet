# Facet Hub — сервер клубов вуза. Сборка из корня репозитория:
#   docker build -f hub/Dockerfile -t facet-hub .
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build:hub

FROM node:22-alpine
ARG PB_VERSION=0.40.5
ARG TARGETARCH=amd64
RUN apk add --no-cache ca-certificates tzdata unzip wget \
 && wget -qO /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
 && unzip -q /tmp/pb.zip pocketbase -d /usr/local/bin && rm /tmp/pb.zip && chmod +x /usr/local/bin/pocketbase \
 && apk del unzip wget \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
COPY --from=build /src/hub/server.cjs /src/hub/state.cjs /src/hub/clubs.cjs ./hub/
COPY --from=build /src/hub/web ./hub/web
COPY --from=build /src/hub/dist ./hub/dist
COPY --from=build /src/desktop/local-server.cjs ./desktop/local-server.cjs
ENV HUB_DATA=/data HUB_PORT=8080 HUB_HOST=0.0.0.0 PB_BINARY=/usr/local/bin/pocketbase NODE_ENV=production
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "hub/server.cjs"]
