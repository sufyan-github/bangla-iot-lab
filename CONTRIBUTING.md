# Contributing

Thank you for helping. This is a learning tool for school students, so being
correct and being honest about limits matter more than adding features quickly.

## Ground rules

1. **`main` always works.** Do work on a short branch and open a pull request.
   CI must pass before it is merged.
2. **Every feature comes with tests.** A change that adds behaviour adds a test
   that would fail without it.
3. **Do not claim what is not tested.** Docs and UI text describe only what is
   implemented and covered by tests. A part is "validated" only with a bench
   record in `docs/validation/`.
4. **Licences.**
   - Shipped dependencies must be MIT, ISC, Apache-2.0, BSD or similar.
     `pnpm licences:check` enforces this and runs in CI.
   - Never copy code or artwork from GPL or AGPL projects (for example Logisim
     Evolution, CircuitJS, SimulIDE, Fritzing art). Studying how they behave is
     fine; copying is not.
   - Code that must be distributed under another licence lives in `third_party/`
     with its licence and source, never mixed into the Apache-2.0 code.
5. **Nothing private in the repository.** No store catalogue exports, no lesson or
   handbook text, no student data, no secrets. The `private/` and `data/private/`
   folders are ignored by git for that reason.
6. **Names.** Say "UNO-compatible board" and "for Arduino". Do not use other
   people's trademarks in product, package or domain names.

## Setting up

See the [README](README.md#quick-start).

## Before you open a pull request

```bash
pnpm check              # lint, format, types, licence check, unit tests
pnpm test:integration   # if you touched the compile worker, API or emulators
pnpm test:e2e           # if you touched the web app
```

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`, `ci:`. Write the
subject as what the change does for a user or a developer, not as a list of files.

## Pull requests

Describe what changed and why, what you tested, and add a screenshot or a short
recording for anything visible. Add a line to [CHANGELOG.md](CHANGELOG.md) under
"Unreleased", and a decision to `docs/decisions/decision-log.md` if you chose
between real alternatives.

## Where things go

| You are adding               | It goes in                                        |
| ---------------------------- | ------------------------------------------------- |
| A rule of the circuit format | `packages/shared`                                 |
| An electrical model          | `packages/simulation`, never in a React component |
| Something drawn              | `apps/web/src/lab`                                |
| Text a student reads         | `packages/i18n`, in Bangla and English            |
| A reason for a choice        | `docs/decisions/decision-log.md`                  |
