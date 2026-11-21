# The parts catalogue

The lab needs to know which real parts exist, what they cost and which project
uses them, so that a simulated part can be matched to the one a student holds and
a project can show its bill of materials. `packages/catalog` reads a supplier's
export and turns it into clean, dated records.

**No catalogue data is in this repository.** A supplier's product list and prices
are theirs. The importer and its tests are public; the data it produces is
written to `data/private/`, which git ignores, until permission to publish it is
in writing. The tests use made-up products.

## What it does

| Step     | What happens                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preserve | The source files are copied byte for byte into the snapshot, with their SHA-256. Every record also keeps its source row untouched in `raw`                                                                                |
| Clean    | Prices become numbers, the many spellings of stock become five levels, each product gets a stable id from the supplier's own product number                                                                               |
| Validate | Anything a person should look at is collected as an issue: missing or invalid prices, repeated names, parts filed under the wrong category, totals that do not add up, lines that point at a product not in the catalogue |
| Compute  | Project and budget totals are computed from quantities and unit prices. Nothing is typed in                                                                                                                               |
| Link     | Each line of a project's bill of materials is linked to the catalogue product it buys                                                                                                                                     |

Prices are a snapshot. Every snapshot carries the date the data was captured, and
anything shown to a user must show that date and say prices may have changed.

## Commands

```bash
pnpm catalog:import --source <folder with the export> --date 2026-11-13
pnpm catalog:verify --date 2026-11-13   # checks the snapshot against the project brief
```

`catalog:import` writes `data/private/catalog/<date>/`:

| File                       | Contents                                         |
| -------------------------- | ------------------------------------------------ |
| `source/`                  | The original files, unchanged                    |
| `products.json`            | Every product                                    |
| `projects.json`            | Every project with its lines and computed totals |
| `lab.json`                 | The lab budget by tier                           |
| `issues.json`, `report.md` | What was found, for a person to review           |
| `manifest.json`            | Date, file hashes and counts                     |

## Growing with the catalogue

- **Snapshots, not edits.** A new export is a new dated folder. `diffCatalogs`
  compares two snapshots by product number and reports what was added, removed,
  renamed or re-priced, so a price change is a recorded event.
- **Search.** `CatalogIndex` is built once per snapshot and answers word-prefix
  searches with group, category and availability filters, a page at a time. It
  looks only at products that share a word with the query.
- **Rules are data.** The misfiled-category check is a short list of rules, each
  from a real mistake. A new kind of mistake is a new rule and a new test.
- **Next:** a parts master that links each simulated part to its catalogue
  products and variants, and a per-project "missing in the simulator" report.

## Result on the first real snapshot

Run on 21 November 2026 against the export dated 13 November 2026. Counts only;
the data itself is private.

|                   |                                                        |
| ----------------- | ------------------------------------------------------ |
| Products          | 4,511 in 15 groups and 296 categories                  |
| Projects          | 20, with 244 lines (228 verified prices, 16 estimates) |
| Lab budget lines  | 122 in 3 tiers                                         |
| Issues for review | 15 kinds                                               |

Every project total and the budget total recomputed from the lines equals the
figure in the project brief. The issues are for the catalogue's owner to decide
on; the importer reports them and changes nothing.
