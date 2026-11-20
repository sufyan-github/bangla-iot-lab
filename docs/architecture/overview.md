# Architecture overview

## Components

```mermaid
flowchart LR
  subgraph Device["Student device (browser / installed PWA)"]
    UI["apps/web<br/>React UI"]
    Store["Zustand lab store"]
    SimW["Web Worker<br/>packages/simulation"]
    UnoW["Web Worker<br/>packages/board-emulators"]
    IDB[("IndexedDB<br/>projects")]
    SW["Service worker<br/>precached app shell"]
  end
  subgraph Server["Server (only needed for compiling today)"]
    API["apps/api<br/>Fastify"]
    CW["apps/compile-worker<br/>avr-gcc in a sandbox"]
    PG[("PostgreSQL 18")]
    Cache[("Build cache<br/>content-addressed")]
  end
  UI <--> Store
  Store -- circuit document --> SimW
  SimW -- readings + diagnostics --> Store
  Store -- autosave --> IDB
  UI -- firmware hex --> UnoW
  UnoW -- pin + serial events --> UI
  UI -- "POST /v1/compile" --> API
  API -- validated request --> CW
  CW <--> Cache
  API --- PG
  SW -. serves app offline .-> UI
```

## Layering rules

| Layer        | Package               | May depend on              | Must not know about                        |
| ------------ | --------------------- | -------------------------- | ------------------------------------------ |
| Numerics     | `circuit-engine`      | nothing                    | breadboards, parts, UI                     |
| Domain model | `shared`              | typebox                    | simulation, UI, server                     |
| Simulation   | `simulation`          | `circuit-engine`, `shared` | UI, storage, network                       |
| Emulation    | `board-emulators`     | avr8js                     | UI, circuits (until Phase 1 co-simulation) |
| Text         | `i18n`                | nothing                    | UI framework                               |
| UI           | `apps/web`            | all packages               | database                                   |
| API          | `apps/api`            | —                          | simulation internals                       |
| Compiler     | `apps/compile-worker` | —                          | database, secrets                          |

ESLint enforces the first rows: nothing under `packages/` may import React,
Fastify, Drizzle or Dexie. Packages are consumed as TypeScript source (no
per-package build step), which keeps the edit–run loop instant.

## Data flow: editing and running a circuit

```mermaid
sequenceDiagram
  actor S as Student
  participant C as Canvas
  participant L as Lab store
  participant E as shared/editing
  participant W as Simulation worker
  participant D as IndexedDB
  S->>C: tap hole / drag lead
  C->>L: tapEndpoint / replaceCircuit
  L->>E: placePart / addWire / movePin
  E-->>L: new document, or reason refused
  L-->>C: re-render (or show notice)
  L->>D: autosave after 400 ms (flush on page hide)
  alt circuit is running
    L->>W: simulate(document)
    W-->>L: readings, wire currents, diagnostics
    L-->>C: LED glow, current animation, meter, messages
  end
```

The document is immutable: every edit returns a new document or an error code,
so the editor can never hold an invalid circuit and every rule is unit-tested
without a browser.

## Data flow: compile and run

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as API
  participant K as Compile worker
  participant X as bubblewrap sandbox
  B->>A: POST /v1/compile {board, language, source}
  A->>A: schema validation, rate limit
  A->>K: forward
  K->>K: cache lookup by SHA-256(toolchain, flags, source)
  alt cache miss
    K->>X: avr-gcc, avr-size, avr-objcopy (no network, no /home, no /etc, 10 s limit)
    X-->>K: Intel HEX or diagnostics
    K->>K: write cache entry atomically
  end
  K-->>A: result
  A-->>B: result
  B->>B: load HEX into the UNO emulator worker
```

## Offline behaviour

| Works offline                           | Needs the server                         |
| --------------------------------------- | ---------------------------------------- |
| Opening the app (after the first visit) | Compiling edited source                  |
| Building, running and saving circuits   | (later) sync, classes, AI tutor, gallery |
| Reopening saved projects                |                                          |
| Running the built-in UNO firmware       |                                          |

The UI states this where it matters: the compile button is disabled while
offline with an explanation, and a banner confirms that work is being saved locally.

## Deployment shape (planned, not built)

Static web bundle on a CDN; one API container and N compile-worker containers
behind it; managed PostgreSQL; S3-compatible storage for lesson content. No
orchestration beyond container restart policies in the initial release.
