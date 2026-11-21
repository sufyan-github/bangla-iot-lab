/**
 * Shading shared by every drawn part. Each gradient is laid over a flat colour:
 * a round body seen from the side, a dome or drum seen from above, brushed
 * metal, and the gloss on a flat board or the side of a box.
 *
 * Rendered once inside the scene's <defs>; a drawing exported on its own (see
 * scripts/export-esp32-board.tsx) includes it too.
 */
export function ShadingDefs() {
  return (
    <>
      <linearGradient id="shade-round" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity={0.5} />
        <stop offset="0.3" stopColor="#fff" stopOpacity={0.1} />
        <stop offset="0.6" stopColor="#000" stopOpacity={0} />
        <stop offset="1" stopColor="#000" stopOpacity={0.4} />
      </linearGradient>
      <radialGradient id="shade-dome" cx="0.36" cy="0.3" r="0.78">
        <stop offset="0" stopColor="#fff" stopOpacity={0.75} />
        <stop offset="0.3" stopColor="#fff" stopOpacity={0.16} />
        <stop offset="0.7" stopColor="#000" stopOpacity={0} />
        <stop offset="1" stopColor="#000" stopOpacity={0.36} />
      </radialGradient>
      <linearGradient id="shade-metal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f5f7f8" />
        <stop offset="0.4" stopColor="#aeb6ba" />
        <stop offset="0.62" stopColor="#e2e7e9" />
        <stop offset="1" stopColor="#8a9397" />
      </linearGradient>
      <linearGradient id="shade-board" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity={0.2} />
        <stop offset="0.45" stopColor="#fff" stopOpacity={0} />
        <stop offset="1" stopColor="#000" stopOpacity={0.2} />
      </linearGradient>
      <linearGradient id="shade-side" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity={0.16} />
        <stop offset="0.25" stopColor="#fff" stopOpacity={0.02} />
        <stop offset="0.8" stopColor="#000" stopOpacity={0.05} />
        <stop offset="1" stopColor="#000" stopOpacity={0.32} />
      </linearGradient>
    </>
  );
}
