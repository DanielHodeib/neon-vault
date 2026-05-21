#!/bin/sh
set -eu

URL_FILE=".tunnel-last-url.txt"

if [ -f "$URL_FILE" ]; then
  URL=$(cat "$URL_FILE" | tail -n 1)
  if [ -n "$URL" ]; then
    echo "$URL"
    exit 0
  fi
fi

echo "No tunnel URL found yet. Start a tunnel first with npm run tunnel."
exit 1
