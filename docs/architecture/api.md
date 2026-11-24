# API reference (Phase 0)

Base URL in development: `http://127.0.0.1:4000`. JSON in, JSON out.
Requests that need an account carry the `bl_session` cookie (send with `credentials: 'include'`). A request that changes anything is refused (`403 wrong-origin`) when its `Origin` is not the lab's own.

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

## Accounts and classes

All bodies are JSON. Errors are `{ "error": "<code>" }`.

| Method and path                                       | Who       | What                                                                                          |
| ----------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------- |
| `POST /v1/auth/sign-up`                               | anyone    | `{email, password, displayName, schoolName, district?}` → `201`, signed in; `409 email-taken` |
| `POST /v1/auth/sign-in`                               | anyone    | `{email, password}` → signed in; `401 wrong-email-or-password`                                |
| `POST /v1/auth/key`                                   | anyone    | `{key}` → a learner signed in; `401 wrong-key`                                                |
| `POST /v1/auth/sign-out`                              | anyone    | ends the session                                                                              |
| `GET /v1/me`                                          | signed in | `{user, schools, classes}`; `401 signed-out`                                                  |
| `POST /v1/classes`                                    | teacher   | `{schoolId, name, grade 6–12, schoolConsent: true}` → `{id, joinCode, joinCodeExpiresAt}`     |
| `GET /v1/classes`                                     | teacher   | the teacher's open classes, with learner counts                                               |
| `POST /v1/classes/:id/join-code`                      | teacher   | a new code; the old one stops working                                                         |
| `POST /v1/classes/:id/archive`                        | teacher   | closes the class                                                                              |
| `GET /v1/classes/:id/learners`                        | teacher   | nicknames only                                                                                |
| `POST /v1/classes/:id/learners/:enrolment/key`        | teacher   | a new key for the learner                                                                     |
| `POST /v1/classes/:id/learners/:enrolment/remove`     | teacher   | takes the learner out                                                                         |
| `POST /v1/join`                                       | anyone    | `{code, pseudonym}` → `{className, pseudonym, key}`, signed in; `409 pseudonym-taken`         |
| `POST /v1/classes/:id/assignments`                    | teacher   | `{lessonId, dueAt?}`; `409 already-set`                                                       |
| `POST /v1/classes/:id/assignments/:assignment/remove` | teacher   | takes the lesson off the class                                                                |
| `GET /v1/classes/:id/summary`                         | teacher   | per lesson: `started`, `finished` (counts only)                                               |
| `GET /v1/assignments`                                 | learner   | the lessons set for their classes                                                             |
| `POST /v1/progress`                                   | learner   | `{events: [{id, lessonId, step, outcome, at}]}` (up to 200) → `{kept}`                        |
| `POST /v1/projects`                                   | signed in | `{id?, document}` → `{id, version}`; a new version each time; up to 1 MB                      |
| `GET /v1/projects`, `GET /v1/projects/:id`            | owner     | the list, and the newest version                                                              |
| `POST /v1/projects/:id/remove`                        | owner     | hides it; the retention job removes it later                                                  |

Sign-up, sign-in, key sign-in and joining: at most 10 a minute per address.
