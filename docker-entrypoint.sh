#!/usr/bin/env sh

set -e

ONE_HOUR_DELAY=3600

while true
do
  echo 'Starting to create mirrors'
  node /app/src/index.js

  echo 'Waiting...'
  sleep "${ONE_HOUR_DELAY}"
done
