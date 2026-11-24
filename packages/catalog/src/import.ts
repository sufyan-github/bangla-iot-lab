import { readTable } from './csv';
import type {
  BomLine,
  CatalogProduct,
  CatalogProject,
  DataIssue,
  IssueSeverity,
  LabBudget,
  LabLine,
  PriceSource,
  Snapshot,
  StockLevel,
} from './types';

/** Collects issues by kind, so 700 rows with the same problem become one line in the report. */
class Issues {
  private readonly groups = new Map<string, DataIssue>();

  add(code: DataIssue['code'], severity: IssueSeverity, message: string, example: string): void {
    const key = `${code}|${message}`;
    const issue = this.groups.get(key) ?? { code, severity, message, count: 0, examples: [] };
    issue.count++;
    if (issue.examples.length < 10) issue.examples.push(example);
    this.groups.set(key, issue);
  }

  list(): DataIssue[] {
    const rank = { error: 0, warning: 1, info: 2 };
    return [...this.groups.values()].sort(
      (a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count,
    );
  }
}

const STOCK_WORDS: Record<string, StockLevel> = {
  instock: 'in-stock',
  lastitemsinstock: 'low-stock',
  outofstock: 'out-of-stock',
  soldout: 'out-of-stock',
  preorder: 'pre-order',
};
/** The spelling the store uses most; any other spelling of the same meaning is reported. */
const USUAL_SPELLING: Record<StockLevel, string> = {
  'in-stock': 'In-Stock',
  'low-stock': 'Last items in stock',
  'out-of-stock': 'Out of Stock',
  'pre-order': 'Pre_Order',
  unknown: '',
};

/**
 * Names that say what a product is, and categories it then cannot belong to.
 * Deliberately short: each rule comes from a real mistake found in the store
 * data. Add a rule when a new kind of mistake is confirmed, not on suspicion.
 */
const MISFILED: { name: RegExp; notIn: string[]; is: string }[] = [
  { name: /\btransistor\b/i, notIn: ['Capacitor', 'Connector', 'Display'], is: 'a transistor' },
  {
    name: /\b(potentiometer|trimpot)\b/i,
    notIn: ['Capacitor', 'Connector', 'Display'],
    is: 'a potentiometer',
  },
];

function toNumber(text: string): number | null {
  const cleaned = text.replace(/,/g, '').trim();
  return /^\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
}

/**
 * The store's product number: the digits that begin the last part of a product
 * link. A link may end with "#/121-colour-red" to pick a variant; that part is
 * about the variant, not the product, and is ignored.
 */
export function productIdFromUrl(url: string): string | null {
  const match = /\/(\d+)-[^/]*$/.exec(url.split('#')[0]!);
  return match ? `rbd-${match[1]}` : null;
}

export function importProducts(csv: string, issues = new Issues()): CatalogProduct[] {
  const rows = readTable(csv, ['Group', 'Category', 'Product', 'Price (BDT)', 'Stock', 'URL']);
  const products: CatalogProduct[] = [];
  const seenIds = new Set<string>();
  const byName = new Map<string, CatalogProduct[]>();

  rows.forEach((raw, index) => {
    const name = raw.Product!.trim();
    const where = `row ${index + 2}: ${name}`;
    const id = productIdFromUrl(raw.URL!);
    if (!id) {
      issues.add(
        'missing-id',
        'error',
        'The link has no product number, so the row has no id.',
        where,
      );
      return;
    }
    if (seenIds.has(id)) {
      issues.add('duplicate-id', 'error', 'Two rows have the same product number.', where);
      return;
    }
    seenIds.add(id);

    const priceText = raw['Price (BDT)']!.trim();
    const priceBdt = toNumber(priceText);
    if (priceText === '')
      issues.add('missing-price', 'warning', 'No price is listed.', `${id}: ${name}`);
    else if (priceBdt === null) {
      issues.add(
        'invalid-price',
        'error',
        'The price is not a number.',
        `${id}: ${name} (${priceText})`,
      );
    }

    const stockText = raw.Stock!.trim();
    const letters = stockText.toLowerCase().replace(/[^a-z]/g, '');
    // "Pre-Order (Delivery Time 1 month)" is still a pre-order.
    const stock =
      STOCK_WORDS[letters] ?? (letters.startsWith('preorder') ? 'pre-order' : 'unknown');
    if (stock === 'unknown') {
      issues.add(
        'stock-unknown',
        'warning',
        `Stock is written "${stockText}", which is not understood.`,
        `${id}: ${name}`,
      );
    } else if (stockText !== USUAL_SPELLING[stock]) {
      issues.add(
        'stock-spelling',
        'info',
        `Stock is written "${stockText}" instead of "${USUAL_SPELLING[stock]}".`,
        `${id}: ${name}`,
      );
    }

    const category = raw.Category!.trim();
    for (const rule of MISFILED) {
      if (rule.name.test(name) && rule.notIn.includes(category)) {
        issues.add(
          'misfiled-category',
          'warning',
          `Looks like ${rule.is} but is filed under "${category}".`,
          `${id}: ${name}`,
        );
      }
    }
    // A chip sold by its part number should have that number in its link.
    const partNumber = /^[A-Z]{1,5}(\d{3,5})[A-Z]?\b/.exec(name);
    if (partNumber && !raw.URL!.includes(partNumber[1]!)) {
      issues.add(
        'link-name-mismatch',
        'info',
        'The link does not contain the part number in the name.',
        `${id}: ${name}`,
      );
    }

    const product: CatalogProduct = {
      id,
      group: raw.Group!.trim(),
      category,
      name,
      priceBdt,
      stock,
      usedInProjects: (raw['Used in projects'] ?? '')
        .split(/[,;\s]+/)
        .map((project) => project.trim())
        .filter(Boolean),
      url: raw.URL!.trim(),
      raw,
    };
    products.push(product);
    const key = name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), product]);
  });

  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const prices = [...new Set(group.map((product) => product.priceBdt))].join(' and ');
    issues.add(
      'duplicate-name',
      'warning',
      'The same product name is listed more than once.',
      `${group.map((product) => product.id).join(', ')}: ${group[0]!.name} (৳${prices})`,
    );
  }
  return products;
}

