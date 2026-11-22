#!/bin/sh
# Fetches the real ESP32 toolchain the compile worker builds firmware with
# (experimental, for the chip-emulator engine): the compiler, Espressif's
# precompiled ESP-IDF libraries, the partition table tool and esptool.
#
#   apps/compile-worker/scripts/fetch-esp32-toolchain.sh
#
# It uses PlatformIO to fetch one pinned release of its ESP32 platform, which
# pins the packages below, into PlatformIO's own folder (~/.platformio/packages,
# about 1.6 GB). The worker reads them from there, or from ESP32_FIRMWARE_ROOT.
#
#   toolchain-xtensa-esp-elf                 14.2.0+20260121
#   framework-arduinoespressif32-esp32-libs  3.3.12
#   framework-arduinoespressif32             4.30312.261113 (Arduino core 3.3.12)
#   tool-esptool                             2.50400.0 (esptool 5.4.0)
#
# The Arduino core the firmware is built from is not taken from there: it is the
# copy in third_party/arduino-esp32, and a test checks the two are the same.
set -e
PLATFORM="platformio/espressif32 @ 8.0.0"

PIO=${PIO:-pio}
command -v "$PIO" >/dev/null 2>&1 || {
  python3 -m pip install --user --quiet "platformio==6.2.0"
  PIO="$HOME/.local/bin/pio"
}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cat > "$WORK/platformio.ini" <<INI
[env:esp32dev]
platform = $PLATFORM
board = esp32dev
framework = arduino
INI
"$PIO" pkg install -d "$WORK" --silent

PACKAGES="${PLATFORMIO_CORE_DIR:-$HOME/.platformio}/packages"
for package in toolchain-xtensa-esp-elf framework-arduinoespressif32-esp32-libs framework-arduinoespressif32 tool-esptool; do
  [ -d "$PACKAGES/$package" ] || { echo "$package was not installed under $PACKAGES" >&2; exit 1; }
done
echo "ESP32 toolchain is in $PACKAGES"
