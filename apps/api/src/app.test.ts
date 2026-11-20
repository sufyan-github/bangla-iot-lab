import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import { loadConfig } from './config';
import type { Database } from './db/client';

const config = loadConfig({ LOG_LEVEL: 'silent' });
const body = { board: 'uno', language: 'c', source: 'int main(void){}' };

function build(fetch: typeof globalThis.fetch, dbUp = true) {
  const database = {
    db: { execute: () => (dbUp ? Promise.resolve() : Promise.reject(new Error('down'))) },
  } as unknown as Database;
  return buildApp({ config, database, fetch });
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

let app: Awaited<ReturnType<typeof build>>;
afterEach(() => app?.close());

describe('POST /v1/compile', () => {
  it('forwards a valid request to the compile worker and returns its answer', async () => {
    const fetch = vi.fn(async () => json({ ok: true, hex: ':00000001FF', cached: false }));
    app = await build(fetch);
    const response = await app.inject({ method: 'POST', url: '/v1/compile', payload: body });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, hex: ':00000001FF' });
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4100/compile',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(body) }),
    );
  });

  it('strips unknown properties before forwarding', async () => {
    const fetch = vi.fn(async () => json({ ok: true }));
    app = await build(fetch);
    await app.inject({ method: 'POST', url: '/v1/compile', payload: { ...body, admin: true } });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify(body) }),
    );
  });

  it('rejects invalid requests without contacting the worker', async () => {
    const fetch = vi.fn();
    app = await build(fetch);
    for (const payload of [
      { ...body, board: 'esp32' },
      { ...body, source: '' },
      { ...body, source: 'x'.repeat(70_000) },
      { board: 'uno' },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/v1/compile', payload });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('bad-request');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers 503 when the worker is down or busy, without leaking details', async () => {
    app = await build(async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:4100');
    });
    const down = await app.inject({ method: 'POST', url: '/v1/compile', payload: body });
    expect(down.statusCode).toBe(503);
    expect(down.json()).toEqual({ error: 'compiler-unavailable' });
    await app.close();

    app = await build(async () => json({ error: 'busy' }, 503));
    const busy = await app.inject({ method: 'POST', url: '/v1/compile', payload: body });
    expect(busy.statusCode).toBe(503);
    expect(busy.headers['retry-after']).toBe('5');
  });

  it('rate-limits a single client', async () => {
    app = await build(async () => json({ ok: true }));
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) {
      statuses.push(
        (await app.inject({ method: 'POST', url: '/v1/compile', payload: body })).statusCode,
      );
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429]);
  });
});

describe('health', () => {
  it('reports readiness from the database, and the compiler separately', async () => {
    app = await build(async () => json({ status: 'ok' }));
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' });
    expect((await app.inject('/ready')).json()).toEqual({ database: 'ok', compiler: 'ok' });
    await app.close();

    app = await build(async () => {
      throw new Error('down');
    }, false);
    const ready = await app.inject('/ready');
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({ database: 'unreachable', compiler: 'unreachable' });
  });

  it('only allows the configured web origin', async () => {
    app = await build(async () => json({}));
    const allowed = await app.inject({
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const other = await app.inject({ url: '/health', headers: { origin: 'https://evil.example' } });
    expect(other.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });
});

describe('configuration', () => {
  it('requires explicit settings in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' })).toThrow(
      /WEB_ORIGIN/,
    );
  });
});