function priceSource(text: string, issues: Issues, where: string): PriceSource {
  const value = text.trim().toLowerCase();
  if (value === 'verified' || value === 'estimated') return value;
  issues.add(
    'invalid-value',
    'error',
    `Price source is "${text}", expected verified or estimated.`,
    where,
  );
  return 'estimated';
}

function amount(
  raw: Record<string, string>,
  column: string,
  issues: Issues,
  where: string,
): number {
  const value = toNumber(raw[column] ?? '');
  if (value === null) {
    issues.add(
      'invalid-number',
      'error',
      `"${column}" is not a number.`,
      `${where} (${raw[column]})`,
    );
    return 0;
  }
  return value;
}

export function importProjects(
  csv: string,
  products: readonly CatalogProduct[],
  issues = new Issues(),
): CatalogProject[] {
  const rows = readTable(csv, [
    'Project ID',
    'Project',
    'Track',
    'Difficulty',
    'Score /30',
    'Shortlist',
    'Component',
    'Qty',
    'Unit BDT',
    'Line BDT',
    'Price source',
    'Optional',
  ]);
  const byUrl = new Map(products.map((product) => [product.url, product.id]));
  const projects = new Map<string, CatalogProject>();

  rows.forEach((raw, index) => {
    const id = raw['Project ID']!.trim();
    const where = `row ${index + 2}: ${id} ${raw.Component}`;
    const project = projects.get(id) ?? {
      id,
      name: raw.Project!.trim(),
      track: raw.Track!.trim(),
      difficulty: raw.Difficulty!.trim(),
      score: amount(raw, 'Score /30', issues, where),
      shortlisted: raw.Shortlist!.trim().toLowerCase() === 'yes',
      lines: [],
      requiredBdt: 0,
      optionalBdt: 0,
    };
    projects.set(id, project);

    const quantity = amount(raw, 'Qty', issues, where);
    const unitBdt = amount(raw, 'Unit BDT', issues, where);
    const lineBdt = amount(raw, 'Line BDT', issues, where);
    if (Math.abs(quantity * unitBdt - lineBdt) > 0.5) {
      issues.add(
        'line-total-mismatch',
        'error',
        'Quantity times unit price is not the line total.',
        where,
      );
    }
    const url = (raw.URL ?? '').trim();
    const productId = byUrl.get(url) ?? null;
    const source = priceSource(raw['Price source']!, issues, where);
    if (url !== '' && productId === null && source === 'verified') {
      issues.add(
        'not-in-catalogue',
        'warning',
        'A verified price points at a product that is not in the catalogue.',
        where,
      );
    }
    const line: BomLine = {
      component: raw.Component!.trim(),
      // The export names this column after the store; a generic name is read too.
      storeProduct: (raw['Store product'] ?? raw['RoboticsBD product'] ?? '').trim(),
      quantity,
      unitBdt,
      lineBdt,
      priceSource: source,
      optional: raw.Optional!.trim().toLowerCase() === 'yes',
      url,
      productId,
      raw,
    };
    project.lines.push(line);
    // Totals come from quantity and unit price, so a wrong line total in the source cannot spread.
    if (line.optional) project.optionalBdt += quantity * unitBdt;
    else project.requiredBdt += quantity * unitBdt;
  });
  return [...projects.values()];
}

