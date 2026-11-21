import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { esp32BoardSvg } from './board-svg';
import { esp32BoardLayout } from './geometry';

describe('the exported ESP32 board drawing', () => {
  const svg = esp32BoardSvg();

  it('is what docs/engineering/esp32-board.svg holds (run `pnpm esp32:board` after a change)', () => {
    const committed = readFileSync(
      new URL('../../../../../docs/engineering/esp32-board.svg', import.meta.url),
      'utf8',
    );
    expect(svg).toBe(committed);
  });

  it('prints every pin label and carries its own shading', () => {
    for (const { label } of esp32BoardLayout().pins) expect(svg).toContain(`>${label}</text>`);
    expect(svg.match(/>GND<\/text>/g)).toHaveLength(2);
    for (const id of ['shade-metal', 'shade-board', 'shade-dome', 'shade-side']) {
      expect(svg).toContain(`id="${id}"`);
      expect(svg).toContain(`url(#${id})`);
    }
  });

  it('draws both row spacings', () => {
    expect(esp32BoardSvg('rows-0.9in')).not.toBe(svg);
    expect(esp32BoardSvg('rows-1.0in')).toBe(svg);
  });
});
