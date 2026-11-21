#!/usr/bin/env bash
# Fetches what the emulated Raspberry Pi Pico needs, into packages/board-emulators/vendor/:
#   - the official MicroPython firmware for the Pico (MIT licence), and
#   - the RP2040 boot ROM image published with rp2040js (BSD-3-Clause, from
#     https://github.com/raspberrypi/pico-bootrom, revision B1).
# Each download is checked against a pinned SHA-256. Nothing here is committed.
set -euo pipefail
VENDOR="$(cd "$(dirname "$0")/.." && pwd)/vendor"
mkdir -p "$VENDOR"

# fetch <file> <url> <sha256>
fetch() {
  local file="$VENDOR/$1" url="$2" expected="$3"
  if [ ! -f "$file" ] || [ "$(sha256sum "$file" | cut -d' ' -f1)" != "$expected" ]; then
    curl --silent --show-error --location --max-time 120 --output "$file" "$url"
  fi
  local actual
  actual="$(sha256sum "$file" | cut -d' ' -f1)"
  if [ "$actual" != "$expected" ]; then
    echo "Refusing to use $1: expected SHA-256 $expected, got $actual" >&2
    rm -f "$file"
    exit 1
  fi
  echo "$1 ok."
}

fetch micropython-pico.uf2 \
  https://micropython.org/resources/firmware/RPI_PICO-20260824-v1.29.0.uf2 \
  e1160e602e277d85920adb5fe741435edccba9ba6ecadc85fdab75252eeff4e9
fetch bootrom-b1.ts \
  https://raw.githubusercontent.com/wokwi/rp2040js/v1.4.2/demo/bootrom.ts \
  99f8a1f813ce3aa9415884de3fb6c5b962d3c6fa0394b05413ad3c7b3c39ec62

# The boot ROM is published as a list of 32-bit words; store it as plain bytes.
node -e '
  const fs = require("fs");
  const words = fs.readFileSync(process.argv[1], "utf8").match(/0x[0-9a-f]{8}/gi).map(Number);
  fs.writeFileSync(process.argv[2], Buffer.from(Uint32Array.from(words).buffer));
  console.log(`bootrom-b1.bin: ${words.length * 4} bytes.`);
' "$VENDOR/bootrom-b1.ts" "$VENDOR/bootrom-b1.bin"
