import type { CatalogProduct, StockLevel } from './types';

export interface ProductQuery {
  /** Words to look for in the name; every word must match the start of a word in the name. */
  text?: string;
  group?: string;
  category?: string;
  /** Leave out products that cannot be bought now. */
  availableOnly?: boolean;
  offset?: number;
  limit?: number;
}

export interface ProductPage {
  total: number;
  items: CatalogProduct[];
}

const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const AVAILABLE: ReadonlySet<StockLevel> = new Set(['in-stock', 'low-stock']);

/**
 * Lookup over a catalogue snapshot. Built once; each search then touches only
 * the products that share a word with the query, so it stays quick as the
 * catalogue grows from thousands of products to tens of thousands.
 */
export class CatalogIndex {
  private readonly byId = new Map<string, CatalogProduct>();
  private readonly byWord = new Map<string, Set<string>>();
  private readonly vocabulary: string[];
  readonly groups: { group: string; categories: { category: string; count: number }[] }[];

  constructor(readonly products: readonly CatalogProduct[]) {
    const tree = new Map<string, Map<string, number>>();
    for (const product of products) {
      this.byId.set(product.id, product);
      for (const word of new Set(words(product.name))) {
        const ids = this.byWord.get(word) ?? new Set<string>();
        ids.add(product.id);
        this.byWord.set(word, ids);
      }
      const categories = tree.get(product.group) ?? new Map<string, number>();
      categories.set(product.category, (categories.get(product.category) ?? 0) + 1);
      tree.set(product.group, categories);
    }
    this.vocabulary = [...this.byWord.keys()].sort();
    this.groups = [...tree.entries()]
      .map(([group, categories]) => ({
        group,
        categories: [...categories.entries()]
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => a.category.localeCompare(b.category)),
      }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }

  get(id: string): CatalogProduct | undefined {
    return this.byId.get(id);
  }

  /** Ids of products with a word that starts with `prefix`. */
  private matching(prefix: string): Set<string> {
    // The vocabulary is sorted, so the words with this prefix sit together.
    let low = 0;
    let high = this.vocabulary.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.vocabulary[middle]! < prefix) low = middle + 1;
      else high = middle;
    }
    const ids = new Set<string>();
    for (let i = low; i < this.vocabulary.length && this.vocabulary[i]!.startsWith(prefix); i++) {
      for (const id of this.byWord.get(this.vocabulary[i]!)!) ids.add(id);
    }
    return ids;
  }

  search(query: ProductQuery = {}): ProductPage {
    let candidates: Iterable<string> | null = null;
    for (const word of words(query.text ?? '')) {
      const found = this.matching(word);
      const kept: string[] = candidates
        ? [...candidates].filter((id) => found.has(id))
        : [...found];
      candidates = kept;
      if (kept.length === 0) break;
    }
    const pool = candidates ? [...candidates].map((id) => this.byId.get(id)!) : [...this.products];
    const matches = pool
      .filter(
        (product) =>
          (query.group === undefined || product.group === query.group) &&
          (query.category === undefined || product.category === query.category) &&
          (!query.availableOnly || AVAILABLE.has(product.stock)),
      )
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const offset = Math.max(0, query.offset ?? 0);
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));
    return { total: matches.length, items: matches.slice(offset, offset + limit) };
  }
}