export function importLab(
  csv: string,
  products: readonly CatalogProduct[],
  issues = new Issues(),
): LabBudget {
  const rows = readTable(csv, ['Tier', 'Item', 'Qty', 'Unit BDT', 'Total BDT', 'Price source']);
  const byUrl = new Map(products.map((product) => [product.url, product.id]));
  const lines: LabLine[] = rows.map((raw, index) => {
    const where = `row ${index + 2}: ${raw.Item}`;
    const quantity = amount(raw, 'Qty', issues, where);
    const unitBdt = amount(raw, 'Unit BDT', issues, where);
    const totalBdt = amount(raw, 'Total BDT', issues, where);
    if (Math.abs(quantity * unitBdt - totalBdt) > 0.5) {
      issues.add(
        'line-total-mismatch',
        'error',
        'Quantity times unit price is not the line total.',
        where,
      );
    }
    const url = (raw.URL ?? '').trim();
    return {
      tier: raw.Tier!.trim(),
      item: raw.Item!.trim(),
      purpose: (raw['Purpose / used by'] ?? '').trim(),
      quantity,
      unitBdt,
      totalBdt: quantity * unitBdt,
      priceSource: priceSource(raw['Price source']!, issues, where),
      url,
      productId: byUrl.get(url) ?? null,
      raw,
    };
  });
  const tiers = new Map<string, { tier: string; lines: number; totalBdt: number }>();
  for (const line of lines) {
    const tier = tiers.get(line.tier) ?? { tier: line.tier, lines: 0, totalBdt: 0 };
    tier.lines++;
    tier.totalBdt += line.totalBdt;
    tiers.set(line.tier, tier);
  }
  return {
    lines,
    tiers: [...tiers.values()],
    totalBdt: lines.reduce((sum, line) => sum + line.totalBdt, 0),
  };
}

/** Reads the three source files into one dated snapshot, with everything a person should check. */
export function importSnapshot(
  files: { inventory: string; projects: string; lab: string },
  snapshotDate: string,
): Snapshot {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
    throw new Error(`The snapshot date must be yyyy-mm-dd, got "${snapshotDate}".`);
  }
  const issues = new Issues();
  const products = importProducts(files.inventory, issues);
  const projects = importProjects(files.projects, products, issues);
  const lab = importLab(files.lab, products, issues);
  return { snapshotDate, products, projects, lab, issues: issues.list() };
}
