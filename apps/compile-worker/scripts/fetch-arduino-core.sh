#!/usr/bin/env bash
# Fetches the official Arduino AVR core and the libraries sketches may include,
# each at a pinned release, into apps/compile-worker/vendor/. They are LGPL-2.1
# and are not committed to this repository.
set -euo pipefail
VENDOR="$(cd "$(dirname "$0")/.." && pwd)/vendor"

# fetch <directory> <repository> <tag> <expected commit>
fetch() {
  local dest="$VENDOR/$1" repo="$2" tag="$3" commit="$4"
  if [ -f "$dest/.fetched-$commit" ]; then
    echo "$1 $tag already present."
    return
  fi
  rm -rf "$dest"
  git clone --quiet --depth 1 --branch "$tag" "https://github.com/$repo.git" "$dest" 2>/dev/null
  local actual
  actual="$(git -C "$dest" rev-parse HEAD)"
  if [ "$actual" != "$commit" ]; then
    echo "Refusing to use $1: expected commit $commit, got $actual" >&2
    rm -rf "$dest"
    exit 1
  fi
  rm -rf "$dest/.git"
  touch "$dest/.fetched-$commit"
  echo "Fetched $1 $tag ($commit)."
}

fetch ArduinoCore-avr arduino/ArduinoCore-avr 1.8.8 86df345b3cf46754a5db38fb983ec2808ce31303
fetch Servo arduino-libraries/Servo 1.3.0 2862ad9864d0dda5669b264857deafbba624940d
fetch LiquidCrystal arduino-libraries/LiquidCrystal 1.0.7 a89b4d46b28878557670440f2c35385c19307b69
