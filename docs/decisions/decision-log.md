# Decision log

Newest last. Each entry: the decision, why, and what would change it.

## D-001 — Node.js 22 LTS now, Node 26 later

The brief names Node 26 LTS. The development machine has Node 22.23 and nothing
in Phase 0 needs a newer runtime. `engines` is `>=22.18`. **Revisit** when
production hosting is chosen; moving up should be a version bump only.

## D-002 — TypeScript 6.0, not 7.0

`typescript@latest` is 7.0, but `typescript-eslint` 8.73 supports only `<6.1`.
Linting matters more than the newest compiler, so TypeScript is pinned to `~6.0`.
**Revisit** when typescript-eslint supports 7.

## D-003 — Internal packages are consumed as TypeScript source

Packages export `./src/index.ts`; Vite, Vitest and tsx compile them on the fly.
No per-package build, no stale `dist`. Consequence: all packages share one set
of compiler options, so `noUncheckedIndexedAccess` is off everywhere (the
numeric kernels index typed arrays constantly). **Revisit** if a package is ever published.

## D-004 — Create packages when they have content

The brief suggests `ui`, `lesson-engine`, `content-schema` and `config`
packages. They would be empty in Phase 0, so they are not created yet. The
circuit document model lives in `shared`. **Revisit** in Phase 2 (lessons) and
when a second app needs shared UI components.

## D-005 — Custom dense MNA solver; ngspice as reference only

A TypeScript solver runs in the browser, offline, in microseconds, and its
intermediate values can be explained to students. ngspice (WebAssembly build,
42 MB) is used only in development to generate golden results. **Revisit** the
dense solver if circuits exceed a few hundred nodes.

## D-006 — Wires are 10 mΩ resistors, not merged nodes

Costs a few extra unknowns; gives the current in every wire, which drives the
flow animation and later the ammeter. Error versus ideal wires is below 0.01 %
for school circuits.

## D-007 — Batteries have 0.5 Ω internal resistance

Makes a short circuit a solvable, explainable event instead of a singular
matrix, and lets the terminal voltage sag realistically. The hand-calculated
LED current differs by about 0.2 %. **Revisit** with per-chemistry values in Phase 1.

## D-008 — Floating sub-circuits are grounded at one node

The first implementation added a tiny conductance from every node to ground.
That made an unconnected LED read about 0.68 V — a number invented by the
solver. It was replaced by anchoring each isolated group of nodes once, which
changes no current and gives the physical answer (0 V). Recorded because the
first approach passed every test until the readings were checked by hand.

## D-009 — Editing rules are pure functions over an immutable document

Every edit returns a new document or an error code. The UI cannot construct an
invalid circuit, drags are computed from the document at drag start, and the
rules are tested without a browser. Enables undo/redo later with no redesign.

## D-010 — Compile worker: bubblewrap per job, container in production

Each build runs in its own namespace with no network, no `/home`, no `/etc`, a
read-only toolchain and a clean environment. Tests confirm `#include
"/etc/passwd"` and `.incbin` read nothing. In a container (where nested
namespaces are usually unavailable) the container is the boundary and must be
started read-only, without capabilities and without secrets. The worker refuses
to start if the configured sandbox does not work. **Revisit**: add CPU and
memory limits per job (cgroups or `prlimit`) before public exposure.

## D-011 — Phase 0 compiles plain avr-libc C, not Arduino sketches

ArduinoCore-avr is not installed locally and adding it (core build, `setup` /
`loop` wrapper, library handling) is Phase 1 scope. The proof of concept shows
the whole path — source → sandbox → HEX → emulator — with plain C.

## D-012 — Local storage is the source of truth until accounts exist

Projects live in IndexedDB (Dexie). There is no project API yet because there
is no authentication, and an unauthenticated write API would be a liability.
`project_versions` is designed for append-only sync in Phase 2.

## D-013 — Unit symbols stay international; digits follow the language

"২১.৮ mA", not "২১.৮ মিলিঅ্যাম্পিয়ার": symbols match what is printed on real
meters and parts. **Revisit** after teacher feedback in the pilot.

## D-014 — The unauthenticated compile endpoint is localhost-only

Rate limiting alone is not enough protection for a public CPU-heavy endpoint.
Until Phase 2 adds accounts and per-school quotas, the API binds to 127.0.0.1
and must not be deployed.

## D-015 — Playwright pinned to 1.65.0

Matches the Chromium build already cached on the development machine. Any
later version works after `playwright install chromium`.
