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
- **Links to the parts master.** See below.

## Linking products to the lab's parts

The parts master is the set of part definitions in `packages/parts` (see
[parts.md](parts.md)). Each definition lists generic keywords; a product whose
name holds one, as whole words, is **suggested** for that part. Then a person
decides, product by product:

| Decision             | Meaning                                                 |
| -------------------- | ------------------------------------------------------- |
| Confirm              | The product is the suggested part                       |
| Link to another part | The product is a different part (and maybe one variant) |
| No lab part          | The product is not any part the lab has                 |
| Forget the decision  | Back to the keyword suggestion                          |

Decisions are kept by product number in `data/private/catalog/part-links.json`,
apart from any one snapshot, so they carry over to the next export. A decision
for a product that has left the catalogue, or for a part that no longer exists,
is reported, not dropped.

Matching rules, each with a test: keywords match whole words and plurals
("led" is not found in "oled"); a keyword of several longer words also matches
in any order ("5mm led" in "5mm Red LED"); a part number may have a maker's
letters before it and a package's after ("74hc00" in "SN74HC00N").

```bash
pnpm catalog:links --date 2026-11-13    # writes links.json and links-report.md into the snapshot
pnpm catalog:browse --date 2026-11-13   # the private catalogue desk at http://127.0.0.1:4300/
```

`links-report.md` gives the counts of each kind of link, every part with its
linked and suggested products and the lowest price among those that can be
bought (on the snapshot date), the parts the catalogue does not seem to sell,
and for each project what the simulator can build, through each line's product
link first and its words second.

### The catalogue desk

`catalog:browse` serves a page for the catalogue's owner: search the products
by words, group, category, availability, link state or part; open one to see
its price with the snapshot date, its stock, the row exactly as exported and
the parts its keywords point to; and make the decisions above. Other tabs list
the parts with their product counts, each project's lines with the part each
comes to, and the importer's issues.

It is private by construction: it listens on 127.0.0.1 only, answers only
requests addressed to that host, changes nothing without a token that only its
own page carries, and its page loads nothing from anywhere else. Every value
from the data is shown as text. `--decisions <file>` points it at a trial copy.

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

### Links on the first real snapshot

Run on 24 November 2026, before any decision was made. Counts only.

|                                         |                             |
| --------------------------------------- | --------------------------- |
| Products suggested for a part           | 851 (37 with more than one) |
| Products with no part found             | 3,660                       |
| Parts with no product in this catalogue | 18 of 77                    |

Most of the 18 were checked by hand and are parts the catalogue does not list
under any name, not misses. The suggestions still need a person's decisions;
until then the links are suggestions only.
