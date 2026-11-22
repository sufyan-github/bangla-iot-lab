# Parts: the definition format and how to add a part

Every real part the project knows about has one JSON file in
`packages/parts/definitions/`. The file says what the part is, whether a model of
it exists, what that model leaves out, which real versions a student may hold,
and how to recognise the part in a parts list.

The files are the **parts master**: the single list of parts, built or not.

## Honesty rules, enforced by tests

| Rule                                                                     | Why                                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `status` is one of `simulated`, `generic`, `planned`, `not-simulated`    | A student and a teacher must be able to tell a real model from a stand-in from a plan |
| A part that is not `simulated` needs a `statusNote`                      | It says what is missing                                                               |
| A `simulated` part lists what its model leaves out in `model.simplified` | Every model leaves something out; this is what the "simplified" badge will show       |
| `validation.state` is `not-checked` unless a bench record is named       | No part is called validated without a measurement. Today none is                      |
| `variants[].measured` is true only for dimensions taken from a real part | Enclosures will be generated from them                                                |

## Status today

70 definitions: 36 simulated, 5 generic stand-ins, 24 planned and 5 accessories
that will not be simulated. The ESP32 board is simulated as an experiment, and its
definition says what that leaves out.

## The fields

```json
{
  "formatVersion": 1,
  "id": "hc-sr04",
  "simulates": "ultrasonic",
  "status": "simulated",
  "family": "sensor",
  "tier": 1,
  "name": { "bn": "HC-SR04 দূরত্ব সেন্সর", "en": "HC-SR04 ultrasonic distance sensor" },
  "summary": { "bn": "…", "en": "Measures distance by timing an echo." },
  "model": { "level": "timing", "simplified": ["…what the model leaves out…"] },
  "validation": { "state": "not-checked", "tests": ["B7", "C8"] },
  "pins": [{ "id": "vcc", "label": "VCC", "role": "power", "volts": [4.5, 5.5] }],
  "placement": { "idPrefix": "US", "offsets": [0, 1, 2, 3] },
  "defaults": { "distance": 30 },
  "variants": [{ "id": "hc-sr04", "name": "HC-SR04 (5 V echo)", "measured": false }],
  "catalog": { "keywords": ["hc-sr04"] }
}
```

- `simulates` is the component type in the saved-circuit format that models the
  part, or `null` when nothing does.
- `tier` is 1 for the school kit and first lessons, 2 for another shortlisted
  project, 3 for everything else.
- `validation.tests` are test ids from the
  [hardware testing checklist](validation/README.md).
- `catalog.keywords` are lower-case words that identify the part in a supplier's
  product name or a project's parts list. They are generic part names, not a
  supplier's data.

The full format, with a comment on every field, is
`packages/parts/src/schema.ts`.

## Where a part's behaviour lives today

The definition is the description. For the 20 parts built before this format
existed, the behaviour is still code:

| What                    | Where                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Saved-circuit schema    | `packages/shared/src/circuit.ts`                                                                              |
| Shape on the breadboard | The definition, for resistor, LED and HC-SR04; `PART_SHAPES` in `packages/shared/src/editing.ts` for the rest |
| Electrical model        | `packages/simulation/src/netlist.ts`                                                                          |
| Drawing                 | `apps/web/src/lab/parts.tsx`                                                                                  |
| Schematic symbol        | `apps/web/src/lab/diagram/symbols.tsx`                                                                        |

Parts move into their definitions one at a time. A test
(`part shapes and part definitions agree`) keeps the table and the definitions
identical for every part that has both, so a move cannot change behaviour
unnoticed.

## Adding a part

1. Copy a definition of a similar part to `definitions/<id>.json` and edit it.
   If the model is not built yet, set `status` to `planned` and
   `model.level` to `none`.
2. Add its import to `packages/parts/src/registry.ts`. A test fails if you
   forget.
3. Run `pnpm test`. The definition is validated and the honesty rules are checked.
4. When you build the model, add its tests, then change `status`, fill
   `model.simplified`, and add the hardware test ids.

## "Missing in the simulator"

`coverage(lines)` takes the lines of a parts list and reports, for each, the part
it means and that part's status. For a project's bill of materials:

```bash
pnpm parts:coverage --date 2026-11-13
```

The project lists are private data, so the report is written beside the private
snapshot and is not published.
