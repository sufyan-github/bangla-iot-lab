import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { PART_DEFINITIONS, type PartDefinition } from '@banglalab/parts';
import { browsePage } from './browse-page';
import { readDecisions, writeDecisions } from './files';
import {
  decide,
  decisionProblems,
  linkProducts,
  productsByPart,
  projectCoverage,
  type LinkDecisions,
  type LinkState,
  type ProductLink,
} from './links';
import { CatalogIndex } from './search';
import type { CatalogProduct, Snapshot } from './types';

/**
 * The private catalogue browser: a page and a small JSON interface over one
 * snapshot, for a person to search the products, read the issues found, and
 * confirm, move or reject the links to the parts master.
 *
 * It is for the owner's own computer only. It listens on 127.0.0.1, answers
 * only requests addressed to that host (so a web page elsewhere cannot reach it
 * through a renamed address), and changes nothing without a token that only
 * its own page carries.
 */
export interface BrowseOptions {
  snapshot: Snapshot;
  /** Where the link decisions are kept. Read at the start, written on every change. */
  decisionsFile: string;
  definitions?: readonly PartDefinition[];
  /** The token a change must carry; made at random when not given. */
  token?: string;
}

const LIMIT = 50;
const STATES: ReadonlySet<string> = new Set<LinkState>([
  'suggested',
  'confirmed',
  'rejected',
  'none',
]);

