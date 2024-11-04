#!/usr/bin/env sh

set -e

# Get custom delay, else use 3600 seconds
DELAY="${DELAY:-3600}"

while true
do
  echo "Starting to create mirrors..."
  node /app/dist/index.js

  if [ $DELAY -eq 0 ]; then break; fi

  echo "Waiting for ${DELAY} seconds..."
  sleep "${DELAY}"
done
