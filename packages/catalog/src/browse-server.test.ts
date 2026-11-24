import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrowseServer } from './browse-server';
import { importSnapshot } from './import';

/** Made-up store data in the export's shape; the real catalogue is not in this repository. */
const SHOP = 'https://shop.example';
const snapshot = importSnapshot(
  {
    inventory: [
      'Group,Category,Product,Price (BDT),Stock,Used in projects,URL',
      `Sensors,Distance,HC-SR04 Ultrasonic Sensor,140,In-Stock,S1,${SHOP}/sensors/201-ultrasonic.html`,
      `Sensors,Distance,Waterproof Ultrasonic Sensor JSN-SR04T,615,In Stock,,${SHOP}/sensors/202-waterproof.html`,
      `Tools,Soldering,Example Soldering Iron,900,In-Stock,,${SHOP}/tools/203-iron.html`,
      `Components,LED,5mm Red LED,5,Out of Stock,,${SHOP}/components/204-led.html`,
    ].join('\n'),
    projects: [
      'Project ID,Project,Track,Difficulty,Score /30,Shortlist,Component,Store product,Qty,Unit BDT,Line BDT,Price source,Optional,URL',
      `S1,School kit,Education,Beginner,30,yes,Distance sensor,Waterproof Ultrasonic Sensor JSN-SR04T,1,615,615,verified,,${SHOP}/sensors/202-waterproof.html`,
    ].join('\n'),
    lab: 'Tier,Item,Purpose / used by,Qty,Unit BDT,Total BDT,Price source,URL\n',
  },
  '2026-11-13',
);

let folder: string;
let server: Server;
let port: number;
const TOKEN = 'ab12';

function call(
  method: string,
  url: string,
  options: { body?: unknown; token?: string; host?: string } = {},
): Promise<{
  status: number;
  headers: Record<string, unknown>;
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test responses are read loosely
  json: () => any;
}> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method,
        path: url,
        headers: {
          host: options.host ?? `127.0.0.1:${port}`,
          ...(options.token ? { 'x-catalog-token': options.token } : {}),
          ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode!,
            headers: res.headers,
            text,
            json: () => JSON.parse(text),
          }),
        );
      },
    );
    req.on('error', reject);
    if (options.body !== undefined) req.write(JSON.stringify(options.body));
    req.end();
  });
}

const start = async () => {
  server = createBrowseServer({
    snapshot,
    decisionsFile: path.join(folder, 'part-links.json'),
    token: TOKEN,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
};
const stop = () => new Promise<void>((resolve) => server.close(() => resolve()));

beforeEach(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'catalog-desk-'));
  await start();
});
afterEach(async () => {
  await stop();
  rmSync(folder, { recursive: true, force: true });
});

const idOf = (name: string) => snapshot.products.find((product) => product.name === name)!.id;

describe('the private catalogue browser', () => {
  it('serves its page with its token, loading nothing from elsewhere', async () => {
    const page = await call('GET', '/');
    expect(page.status).toBe(200);
    expect(page.text).toContain('<meta name="catalog-token" content="ab12">');
    expect(page.headers['content-security-policy']).toContain("default-src 'none'");
    expect(page.text).not.toMatch(/<script[^>]+src=|<link[^>]+href=/);
  });

  it('answers only requests addressed to this computer', async () => {
    const elsewhere = await call('GET', '/api/summary', { host: 'catalog.example:80' });
    expect(elsewhere.status).toBe(403);
    expect((await call('GET', '/api/summary', { host: `localhost:${port}` })).status).toBe(200);
  });

  it('sums up the snapshot and searches with the link filters', async () => {
    const summary = (await call('GET', '/api/summary')).json();
    expect(summary).toMatchObject({
      snapshotDate: '2026-11-13',
      products: 4,
      counts: { suggested: 3, confirmed: 0, rejected: 0, none: 1 },
    });
    const suggested = (await call('GET', '/api/products?state=suggested')).json();
    expect(suggested.total).toBe(3);
    const jsn = (await call('GET', '/api/products?part=jsn-sr04t')).json();
    expect(jsn.items.map((p: { name: string }) => p.name)).toEqual([
      'Waterproof Ultrasonic Sensor JSN-SR04T',
    ]);
    const words = (await call('GET', '/api/products?text=ultra&available=1')).json();
    expect(words.total).toBe(2);
    expect((await call('GET', '/api/products/no-such')).status).toBe(404);
  });

  it('records a decision only with the token, and keeps it for the next start', async () => {
    const id = idOf('Waterproof Ultrasonic Sensor JSN-SR04T');
    const url = `/api/products/${encodeURIComponent(id)}/link`;
    expect((await call('PUT', url, { body: { part: 'hc-sr04' } })).status).toBe(403);
    expect((await call('PUT', url, { body: { part: 'hc-sr04' }, token: 'wrong' })).status).toBe(
      403,
    );
    expect((await call('PUT', url, { body: { part: 'no-such-part' }, token: TOKEN })).status).toBe(
      400,
    );
    expect((await call('PUT', url, { body: { part: 7 }, token: TOKEN })).status).toBe(400);

    const moved = await call('PUT', url, { body: { part: 'hc-sr04' }, token: TOKEN });
    expect(moved.status).toBe(200);
    expect(moved.json().link).toMatchObject({
      suggested: 'jsn-sr04t',
      part: 'hc-sr04',
      state: 'confirmed',
    });
    const saved = JSON.parse(readFileSync(path.join(folder, 'part-links.json'), 'utf8'));
    expect(saved.decisions[id]).toMatchObject({ part: 'hc-sr04' });

    // The project's line now comes to the HC-SR04 through the link.
    const projects = (await call('GET', '/api/projects')).json();
    expect(projects[0].lines[0]).toMatchObject({
      part: 'hc-sr04',
      via: 'link',
      status: 'simulated',
    });

    // Read back after a restart.
    await stop();
    await start();
    expect((await call('GET', `/api/products/${encodeURIComponent(id)}`)).json().link.state).toBe(
      'confirmed',
    );
    const forgotten = await call('DELETE', url, { token: TOKEN });
    expect(forgotten.json().link.state).toBe('suggested');
    expect((await call('GET', '/api/summary')).json().counts.confirmed).toBe(0);
  });

  it('marks a product as no lab part', async () => {
    const id = idOf('Example Soldering Iron');
    const result = await call('PUT', `/api/products/${encodeURIComponent(id)}/link`, {
      body: { part: null },
      token: TOKEN,
    });
    expect(result.json().link.state).toBe('rejected');
  });

  it('lists every part with its products, and the issues found', async () => {
    const parts = (await call('GET', '/api/parts')).json();
    expect(parts.find((p: { id: string }) => p.id === 'hc-sr04')).toMatchObject({
      suggested: 1,
      lowestBdt: 140,
    });
    // The LED is out of stock, so it gives no price that can be paid now.
    expect(parts.find((p: { id: string }) => p.id === 'led-5mm')).toMatchObject({
      suggested: 1,
      lowestBdt: null,
    });
    expect(Array.isArray((await call('GET', '/api/issues')).json())).toBe(true);
  });
});
