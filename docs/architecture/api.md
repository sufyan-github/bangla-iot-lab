# API reference (Phase 0)

Base URL in development: `http://127.0.0.1:4000`. JSON in, JSON out.
There are no accounts yet, so the API listens on localhost only.

## `GET /health`

Liveness. `200 {"status":"ok"}`.

## `GET /ready`

Readiness. `200` when PostgreSQL answers, otherwise `503`.

```json
{ "database": "ok", "compiler": "ok" }
```

`compiler` is informational; the lab works without it.

## `POST /v1/compile`

Compiles source for a board. Rate limit: 20 requests per minute per client.

Request:

```json
{ "board": "uno", "language": "arduino", "source": "void setup() { ... } void loop() { ... }" }
```

`language` is `arduino` (a sketch with `setup` and `loop`, built against
ArduinoCore-avr 1.8.8) or `c` (plain avr-libc C).

`source` is 1 to 65 536 characters. Unknown properties are dropped.

Success, `200`:

```json
{
  "ok": true,
  "hex": ":100000...",
  "flashBytes": 234,
  "ramBytes": 8,
  "cached": false,
  "toolchain": "avr-gcc 14.3.0"
}
```

Build failure, also `200` (the request itself was fine):

```json
{
  "ok": false,
  "reason": "compile-error",
  "diagnostics": [{ "line": 2, "column": 3, "severity": "error", "message": "'PORTZ' undeclared" }],
  "cached": false,
  "toolchain": "avr-gcc 14.3.0"
}
```

`reason` is `compile-error`, `program-too-large` or `timeout`.

Errors:

| Status | Body                                                              | Meaning                                             |
| ------ | ----------------------------------------------------------------- | --------------------------------------------------- |
| 400    | `{"error":"bad-request","message":"..."}`                         | Request failed validation                           |
| 429    | rate-limit message                                                | Too many requests                                   |
| 502    | `{"error":"compiler-error"}`                                      | Worker returned an unexpected error                 |
| 503    | `{"error":"compiler-unavailable"}` or `{"error":"compiler-busy"}` | Worker unreachable or queue full (`Retry-After: 5`) |

## Compile worker (internal)

`GET /health` and `POST /compile` with the same body as above. `/health` also
reports `arduino`: `ready`, or `unavailable` when the core has not been fetched. Reachable only
from the API. Configuration:

| Variable                 | Default          | Meaning                                                 |
| ------------------------ | ---------------- | ------------------------------------------------------- |
| `COMPILE_SANDBOX`        | `bwrap`          | `bwrap`, `container`, or `none` (refused in production) |
| `COMPILE_CACHE_DIR`      | `.cache/compile` | Content-addressed build cache                           |
| `COMPILE_TIMEOUT_MS`     | `10000`          | Limit per toolchain command                             |
| `COMPILE_MAX_CONCURRENT` | `2`              | Parallel builds; 20 more may queue                      |
