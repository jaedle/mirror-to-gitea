#!/usr/bin/env sh

set -e

# Get custom delay, else use 3600 seconds
DELAY="${DELAY:-3600}"

while true
do
  echo "Starting to create mirrors..."
  node /app/src/index.js

  echo "Waiting for ${DELAY} seconds..."
  sleep "${DELAY}"
done
