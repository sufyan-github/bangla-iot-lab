#!/usr/bin/env bash
# Fetches the official Arduino AVR core (LGPL-2.1) at a pinned release into
# apps/compile-worker/vendor/. It is not committed to this repository.
set -euo pipefail
TAG=1.8.8
COMMIT=86df345b3cf46754a5db38fb983ec2808ce31303
DEST="$(cd "$(dirname "$0")/.." && pwd)/vendor/ArduinoCore-avr"

if [ -f "$DEST/.fetched-$COMMIT" ]; then
  echo "ArduinoCore-avr $TAG already present."
  exit 0
fi
rm -rf "$DEST"
git clone --quiet --depth 1 --branch "$TAG" https://github.com/arduino/ArduinoCore-avr.git "$DEST"
ACTUAL="$(git -C "$DEST" rev-parse HEAD)"
if [ "$ACTUAL" != "$COMMIT" ]; then
  echo "Refusing to use ArduinoCore-avr: expected commit $COMMIT, got $ACTUAL" >&2
  rm -rf "$DEST"
  exit 1
fi
rm -rf "$DEST/.git"
touch "$DEST/.fetched-$COMMIT"
echo "Fetched ArduinoCore-avr $TAG ($COMMIT)."
