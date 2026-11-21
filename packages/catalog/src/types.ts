/**
 * The catalogue as this project stores it. Every record keeps the row it came
 * from, untouched, in `raw`; the other fields are a cleaned reading of it. A
 * price is always a snapshot: it carries where it came from, and the snapshot
 * carries its date.
 */

export type StockLevel = 'in-stock' | 'low-stock' | 'out-of-stock' | 'pre-order' | 'unknown';

export interface CatalogProduct {
  /** Stable id from the store's own product number, e.g. "rbd-1437". */
  id: string;
  group: string;
  category: string;
  name: string;
  /** Taka, or null when the store listed no price. */
  priceBdt: number | null;
  stock: StockLevel;
  /** Project ids that use this product, as marked in the source. */
  usedInProjects: string[];
  url: string;
  /** The source row exactly as it was. */
  raw: Record<string, string>;
}

export type PriceSource = 'verified' | 'estimated';

export interface BomLine {
  component: string;
  storeProduct: string;
  quantity: number;
  unitBdt: number;
  lineBdt: number;
  priceSource: PriceSource;
  optional: boolean;
  url: string;
  /** The catalogue product this line buys, when its link is in the catalogue. */
  productId: string | null;
  raw: Record<string, string>;
}

export interface CatalogProject {
  id: string;
  name: string;
  track: string;
  difficulty: string;
  /** Out of 30. */
  score: number;
  shortlisted: boolean;
  lines: BomLine[];
  /** Computed from the lines, never typed in. */
  requiredBdt: number;
  optionalBdt: number;
}

export interface LabLine {
  tier: string;
  item: string;
  purpose: string;
  quantity: number;
  unitBdt: number;
  totalBdt: number;
  priceSource: PriceSource;
  url: string;
  productId: string | null;
  raw: Record<string, string>;
}

export interface LabBudget {
  lines: LabLine[];
  tiers: { tier: string; lines: number; totalBdt: number }[];
  totalBdt: number;
}

export type IssueSeverity = 'error' | 'warning' | 'info';

/** Something in the source data that a person should look at. */
export interface DataIssue {
  code:
    | 'stock-spelling'
    | 'stock-unknown'
    | 'missing-price'
    | 'invalid-price'
    | 'duplicate-name'
    | 'duplicate-id'
    | 'missing-id'
    | 'misfiled-category'
    | 'link-name-mismatch'
    | 'line-total-mismatch'
    | 'invalid-number'
    | 'invalid-value'
    | 'not-in-catalogue';
  severity: IssueSeverity;
  message: string;
  /** How many rows are affected. */
  count: number;
  /** Up to ten of them, as "<id or row>: <name>". */
  examples: string[];
}

export interface Snapshot {
  /** The day the store data was captured (yyyy-mm-dd). Prices are true for that day only. */
  snapshotDate: string;
  products: CatalogProduct[];
  projects: CatalogProject[];
  lab: LabBudget;
  issues: DataIssue[];
}
