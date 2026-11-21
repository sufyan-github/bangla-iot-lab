import type { CatalogProduct } from './types';

export interface CatalogDiff {
  added: CatalogProduct[];
  removed: CatalogProduct[];
  priceChanged: { id: string; name: string; from: number | null; to: number | null }[];
  stockChanged: { id: string; name: string; from: string; to: string }[];
  renamed: { id: string; from: string; to: string }[];
}

/**
 * What changed between two snapshots of the catalogue. Products are matched by
 * the store's own product number, so a renamed or re-priced product is one
 * change and not a removal plus an addition.
 */
export function diffCatalogs(
  before: readonly CatalogProduct[],
  after: readonly CatalogProduct[],
): CatalogDiff {
  const old = new Map(before.map((product) => [product.id, product]));
  const now = new Map(after.map((product) => [product.id, product]));
  const diff: CatalogDiff = {
    added: after.filter((product) => !old.has(product.id)),
    removed: before.filter((product) => !now.has(product.id)),
    priceChanged: [],
    stockChanged: [],
    renamed: [],
  };
  for (const product of after) {
    const previous = old.get(product.id);
    if (!previous) continue;
    if (previous.priceBdt !== product.priceBdt) {
      diff.priceChanged.push({
        id: product.id,
        name: product.name,
        from: previous.priceBdt,
        to: product.priceBdt,
      });
    }
    if (previous.stock !== product.stock) {
      diff.stockChanged.push({
        id: product.id,
        name: product.name,
        from: previous.stock,
        to: product.stock,
      });
    }
    if (previous.name !== product.name) {
      diff.renamed.push({ id: product.id, from: previous.name, to: product.name });
    }
  }
  return diff;
}
