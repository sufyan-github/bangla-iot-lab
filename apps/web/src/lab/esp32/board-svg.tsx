import { renderToStaticMarkup } from 'react-dom/server';
import { ShadingDefs } from '../shading';
import { Esp32BoardView } from './Esp32BoardView';
import { esp32BoardLayout, type Esp32BoardVariantId } from './geometry';

/**
 * The board drawing as a file of its own: the same component the lab will
 * draw, with the shading gradients it needs and a plain mat behind it.
 * `scripts/export-esp32-board.tsx` writes it to docs/engineering/, and a test
 * checks that the committed file is still what this produces.
 */
export function esp32BoardSvg(variant?: Esp32BoardVariantId): string {
  const { width, height } = esp32BoardLayout(variant);
  const margin = 22;
  const view = [-margin - 12, -margin, width + 2 * margin + 12, height + 2 * margin].map((value) =>
    Math.round(value),
  );
  const markup = renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={view.join(' ')}
      width={view[2] * 1.5}
      height={view[3] * 1.5}
      role="img"
      fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    >
      <title>ESP32 development board, 30 pins, seen from above</title>
      <desc>
        A black circuit board with the USB socket on the left, the EN and BOOT buttons beside it,
        the regulator and the USB-to-serial chip, two small lights, and on the right the module with
        its metal shield and antenna. Fifteen labelled pins run along the top edge and fifteen along
        the bottom.
      </desc>
      <defs>
        <ShadingDefs />
      </defs>
      <rect x={view[0]} y={view[1]} width={view[2]} height={view[3]} fill="#1d5a4e" />
      <Esp32BoardView ledLevel={1} powered selected={false} variant={variant} />
    </svg>,
  );
  return `${markup}\n`;
}