export function createBrowseServer(options: BrowseOptions): Server {
  const { snapshot } = options;
  const definitions = options.definitions ?? PART_DEFINITIONS;
  const token = options.token ?? randomBytes(24).toString('hex');
  const index = new CatalogIndex(snapshot.products);
  const parts = new Map(definitions.map((definition) => [definition.id, definition]));
  let decisions: LinkDecisions = readDecisions(options.decisionsFile);
  const links = linkProducts(snapshot.products, decisions, definitions);

  const partName = (id: string | null) => (id ? (parts.get(id)?.name.en ?? id) : null);
  const listed = (product: CatalogProduct) => {
    const link = links.get(product.id)!;
    return {
      id: product.id,
      name: product.name,
      group: product.group,
      category: product.category,
      priceBdt: product.priceBdt,
      stock: product.stock,
      part: link.part,
      partName: partName(link.part),
      state: link.state,
    };
  };
  const linkView = (link: ProductLink) => ({
    ...link,
    candidates: link.candidates.map((id) => ({ id, name: partName(id) })),
  });

  const routes: Record<string, (url: URL) => unknown> = {
    '/api/summary': () => {
      const counts: Record<LinkState, number> = {
        suggested: 0,
        confirmed: 0,
        rejected: 0,
        none: 0,
      };
      for (const link of links.values()) counts[link.state]++;
      return {
        snapshotDate: snapshot.snapshotDate,
        products: snapshot.products.length,
        counts,
        groups: index.groups,
        problems: decisionProblems(snapshot.products, decisions, definitions),
        parts: definitions
          .map((d) => ({ id: d.id, name: d.name.en, status: d.status, variants: d.variants }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    },
    '/api/products': (url) => {
      const q = url.searchParams;
      const state = q.get('state');
      const part = q.get('part');
      const page = index.search({
        text: q.get('text') ?? undefined,
        group: q.get('group') || undefined,
        category: q.get('category') || undefined,
        availableOnly: q.get('available') === '1',
        offset: Number(q.get('offset') ?? 0) || 0,
        limit: LIMIT,
        filter: (product) => {
          const link = links.get(product.id)!;
          return (
            (!state || !STATES.has(state) || link.state === state) && (!part || link.part === part)
          );
        },
      });
      return { total: page.total, limit: LIMIT, items: page.items.map(listed) };
    },
    '/api/parts': () => {
      const products = new Map(snapshot.products.map((product) => [product.id, product]));
      return productsByPart(links, definitions).map((entry) => ({
        id: entry.part,
        name: partName(entry.part),
        status: entry.status,
        confirmed: entry.confirmed.length,
        suggested: entry.suggested.length,
        lowestBdt: [...entry.confirmed, ...entry.suggested]
          .map((id) => products.get(id)!)
          .filter((p) => p.priceBdt !== null && (p.stock === 'in-stock' || p.stock === 'low-stock'))
          .reduce<number | null>(
            (low, p) => (low === null ? p.priceBdt : Math.min(low, p.priceBdt!)),
            null,
          ),
      }));
    },
    '/api/projects': () =>
      snapshot.projects.map((project) => ({
        id: project.id,
        name: project.name,
        shortlisted: project.shortlisted,
        lines: projectCoverage(project, links, definitions).map((line) => ({
          ...line,
          partName: partName(line.part),
        })),
      })),
    '/api/issues': () => snapshot.issues,
  };

  const send = (
    response: ServerResponse,
    status: number,
    body: unknown,
    type = 'application/json',
  ) => {
    const text = type === 'application/json' ? JSON.stringify(body) : String(body);
    response.writeHead(status, {
      'content-type': `${type}; charset=utf-8`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      // The page's own script and style are inline; nothing may be loaded from elsewhere.
      'content-security-policy':
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    });
    response.end(text);
  };

  const readBody = (request: IncomingMessage) =>
    new Promise<unknown>((resolve, reject) => {
      let text = '';
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => {
        text += chunk;
        if (text.length > 10_000) request.destroy(new Error('too large'));
      });
      request.on('end', () => {
        try {
          resolve(text ? JSON.parse(text) : null);
        } catch (error) {
          reject(error);
        }
      });
      request.on('error', reject);
    });

  const server = createServer((request, response) => {
    void (async () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const host = request.headers.host ?? '';
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
        return send(response, 403, { error: 'This tool answers only on this computer.' });
      }
      const url = new URL(request.url ?? '/', `http://${host}`);

      if (request.method === 'GET' && url.pathname === '/') {
        return send(response, 200, browsePage(token), 'text/html');
      }
      if (request.method === 'GET' && routes[url.pathname]) {
        return send(response, 200, routes[url.pathname]!(url));
      }
      const product = url.pathname.match(/^\/api\/products\/([^/]+)$/);
      if (request.method === 'GET' && product) {
        const id = decodeURIComponent(product[1]!);
        const found = index.get(id);
        if (!found) return send(response, 404, { error: 'No such product.' });
        return send(response, 200, {
          ...found,
          link: linkView(links.get(id)!),
          decision: decisions.decisions[id] ?? null,
        });
      }
      const link = url.pathname.match(/^\/api\/products\/([^/]+)\/link$/);
      if (link && (request.method === 'PUT' || request.method === 'DELETE')) {
        if (request.headers['x-catalog-token'] !== token) {
          return send(response, 403, { error: 'Changes come only from this tool’s own page.' });
        }
        const id = decodeURIComponent(link[1]!);
        const found = index.get(id);
        if (!found) return send(response, 404, { error: 'No such product.' });
        let choice: { part: string | null; variant?: string } | null = null;
        if (request.method === 'PUT') {
          const body = (await readBody(request).catch(() => undefined)) as
            { part?: unknown; variant?: unknown } | undefined | null;
          if (
            !body ||
            (body.part !== null && typeof body.part !== 'string') ||
            (body.variant !== undefined && typeof body.variant !== 'string')
          ) {
            return send(response, 400, {
              error: 'Send {"part": "<part id>" or null, "variant"?: "<id>"}.',
            });
          }
          choice = { part: body.part, ...(body.variant ? { variant: body.variant } : {}) };
        }
        try {
          decisions = decide(decisions, id, choice, new Date(), definitions);
        } catch (error) {
          return send(response, 400, { error: (error as Error).message });
        }
        writeDecisions(options.decisionsFile, decisions);
        links.set(id, linkProducts([found], decisions, definitions).get(id)!);
        return send(response, 200, {
          link: linkView(links.get(id)!),
          decision: decisions.decisions[id] ?? null,
        });
      }
      return send(response, 404, { error: 'Not found.' });
    })().catch((error: unknown) => {
      if (!response.headersSent) send(response, 500, { error: (error as Error).message });
    });
  });
  return server;
}
