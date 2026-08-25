#!/bin/sh
set -eu

mkdir -p /data

if [ "$(id -u)" -ne 0 ]; then
  echo "[watchdog-hub] ERROR: startup requires root to repair /data ownership" >&2
  exit 1
fi

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    cksum "$1" | awk '{print $1"-"$2}'
  fi
}

cp /usr/src/watchdog/settings.js /data/settings.js

IMAGE_FLOW=/usr/src/watchdog/flows.json
DATA_FLOW=/data/flows.json
VERSION=${WATCHDOG_VERSION:-unknown}
IMAGE_HASH=$(hash_file "$IMAGE_FLOW")

if [ ! -f "$DATA_FLOW" ] || [ "${FORCE_COPY_FLOWS:-false}" = "true" ]; then
  cp "$IMAGE_FLOW" "$DATA_FLOW"
  echo "[watchdog-hub] installed flows.json version=${VERSION} force=${FORCE_COPY_FLOWS:-false}"
else
  DATA_HASH=$(hash_file "$DATA_FLOW")
  if [ "$DATA_HASH" != "$IMAGE_HASH" ]; then
    echo "[watchdog-hub] WARNING: persisted flows.json differs from image ${VERSION}. Import the updated flow or set FORCE_COPY_FLOWS=true"
  else
    echo "[watchdog-hub] preserving existing flows.json (in sync with image ${VERSION})"
  fi
fi

printf 'version=%s\nimage_flow=%s\ndata_flow=%s\nforce_copy_flows=%s\n' \
  "$VERSION" \
  "$IMAGE_HASH" \
  "$(hash_file "$DATA_FLOW")" \
  "${FORCE_COPY_FLOWS:-false}" \
  > /data/.watchdog-deployed-version

mkdir -p /data/uibuilder/watchdog-hub/src
rm -rf /data/uibuilder/watchdog-hub/src
mkdir -p /data/uibuilder/watchdog-hub/src/vendor
cp -R /usr/src/watchdog/uibuilder/watchdog-hub/src/. /data/uibuilder/watchdog-hub/src/
cp /usr/src/node-red/node_modules/vue/dist/vue.global.prod.js \
  /data/uibuilder/watchdog-hub/src/vendor/vue.global.prod.js

chown -R node-red:node-red /data

export WATCHDOG_REGISTRY_PATH="${WATCHDOG_REGISTRY_PATH:-/data/watchdog-registry.sqlite}"
export WATCHDOG_INGEST_PORT="${WATCHDOG_INGEST_PORT:-8091}"
export WATCHDOG_INGEST_BIND="${WATCHDOG_INGEST_BIND:-0.0.0.0}"
export WATCHDOG_INGEST_TOKEN="${WATCHDOG_INGEST_TOKEN:-}"

echo "[watchdog-hub] version=${VERSION} user=${USERNAME:-admin}"
if [ -n "${WATCHDOG_INGEST_TOKEN}" ]; then
  ingest_auth=set
else
  ingest_auth=unset
fi
echo "[watchdog-hub] ingest bind=${WATCHDOG_INGEST_BIND} port=${WATCHDOG_INGEST_PORT} token=${ingest_auth}"

set +e
su -s /bin/sh node-red -c \
  'cd /usr/src/watchdog && exec node runtime/server.js' \
  >> /data/watchdog-ingest.log 2>&1 &
set -e

cd /usr/src/node-red
exec su -s /bin/sh node-red -c \
  'exec /usr/src/node-red/entrypoint.sh npm start --cache /data/.npm -- --userDir /data --settings /data/settings.js'
