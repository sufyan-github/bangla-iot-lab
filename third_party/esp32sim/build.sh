#!/bin/sh
# Builds the lab's copy of esp32sim (an emulator of the ESP32, MIT) as a
# WebAssembly module, and fetches the chip's start-up code it boots from.
#
#   third_party/esp32sim/build.sh <output folder>
#
# Writes into the output folder:
#   esp32sim.wasm          the emulator, with the lab's additions (lab.rs)
#   esp32_rev300_rom.elf   Espressif's mask ROM for the ESP32 (Apache-2.0)
#   LICENSE-esp32sim.txt   the emulator's licence
#   SOURCE.txt             exactly what was built
#
# Needs git, curl, tar, sha256sum and Rust with the wasm32-unknown-unknown
# target (rustup installs it if it is missing). The emulator has no outside
# dependencies, so the build itself needs no network.
set -e
[ $# -eq 1 ] || { echo "usage: $0 <output folder>" >&2; exit 2; }
mkdir -p "$1"
OUT=$(cd "$1" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)

# The emulator: pinned to a release and to the commit that release was when it was read.
REPOSITORY=https://github.com/mikroverk/esp32sim.git
TAG=v0.4.0
COMMIT=357b0e542dfe97d4c62ec4a15c01c4969164448c
# The ROM: pinned by release and SHA-256, as the emulator's own script pins it.
ROM_RELEASE=20260528
ROM_TARBALL_SHA=caa463d3cbef2430a5a35847c1d9f2f152403b17a802050927ff60c8da54fe46
ROM_FILE=esp32_rev300_rom.elf
ROM_SHA=920b70635440517866aab2230964a570d2cf2b676658d93c52fbac108c1cca31

PATH="$PATH:$HOME/.cargo/bin"
command -v cargo >/dev/null 2>&1 || { echo "Rust is not installed (cargo not found). See https://rustup.rs" >&2; exit 1; }
if command -v rustup >/dev/null 2>&1; then
  rustup target list --installed | grep -q wasm32-unknown-unknown || rustup target add wasm32-unknown-unknown
fi

WORK=${ESP32SIM_WORK:-$(mktemp -d)}
SOURCE="$WORK/esp32sim"
if [ ! -d "$SOURCE/.git" ]; then
  git clone --quiet --depth 1 --branch "$TAG" "$REPOSITORY" "$SOURCE"
fi
[ "$(git -C "$SOURCE" rev-parse HEAD)" = "$COMMIT" ] || {
  echo "esp32sim $TAG is not the commit this script was written for ($COMMIT)" >&2; exit 1; }

# The lab's additions: one file, and its name in the module list.
cp "$HERE/lab.rs" "$SOURCE/wasm/src/lab.rs"
grep -q '^mod lab;$' "$SOURCE/wasm/src/lib.rs" || sed -i 's/^mod machine;$/mod machine;\nmod lab;/' "$SOURCE/wasm/src/lib.rs"
grep -q '^mod lab;$' "$SOURCE/wasm/src/lib.rs" || { echo "could not add the lab's module to wasm/src/lib.rs" >&2; exit 1; }

# The emulator's own build settings (tools/wasm-rustflags.sh at this release).
( cd "$SOURCE" && RUSTFLAGS="-Cllvm-args=-inline-threshold=2000" CARGO_PROFILE_RELEASE_DEBUG=0 \
    CARGO_PROFILE_RELEASE_STRIP=debuginfo \
    cargo build --release --offline --target wasm32-unknown-unknown -p esp32sim-wasm )
cp "$SOURCE/target/wasm32-unknown-unknown/release/esp32sim_wasm.wasm" "$OUT/esp32sim.wasm"
cp "$SOURCE/LICENSE" "$OUT/LICENSE-esp32sim.txt"

if ! echo "$ROM_SHA  $OUT/$ROM_FILE" | sha256sum -c >/dev/null 2>&1; then
  curl -fsSL --retry 5 --retry-delay 5 -o "$WORK/rom.tar.gz" \
    "https://github.com/espressif/esp-rom-elfs/releases/download/$ROM_RELEASE/esp-rom-elfs-$ROM_RELEASE.tar.gz"
  echo "$ROM_TARBALL_SHA  $WORK/rom.tar.gz" | sha256sum -c >/dev/null
  mkdir -p "$WORK/rom" && tar -xzf "$WORK/rom.tar.gz" -C "$WORK/rom"
  found=$(find "$WORK/rom" -name "$ROM_FILE" | head -n 1)
  echo "$ROM_SHA  $found" | sha256sum -c >/dev/null
  cp "$found" "$OUT/$ROM_FILE"
fi

cat > "$OUT/SOURCE.txt" <<TEXT
esp32sim.wasm: $REPOSITORY at $TAG ($COMMIT), MIT,
  with third_party/esp32sim/lab.rs added. Built by third_party/esp32sim/build.sh.
$ROM_FILE: espressif/esp-rom-elfs release $ROM_RELEASE, Apache-2.0, unmodified.
TEXT
ls -la "$OUT"
