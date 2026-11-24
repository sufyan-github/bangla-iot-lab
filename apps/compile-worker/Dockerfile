# Compile worker image. The container is the security boundary here
# (COMPILE_SANDBOX=container): it holds the toolchain and nothing else, runs as
# an unprivileged user on a read-only filesystem, and must be started with the
# restrictions shown in infra/docker/compose.dev.yml. Never give it secrets.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc-avr avr-libc binutils-avr git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable

# For ESP32 sketches (experimental): clang for WebAssembly, its C and C++
# libraries, and binaryen. NOT YET BUILT OR TESTED in this image: the versions
# Debian bookworm carries are older than the ones the tests ran with. Without a
# complete toolchain the worker still starts, serves the UNO, and reports
# "esp32": "unavailable" on /health.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      clang-14 lld-14 wasi-libc libc++-14-dev-wasm32 libc++abi-14-dev-wasm32 \
      libclang-rt-14-dev-wasm32 binaryen \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/compile-worker/package.json apps/compile-worker/
COPY packages/board-emulators/package.json packages/board-emulators/
RUN pnpm install --frozen-lockfile --filter @banglalab/compile-worker --prod

COPY apps/compile-worker apps/compile-worker
# The ESP32 board library the sketches are built against.
COPY spikes/esp32-api/include spikes/esp32-api/include
COPY spikes/esp32-api/src spikes/esp32-api/src
COPY spikes/esp32-api/wasm/entry.cpp spikes/esp32-api/wasm/entry.cpp
# Other people's libraries built into sketches for both boards, with their licences.
COPY third_party third_party
# Pinned Arduino core; the script verifies the commit it fetched.
RUN bash apps/compile-worker/scripts/fetch-arduino-core.sh

RUN useradd --system --no-create-home worker && mkdir /cache && chown worker /cache
USER worker
ENV NODE_ENV=production COMPILE_SANDBOX=container COMPILE_WORKER_HOST=0.0.0.0 COMPILE_CACHE_DIR=/cache
EXPOSE 4100
WORKDIR /app/apps/compile-worker
CMD ["node", "--import", "tsx", "src/main.ts"]
