# Node-RED 5.0.4 - port hôte 1884 mappé dans docker-compose.yml
FROM nodered/node-red:5.0.4

ARG WATCHDOG_VERSION=1.2.3
ENV NODE_PATH=/usr/src/node-red/node_modules \
    WATCHDOG_VERSION=${WATCHDOG_VERSION}

USER root
RUN if command -v apk >/dev/null 2>&1; then \
      apk add --no-cache curl; \
    else \
      apt-get update \
      && apt-get install -y --no-install-recommends curl \
      && rm -rf /var/lib/apt/lists/*; \
    fi

USER node-red
WORKDIR /usr/src/node-red
RUN npm install --no-save --omit=dev \
      node-red-contrib-uibuilder@7.5.0 \
      vue@3.4.21 \
      bcryptjs@2.4.3

USER root
RUN mkdir -p /usr/src/watchdog/uibuilder/watchdog-hub/src
COPY flows/04_Watchdog_Hub.json /usr/src/watchdog/flows.json
COPY uibuilder/watchdog-hub/src /usr/src/watchdog/uibuilder/watchdog-hub/src
COPY settings.js /usr/src/watchdog/settings.js
COPY start.sh /usr/src/watchdog/start.sh
COPY runtime /usr/src/watchdog/runtime
COPY contracts /usr/src/watchdog/contracts
RUN chmod +x /usr/src/watchdog/start.sh \
    && sed -i 's/\r$//' /usr/src/watchdog/start.sh \
    && chown -R node-red:node-red /usr/src/watchdog

USER root
WORKDIR /usr/src/node-red
EXPOSE 1880 8091
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=5 \
  CMD sh -c 'editor=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:1880/ || true); ui=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:1880/watchdog-hub/ || true); ingest=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8091/healthz || true); ([ "$editor" = "200" ] || [ "$editor" = "401" ]) && ([ "$ui" = "200" ] || [ "$ui" = "401" ]) && [ "$ingest" = "200" ]'

ENTRYPOINT ["/usr/src/watchdog/start.sh"]
