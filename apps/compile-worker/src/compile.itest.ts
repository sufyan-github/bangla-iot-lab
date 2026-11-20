import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { UnoBoard } from '@banglalab/board-emulators';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import { buildServer } from './server';

/** Needs avr-gcc, avr-libc and bubblewrap installed locally. */
const blinkSource = await readFile(
  new URL('../../../packages/board-emulators/fixtures/blink.c', import.meta.url),
  'utf8',
);

let cacheDir: string;
let server: Awaited<ReturnType<typeof buildServer>>;

beforeAll(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), 'banglalab-cache-'));
  server = await buildServer({ ...loadConfig({ LOG_LEVEL: 'silent' }), cacheDir });
});
afterAll(async () => {
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
});

const compile = (source: string) =>
  server.inject({
    method: 'POST',
    url: '/compile',
    payload: { board: 'uno', language: 'c', source },
  });

describe('compile worker (bubblewrap sandbox)', () => {
  it('compiles C to firmware that blinks pin 13 in the emulator', async () => {
    const response = await compile(blinkSource);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ ok: true, cached: false });
    expect(body.flashBytes).toBeGreaterThan(100);

    const board = new UnoBoard(body.hex);
    const toggles: number[] = [];
    board.onPinChange((pin, _drive, timeMs) => pin === 13 && toggles.push(timeMs));
    board.runFor(1200);
    expect(toggles).toHaveLength(4); // becomes an output, then high, low, high
    expect(toggles[2]! - toggles[1]!).toBeCloseTo(500, 0);
  });

  it('serves an identical request from the content-addressed cache', async () => {
    const first = (await compile(blinkSource)).json();
    const second = (await compile(blinkSource)).json();
    expect(second.cached).toBe(true);
    expect(second.hex).toBe(first.hex);
  });

  it('reports compile errors with line numbers', async () => {
    const body = (await compile('int main(void) {\n  PORTZ = 1;\n}\n')).json();
    expect(body).toMatchObject({ ok: false, reason: 'compile-error' });
    expect(body.diagnostics[0]).toMatchObject({ line: 2, severity: 'error' });
    expect(body.diagnostics[0].message).toContain('PORTZ');
  });

  it('cannot read host files through #include or .incbin', async () => {
    const include = (await compile('#include "/etc/passwd"\nint main(void){return 0;}\n')).json();
    expect(include.ok).toBe(false);
    expect(JSON.stringify(include)).toContain('No such file');
    expect(JSON.stringify(include)).not.toContain('root:');

    const incbin = (
      await compile('__asm__(".incbin \\"/etc/hostname\\"");\nint main(void){return 0;}\n')
    ).json();
    expect(incbin.ok).toBe(false);
  });

  it('rejects malformed and oversized requests before compiling', async () => {
    expect((await compile('')).statusCode).toBe(400);
    expect((await compile('x'.repeat(70_000))).statusCode).toBe(400);
    const wrongBoard = await server.inject({
      method: 'POST',
      url: '/compile',
      payload: { board: 'esp32', language: 'c', source: 'int main(void){}' },
    });
    expect(wrongBoard.statusCode).toBe(400);
  });

  it('rejects programs that do not fit in the UNO', async () => {
    const body = (
      await compile('char big[4000] = {1};\nint main(void){ return big[3]; }\n')
    ).json();
    expect(body).toMatchObject({ ok: false, reason: 'program-too-large' });
  });

  it('stops a compile that exceeds the time limit and does not cache the timeout', async () => {
    const slow = await buildServer({
      ...loadConfig({ LOG_LEVEL: 'silent' }),
      cacheDir,
      timeoutMs: 1,
    });
    const payload = { board: 'uno', language: 'c', source: `${blinkSource}\n// timeout probe\n` };
    const body = (await slow.inject({ method: 'POST', url: '/compile', payload })).json();
    await slow.close();
    expect(body).toMatchObject({ ok: false, reason: 'timeout', cached: false });
    expect(
      (await server.inject({ method: 'POST', url: '/compile', payload })).json(),
    ).toMatchObject({
      ok: true,
      cached: false,
    });
  });
});
