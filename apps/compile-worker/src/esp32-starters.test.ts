import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { esp32SourceHash } from './esp32-library';

const dir = new URL('../../../packages/board-emulators/fixtures/esp32-starters/', import.meta.url);

describe('shipped ESP32 starter programs', () => {
  it('each was built from its sketch and the board library as they are now', async () => {
    const built = JSON.parse(await readFile(new URL('built.json', dir), 'utf8')) as {
      starters: Record<string, { sourceHash: string; bytes: number }>;
    };
    const sketches = (await readdir(dir)).filter((file) => file.endsWith('.ino')).sort();
    expect(sketches).toEqual([
      'blink.ino',
      'button.ino',
      'dht.ino',
      'distance.ino',
      'fade.ino',
      'knob.ino',
      'light.ino',
      'motion.ino',
      'oled.ino',
      'rgb.ino',
      'servo.ino',
    ]);
    for (const sketch of sketches) {
      const name = sketch.replace(/\.ino$/, '');
      const source = await readFile(new URL(sketch, dir), 'utf8');
      // If this fails, run: pnpm --filter @banglalab/compile-worker esp32-starters:build
      expect(built.starters[name]?.sourceHash, sketch).toBe(esp32SourceHash(source));
      const module = Buffer.from(
        await readFile(new URL(`${name}.wasm.base64`, dir), 'utf8'),
        'base64',
      );
      expect(module.length, sketch).toBe(built.starters[name]!.bytes);
      // Every WebAssembly module begins with these four bytes.
      expect(module.subarray(0, 4).toString('latin1'), sketch).toBe('\0asm');
    }
  });
});
