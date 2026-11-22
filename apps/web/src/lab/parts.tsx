import type { LedColor } from '@banglalab/shared';
import type { LedState } from '@banglalab/simulation';
import { PITCH, UNO_BOX, UNO_SOCKETS, type Box, type Point } from './geometry';
import { resistorBands } from './resistor-bands';

/** Drawings of the parts. Pure SVG: no state, no event handling. */

const LEG_EDGE = '#6f787c';
const LEG_SHINE = '#e6ebed';
const SELECTION = '#e8a21a';

function between(a: Point, b: Point) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return { length, transform: `translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2}) rotate(${angle})` };
}

function SelectionHalo({ length }: { length: number }) {
  return (
    <line
      x1={-length / 2}
      x2={length / 2}
      stroke={SELECTION}
      strokeWidth={26}
      strokeLinecap="round"
      opacity={0.4}
    />
  );
}

/** A tinned metal leg: a dark edge with a bright line along it, as round wire catches the light. */
function Leg({ from, to }: { from: number; to: number }) {
  return (
    <g strokeLinecap="round">
      <line x1={from} x2={to} stroke={LEG_EDGE} strokeWidth={3.4} />
      <line x1={from} x2={to} y1={-0.5} y2={-0.5} stroke={LEG_SHINE} strokeWidth={1.4} />
    </g>
  );
}

/** Where a module's pin is soldered: a bright dot with a dark rim. */
function SolderDot({ x, y = 0, color }: { x: number; y?: number; color?: string }) {
  return (
    <circle
      cx={x}
      cy={y}
      r={2.8}
      fill={color ?? 'url(#shade-metal)'}
      stroke="rgba(0,0,0,.45)"
      strokeWidth={0.7}
    />
  );
}

/** The soft shadow a part throws on the board, a little down and to the right. */
function Shadow(props: { x: number; y: number; width: number; height: number; rx: number }) {
  return <rect {...props} transform="translate(1.5 3)" fill="#000" opacity={0.22} />;
}

/** A fibreglass module board: solder mask colour, a gloss across it and a mounting hole in each top corner. */
function ModuleBoard(props: {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}) {
  const { x, y, width, height } = props;
  return (
    <>
      <Shadow x={x} y={y} width={width} height={height} rx={4} />
      <rect x={x} y={y} width={width} height={height} rx={4} fill={props.color} />
      <rect x={x} y={y} width={width} height={height} rx={4} fill="url(#shade-board)" />
      <rect x={x} y={y} width={width} height={height} rx={4} fill="none" stroke="rgba(0,0,0,.45)" />
      {[x + 5.5, x + width - 5.5].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={y + 5.5} r={3.1} fill="#d9b65c" />
          <circle cx={cx} cy={y + 5.5} r={1.9} fill="#174a40" />
        </g>
      ))}
    </>
  );
}

/** The black plastic strip a module's pins come out of. */
function PinHeader({ from, to }: { from: number; to: number }) {
  return <rect x={from - 6} y={-5.5} width={to - from + 12} height={11} rx={1.5} fill="#16191b" />;
}

export function ResistorView(props: { a: Point; b: Point; resistance: number; selected: boolean }) {
  const { length, transform } = between(props.a, props.b);
  const body = Math.min(54, Math.max(20, length - 14));
  const bands = resistorBands(props.resistance);
  const bandAt = [0.2, 0.36, 0.52, 0.78];
  // A carbon-film resistor swells at its two end caps.
  const caps = body >= 34;
  const shapes = [
    { x: -body / 2 + (caps ? 5 : 0), y: -6.6, width: body - (caps ? 10 : 0), height: 13.2, rx: 6 },
    ...(caps
      ? [
          { x: -body / 2, y: -8.2, width: 13, height: 16.4, rx: 6.5 },
          { x: body / 2 - 13, y: -8.2, width: 13, height: 16.4, rx: 6.5 },
        ]
      : []),
  ];
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      <Shadow x={-body / 2} y={-7} width={body} height={14} rx={7} />
      <Leg from={-length / 2} to={length / 2} />
      {shapes.map((shape, i) => (
        <rect key={i} {...shape} fill="#dcc391" />
      ))}
      {bands.map((color, i) => {
        const x = -body / 2 + body * bandAt[i]! - 2;
        const onCap = caps && (x < -body / 2 + 11 || x > body / 2 - 15);
        return (
          <rect
            key={i}
            x={x}
            y={onCap ? -8.2 : -6.6}
            width={4}
            height={onCap ? 16.4 : 13.2}
            fill={color}
          />
        );
      })}
      {shapes.map((shape, i) => (
        <rect key={i} {...shape} fill="url(#shade-round)" />
      ))}
    </g>
  );
}

export const LED_PAINT: Record<LedColor, { off: string; on: string; glow: string }> = {
  red: { off: '#8a2a24', on: '#ff5340', glow: '#ff4a36' },
  yellow: { off: '#8c781f', on: '#ffdc3a', glow: '#ffd21f' },
  green: { off: '#2a6a3e', on: '#55e584', glow: '#3fe077' },
  blue: { off: '#2a4680', on: '#6aa5ff', glow: '#4f93ff' },
  white: { off: '#9ea4a6', on: '#ffffff', glow: '#fff3cc' },
};

export function LedView(props: {
  anode: Point;
  cathode: Point;
  color: LedColor;
  state: LedState | undefined;
  brightness: number;
  selected: boolean;
}) {
  const { length, transform } = between(props.anode, props.cathode);
  const paint = LED_PAINT[props.color];
  const burned = props.state === 'burned';
  const lit = props.brightness > 0;
  const lens = burned ? '#3b3b3b' : paint.off;
  // Seen from above: a round lens on a wider rim, which is cut flat on the cathode (−) side.
  const rim = 'M8.6 -8.22A11.9 11.9 0 1 0 8.6 8.22Z';
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      <ellipse cx={1.5} cy={3.5} rx={12} ry={11} fill="#000" opacity={0.25} />
      {lit && (
        <circle
          className="led-glow"
          r={16 + 30 * props.brightness}
          fill={`url(#glow-${props.color})`}
          opacity={0.45 + 0.55 * props.brightness}
          pointerEvents="none"
        />
      )}
      <Leg from={-length / 2} to={length / 2} />
      <path d={rim} fill={lens} />
      <path d={rim} fill="#000" opacity={0.28} />
      <circle r={9.4} fill={lens} />
      {/* The metal post and anvil inside the lens. */}
      <path d="M-4.2 -2.2h3.2v4.4h-3.2zM0.8 -4h3.8v8h-3.8z" fill="#000" opacity={0.2} />
      {lit && <circle r={9.4} fill={paint.on} opacity={0.35 + 0.65 * props.brightness} />}
      {lit && <circle r={4.2} fill="#fff" opacity={0.6 * props.brightness} />}
      <circle r={9.4} fill="url(#shade-dome)" opacity={burned ? 0.3 : 1} />
      <circle r={9.4} fill="none" stroke="rgba(0,0,0,.4)" strokeWidth={0.8} />
      {burned && (
        <path d="M-5 -5L5 5M5 -5L-5 5" stroke="#d0d0d0" strokeWidth={2} strokeLinecap="round" />
      )}
      <text
        x={-length / 2 - 1}
        y={-9}
        textAnchor="middle"
        fontSize={13}
        fontWeight={700}
        fill="#b8281f"
        pointerEvents="none"
      >
        +
      </text>
    </g>
  );
}

export function BatteryView(props: {
  box: { x: number; y: number; width: number; height: number };
  label: string;
  /** True for the kit's holder of six AA cells; otherwise a 9 V block is drawn. */
  pack?: boolean;
  positive: Point;
  negative: Point;
  selected: boolean;
}) {
  const { x, y, width, height } = props.box;
  const clip = (at: Point, wire: string) => (
    <g>
      {/* A short lead from the battery's snap to a clip the jumper wires fasten to. */}
      <path
        d={`M${x + width - 4} ${at.y}H${at.x - 6}`}
        stroke="rgba(0,0,0,.45)"
        strokeWidth={6.4}
        strokeLinecap="round"
      />
      <path
        d={`M${x + width - 4} ${at.y}H${at.x - 6}`}
        stroke={wire}
        strokeWidth={4.6}
        strokeLinecap="round"
      />
      <circle
        cx={at.x}
        cy={at.y}
        r={8.8}
        fill="url(#shade-metal)"
        stroke="#6f5a1c"
        strokeWidth={1.4}
      />
      <circle cx={at.x} cy={at.y} r={8.8} fill="#e2b84a" opacity={0.55} />
      <circle cx={at.x} cy={at.y} r={3.2} fill="#5b4a17" />
    </g>
  );
  return (
    <g>
      {props.selected && (
        <rect
          x={x - 6}
          y={y - 6}
          width={width + 12}
          height={height + 12}
          rx={16}
          fill={SELECTION}
          opacity={0.4}
        />
      )}
      <rect x={x + 3} y={y + 6} width={width} height={height} rx={11} fill="#000" opacity={0.3} />
      {clip(props.positive, '#d8342a')}
      {clip(props.negative, '#23282b')}
      <rect x={x} y={y} width={width} height={height} rx={11} fill="#22292b" />
      {props.pack && (
        <g>
          {/* Six AA cells in their holder, three to a row, seen from above. */}
          {[0, 1, 2, 3, 4, 5].map((cell) => {
            const cx = x + 12 + (cell % 3) * 28;
            const cy = y + (cell < 3 ? 10 : height - 48);
            return (
              <g key={cell}>
                <rect x={cx} y={cy} width={24} height={38} rx={5} fill="#2f8f5b" />
                <rect x={cx} y={cy} width={24} height={9} rx={4} fill="#d9dde0" />
                <rect x={cx} y={cy} width={24} height={38} rx={5} fill="url(#shade-round)" />
              </g>
            );
          })}
        </g>
      )}
      <g display={props.pack ? 'none' : undefined}>
        <rect x={x} y={y} width={width} height={34} rx={11} fill="#e8a21a" />
        <rect x={x} y={y + 22} width={width} height={12} fill="#e8a21a" />
        {/* The two snap terminals on top of a 9 V block: a small round one and a wide ribbed one. */}
        <circle cx={x + width * 0.3} cy={y + 15} r={8} fill="url(#shade-metal)" stroke="#6d7578" />
        <circle cx={x + width * 0.3} cy={y + 15} r={4.2} fill="#8b9498" />
        <circle
          cx={x + width * 0.7}
          cy={y + 15}
          r={9.6}
          fill="url(#shade-metal)"
          stroke="#6d7578"
        />
        <circle
          cx={x + width * 0.7}
          cy={y + 15}
          r={6.6}
          fill="none"
          stroke="#6d7578"
          strokeDasharray="2.6 2.2"
          strokeWidth={2}
        />
        <rect
          x={x + 10}
          y={y + height - 30}
          width={width - 20}
          height={3}
          rx={1.5}
          fill="#e8a21a"
          opacity={0.8}
        />
        <rect
          x={x + 10}
          y={y + height - 22}
          width={width - 42}
          height={3}
          rx={1.5}
          fill="#f4f7f5"
          opacity={0.35}
        />
      </g>
      <rect x={x} y={y} width={width} height={height} rx={11} fill="url(#shade-side)" />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={11}
        fill="none"
        stroke="rgba(0,0,0,.55)"
      />
      <text
        x={x + width / 2}
        y={y + 96}
        textAnchor="middle"
        fontSize={props.pack ? 26 : 30}
        fontWeight={700}
        fill="#f4f7f5"
      >
        {props.label}
      </text>
      <text
        x={x + width - 14}
        y={props.positive.y + 7}
        textAnchor="middle"
        fontSize={20}
        fontWeight={700}
        fill="#ff8d82"
      >
        +
      </text>
      <text
        x={x + width - 14}
        y={props.negative.y + 7}
        textAnchor="middle"
        fontSize={22}
        fontWeight={700}
        fill="#b9c4c7"
      >
        −
      </text>
    </g>
  );
}

/**
 * Path of a wire. Left alone it hangs slack between its ends like a real jumper
 * wire, so wires that share a row stay tellable apart. Routed through bend
 * points it runs straight between them with rounded corners.
 */
export function wirePath(from: Point, to: Point, bends: readonly Point[] = []): string {
  const r = (value: number) => Math.round(value * 10) / 10;
  if (bends.length > 0) {
    const points = [from, ...bends, to];
    let d = `M${r(from.x)} ${r(from.y)}`;
    for (let i = 1; i < points.length - 1; i++) {
      const before = points[i - 1]!;
      const corner = points[i]!;
      const after = points[i + 1]!;
      const inLength = Math.hypot(corner.x - before.x, corner.y - before.y) || 1;
      const outLength = Math.hypot(after.x - corner.x, after.y - corner.y) || 1;
      const radius = Math.min(16, inLength / 2, outLength / 2);
      const enter = {
        x: corner.x - ((corner.x - before.x) / inLength) * radius,
        y: corner.y - ((corner.y - before.y) / inLength) * radius,
      };
      const leave = {
        x: corner.x + ((after.x - corner.x) / outLength) * radius,
        y: corner.y + ((after.y - corner.y) / outLength) * radius,
      };
      d += `L${r(enter.x)} ${r(enter.y)}Q${r(corner.x)} ${r(corner.y)} ${r(leave.x)} ${r(leave.y)}`;
    }
    return `${d}L${r(to.x)} ${r(to.y)}`;
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  let nx = -dy / length;
  let ny = dx / length;
  if (ny < 0 || (ny === 0 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  // Kept shallow enough that a wire does not cover the row of holes below it.
  const sag = Math.min(PITCH * 0.8, length * 0.12);
  const control = (along: number) =>
    `${r(from.x + dx * along + nx * sag)} ${r(from.y + dy * along + ny * sag)}`;
  return `M${r(from.x)} ${r(from.y)}C${control(0.22)} ${control(0.78)} ${r(to.x)} ${r(to.y)}`;
}

/** The middle of an unrouted wire, where it hangs lowest. */
export function slackMiddle(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  let nx = -dy / length;
  let ny = dx / length;
  if (ny < 0 || (ny === 0 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const drop = Math.min(PITCH * 0.8, length * 0.12) * 0.75;
  return { x: (from.x + to.x) / 2 + nx * drop, y: (from.y + to.y) / 2 + ny * drop };
}

/** The plug on the end of a jumper wire: a dark sleeve with a metal pin in the hole. */
function WirePlug({ at }: { at: Point }) {
  return (
    <>
      <circle cx={at.x} cy={at.y} r={5.2} fill="#1f2426" stroke="rgba(0,0,0,.45)" strokeWidth={1} />
      <circle cx={at.x} cy={at.y} r={2} fill="#c9d1d4" />
    </>
  );
}

export function WireView(props: {
  from: Point;
  to: Point;
  color: string;
  /** Amperes from `from` to `to`; undefined while the circuit is stopped. */
  current: number | undefined;
  selected: boolean;
  /** True while one end is being carried to a new hole. */
  lifted?: boolean;
  /** Points the wire is routed through. */
  bends?: readonly Point[];
}) {
  const d = wirePath(props.from, props.to, props.bends);
  const flowing = props.current !== undefined && Math.abs(props.current) > 1e-6;
  return (
    <g fill="none" strokeLinecap="round" opacity={props.lifted ? 0.85 : 1}>
      {props.selected && <path d={d} stroke={SELECTION} strokeWidth={16} opacity={0.5} />}
      <path d={d} stroke="rgba(0,0,0,.28)" strokeWidth={8} transform="translate(0 2)" />
      <path d={d} stroke="rgba(0,0,0,.45)" strokeWidth={7} />
      <path d={d} stroke={props.color} strokeWidth={5.4} />
      {/* A thin light line along the top makes the insulation look round. */}
      <path d={d} stroke="rgba(255,255,255,.3)" strokeWidth={1.4} transform="translate(0 -1.1)" />
      {flowing && (
        <path
          d={d}
          className={props.current! < 0 ? 'wire-flow wire-flow-reverse' : 'wire-flow'}
          stroke="rgba(255,255,255,.92)"
          strokeWidth={2.2}
          strokeDasharray="3 11"
        />
      )}
      <WirePlug at={props.from} />
      <WirePlug at={props.to} />
    </g>
  );
}

/** Electrolytic capacitor lying across its two holes: a dark can with a pale stripe. */
export function CapacitorView(props: { a: Point; b: Point; selected: boolean }) {
  const { length, transform } = between(props.a, props.b);
  const body = Math.min(40, Math.max(22, length - 10));
  const can = { x: -body / 2, y: -11, width: body, height: 22, rx: 5 };
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      <Shadow {...can} />
      <Leg from={-length / 2} to={length / 2} />
      <rect {...can} fill="#1d2b52" />
      {/* The pale stripe with minus signs marks the negative leg. */}
      <rect x={-body / 2 + 3} y={3.5} width={body - 9} height={6} fill="#c3cbdd" />
      {[0.25, 0.5, 0.75].map((along) => (
        <rect
          key={along}
          x={-body / 2 + body * along - 2.5}
          y={5.9}
          width={5}
          height={1.3}
          fill="#1d2b52"
        />
      ))}
      {/* The crimp near the legs and the bare aluminium top. */}
      <rect x={-body / 2 + 4} y={-11} width={1.6} height={22} fill="#0d1530" />
      <rect x={body / 2 - 4.5} y={-11} width={4.5} height={22} rx={2} fill="#b8c0c4" />
      <rect {...can} fill="url(#shade-round)" />
      <rect {...can} fill="none" stroke="rgba(0,0,0,.5)" strokeWidth={0.8} />
    </g>
  );
}

/** Tactile push button seen from above. The cap sinks and darkens while held. */
export function ButtonView(props: { a: Point; b: Point; pressed: boolean; selected: boolean }) {
  const { length, transform } = between(props.a, props.b);
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      <Shadow x={-14} y={-14} width={28} height={28} rx={3} />
      <Leg from={-length / 2} to={length / 2} />
      <rect x={-14} y={-14} width={28} height={28} rx={3} fill="#1b1f21" />
      {/* The stamped metal cover, held down by a rivet in each corner. */}
      <rect x={-12.4} y={-12.4} width={24.8} height={24.8} rx={2.5} fill="url(#shade-metal)" />
      <rect
        x={-12.4}
        y={-12.4}
        width={24.8}
        height={24.8}
        rx={2.5}
        fill="none"
        stroke="#5d666a"
        strokeWidth={0.8}
      />
      {[-9, 9].flatMap((x) =>
        [-9, 9].map((y) => <circle key={`${x},${y}`} cx={x} cy={y} r={1.5} fill="#4f585c" />),
      )}
      <circle r={9.6} fill="#15181a" />
      <circle r={props.pressed ? 7.4 : 8.6} fill={props.pressed ? '#9d241c' : '#e0493e'} />
      <circle
        r={props.pressed ? 7.4 : 8.6}
        fill="url(#shade-dome)"
        opacity={props.pressed ? 0.35 : 1}
      />
    </g>
  );
}

/** Potentiometer seen from above: the pointer shows where the knob is turned to. */
export function PotentiometerView(props: {
  a: Point;
  wiper: Point;
  b: Point;
  position: number;
  selected: boolean;
}) {
  const { length, transform } = between(props.a, props.b);
  // Fully towards lead a at position 0, fully towards lead b at position 1.
  const angle = -135 + 270 * props.position;
  const body = { x: -length / 2 - 9, y: -15, width: length + 18, height: 30, rx: 5 };
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      <Shadow {...body} />
      <rect {...body} fill="#2b62b0" />
      <rect {...body} fill="url(#shade-board)" />
      <rect {...body} fill="none" stroke="#1b3f73" />
      {[-length / 2, 0, length / 2].map((x) => (
        <SolderDot key={x} x={x} y={11} />
      ))}
      {/* The rotor: a slotted disc that a screwdriver or a fingertip turns. */}
      <circle r={12.6} fill="#1b3f73" />
      <circle r={11.6} fill="#eef1f0" />
      <circle r={11.6} fill="url(#shade-dome)" opacity={0.7} />
      <g transform={`rotate(${angle})`} strokeLinecap="round">
        <line y1={7} y2={-9.5} stroke="#13231f" strokeWidth={3.2} />
        <line x1={-5} x2={5} stroke="#13231f" strokeWidth={2.2} opacity={0.55} />
        <path d="M0 -11.4l-2.6 3.4h5.2z" fill="#e8a21a" />
      </g>
    </g>
  );
}

/** The UNO board with its two rows of sockets. `ledLevel` is how bright the pin 13 LED is, 0 to 1. */
export function UnoView(props: { ledLevel: number; powered: boolean; selected: boolean }) {
  const { x, y, width, height } = UNO_BOX;
  const silk = '#d7f0f2';
  return (
    <g>
      {props.selected && (
        <rect
          x={x - 6}
          y={y - 6}
          width={width + 12}
          height={height + 12}
          rx={16}
          fill={SELECTION}
          opacity={0.4}
        />
      )}
      <rect x={x + 3} y={y + 6} width={width} height={height} rx={10} fill="#000" opacity={0.3} />
      <rect x={x} y={y} width={width} height={height} rx={10} fill="#0f7a86" />
      <rect x={x} y={y} width={width} height={height} rx={10} fill="url(#shade-board)" />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={10}
        fill="none"
        stroke="#0a5a63"
        strokeWidth={2}
      />
      {/* Copper traces under the solder mask, and the four mounting holes. */}
      <path
        d={`M${x + 96} ${y + 34}V${y + 70}H${x + 236}V${y + 96}M${x + 300} ${y + 34}V${y + 78}H${x + 380}V${y + 96}M${x + 270} ${y + 154}V${y + 130}M${x + 330} ${y + 154}V${y + 130}`}
        fill="none"
        stroke="#0b6672"
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      {[
        [x + 86, y + 14],
        [x + width - 14, y + 46],
        [x + 84, y + height - 14],
        [x + width - 14, y + height - 40],
      ].map(([cx, cy]) => (
        <g key={`${cx},${cy}`}>
          <circle cx={cx} cy={cy} r={6.4} fill="#d9b65c" />
          <circle cx={cx} cy={cy} r={4.3} fill="#174a40" />
        </g>
      ))}

      {/* USB socket, power jack, the regulator and the processor in its socket. */}
      <rect
        x={x - 12}
        y={y + 38}
        width={58}
        height={44}
        rx={3}
        fill="url(#shade-metal)"
        stroke="#70797d"
      />
      <rect x={x - 12} y={y + 46} width={10} height={28} fill="#23282a" />
      <rect x={x - 6} y={y + 122} width={46} height={40} rx={3} fill="#1d2325" />
      <rect x={x - 6} y={y + 122} width={46} height={40} rx={3} fill="url(#shade-side)" />
      <circle cx={x - 2} cy={y + 142} r={9} fill="#0b0d0e" />
      <rect x={x + 58} y={y + 92} width={26} height={20} rx={2} fill="#1b1f21" />
      <rect x={x + 62} y={y + 88} width={18} height={5} fill="url(#shade-metal)" />
      {[x + 120, x + 142].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={y + 150} r={9.5} fill="url(#shade-metal)" stroke="#70797d" />
          <path
            d={`M${cx - 6} ${y + 150}h12M${cx} ${y + 144}v12`}
            stroke="#70797d"
            strokeWidth={1.1}
          />
        </g>
      ))}
      <rect
        x={x + 176}
        y={y + 82}
        width={34}
        height={13}
        rx={6.5}
        fill="url(#shade-metal)"
        stroke="#70797d"
      />
      {Array.from({ length: 14 }, (_, i) => (
        <g key={i} fill="#c2cacd">
          <rect x={x + 255 + i * 12.2} y={y + 91} width={4.5} height={6} />
          <rect x={x + 255 + i * 12.2} y={y + 129} width={4.5} height={6} />
        </g>
      ))}
      <rect x={x + 250} y={y + 96} width={170} height={34} rx={3} fill="#17191b" />
      <rect x={x + 250} y={y + 96} width={170} height={34} rx={3} fill="url(#shade-side)" />
      <circle cx={x + 258} cy={y + 113} r={3} fill="#0b0d0e" />
      <text x={x + 338} y={y + 117} textAnchor="middle" fontSize={10} fill="#8b979c">
        ATmega328P
      </text>
      <text x={x + 150} y={y + 122} textAnchor="middle" fontSize={24} fontWeight={700} fill={silk}>
        UNO
      </text>
      {/* Reset button, beside the USB socket. */}
      <rect
        x={x + 54}
        y={y + 20}
        width={18}
        height={18}
        rx={2}
        fill="url(#shade-metal)"
        stroke="#70797d"
      />
      <circle cx={x + 63} cy={y + 29} r={5} fill="#c0392b" />
      <circle cx={x + 63} cy={y + 29} r={5} fill="url(#shade-dome)" />
      {/* The six programming pins at the far end. */}
      {[0, 1, 2].flatMap((row) =>
        [0, 1].map((column) => (
          <rect
            key={`${row}-${column}`}
            x={x + width - 36 + column * 11}
            y={y + 76 + row * 11}
            width={7}
            height={7}
            rx={1}
            fill="#d9b65c"
            stroke="#15191b"
            strokeWidth={1.6}
          />
        )),
      )}

      {/* Power light and the LED wired to pin 13 */}
      <rect
        x={x + 66}
        y={y + 136}
        width={11}
        height={7}
        rx={2}
        fill={props.powered ? '#7dff9b' : '#2f5d3a'}
      />
      {props.powered && (
        <circle cx={x + 71.5} cy={y + 139.5} r={11} fill="#7dff9b" opacity={0.28} />
      )}
      <text x={x + 82} y={y + 143} fontSize={9} fill={silk}>
        ON
      </text>
      {props.ledLevel > 0 && (
        <circle cx={x + 71} cy={y + 59} r={18} fill="#ffb52e" opacity={0.5 * props.ledLevel} />
      )}
      <rect x={x + 66} y={y + 55} width={11} height={7} rx={2} fill="#6a5a2c" />
      <rect
        x={x + 66}
        y={y + 55}
        width={11}
        height={7}
        rx={2}
        fill="#ffd45e"
        opacity={props.ledLevel}
      />
      <text x={x + 82} y={y + 62} fontSize={9} fill={silk}>
        L
      </text>

      {/* The socket strips: one square opening for each pin. */}
      {UNO_SOCKETS.map(({ terminal, point, label, top }) => (
        <g key={terminal}>
          <rect x={point.x - 11} y={point.y - 9.5} width={22} height={19} fill="#121517" />
          <rect
            x={point.x - 11}
            y={point.y - 9.5}
            width={22}
            height={3}
            fill="#fff"
            opacity={0.08}
          />
          <rect
            x={point.x - 4.2}
            y={point.y - 4.2}
            width={8.4}
            height={8.4}
            rx={1}
            fill="#050606"
          />
          <rect x={point.x - 2} y={point.y - 2} width={4} height={4} fill="#b99a3e" />
          <text
            x={point.x}
            y={point.y + (top ? 22 : -14)}
            textAnchor="middle"
            fontSize={9}
            fontWeight={600}
            fill={silk}
          >
            {label}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Legs and selection highlight shared by the two-lead parts below. */
function TwoLeads(props: { length: number; selected: boolean }) {
  return (
    <>
      {props.selected && <SelectionHalo length={props.length} />}
      <Leg from={-props.length / 2} to={props.length / 2} />
    </>
  );
}

/** Slide switch: the knob sits towards lead b when the switch is on. */
export function SwitchView(props: { a: Point; b: Point; closed: boolean; selected: boolean }) {
  const { length, transform } = between(props.a, props.b);
  const knob = props.closed ? 1 : -12;
  return (
    <g transform={transform}>
      <TwoLeads length={length} selected={props.selected} />
      <Shadow x={-17} y={-10} width={34} height={20} rx={3} />
      <rect x={-17} y={-10} width={34} height={20} rx={3} fill="url(#shade-metal)" />
      <rect x={-17} y={-10} width={34} height={20} rx={3} fill="none" stroke="#5d666a" />
      <rect x={-13.5} y={-5.5} width={27} height={11} rx={2} fill="#101315" />
      <rect
        x={knob}
        y={-6.5}
        width={11}
        height={13}
        rx={2}
        fill={props.closed ? '#3fc66d' : '#c9d1d4'}
      />
      {[2.5, 5.5, 8.5].map((x) => (
        <rect
          key={x}
          x={knob + x - 0.6}
          y={-5}
          width={1.2}
          height={10}
          fill="#000"
          opacity={0.28}
        />
      ))}
      <rect x={knob} y={-6.5} width={11} height={13} rx={2} fill="url(#shade-round)" />
    </g>
  );
}

/** Rectifier diode: the stripe marks the cathode, the end current comes out of. */
export function DiodeView(props: { anode: Point; cathode: Point; selected: boolean }) {
  const { length, transform } = between(props.anode, props.cathode);
  const body = Math.min(34, Math.max(18, length - 12));
  const shape = { x: -body / 2, y: -7, width: body, height: 14, rx: 3.5 };
  return (
    <g transform={transform}>
      <TwoLeads length={length} selected={props.selected} />
      <Shadow {...shape} />
      <rect {...shape} fill="#17191b" />
      <rect x={body / 2 - 8.5} y={-7} width={5} height={14} fill="#d7dde0" />
      <rect {...shape} fill="url(#shade-round)" />
    </g>
  );
}

/** Light-dependent resistor: the face brightens with the light falling on it. */
export function LdrView(props: { a: Point; b: Point; light: number; selected: boolean }) {
  const { length, transform } = between(props.a, props.b);
  return (
    <g transform={transform}>
      <TwoLeads length={length} selected={props.selected} />
      <ellipse cx={1.5} cy={3} rx={11.5} ry={11} fill="#000" opacity={0.24} />
      {/* A ceramic disc with the light-sensitive track winding across it, under clear resin. */}
      <circle r={11.4} fill="#7c4a26" />
      <circle r={10} fill="#ead9ae" />
      <circle r={10} fill="#ffe9a8" opacity={0.8 * props.light} />
      <path
        d="M-7 -5.5H5V-2H-5V1.5H5V5H-7"
        fill="none"
        stroke="#a8432a"
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <circle r={10} fill="url(#shade-dome)" opacity={0.85} />
    </g>
  );
}

export function BuzzerView(props: {
  pos: Point;
  neg: Point;
  sounding: boolean;
  selected: boolean;
}) {
  const { length, transform } = between(props.pos, props.neg);
  return (
    <g transform={transform}>
      <TwoLeads length={length} selected={props.selected} />
      {props.sounding && (
        <g
          className="buzzer-waves"
          fill="none"
          stroke="#e8a21a"
          strokeWidth={2.4}
          strokeLinecap="round"
        >
          <path d="M-13 -17A22 22 0 0 1 13 -17" />
          <path d="M-18 -22A30 30 0 0 1 18 -22" />
        </g>
      )}
      <ellipse cx={2} cy={4} rx={13.5} ry={13} fill="#000" opacity={0.28} />
      {/* A black plastic drum; sound comes out of the hole in the middle. */}
      <circle r={13.5} fill="#17191b" />
      <circle r={13.5} fill="url(#shade-dome)" opacity={0.55} />
      <circle r={10.4} fill="none" stroke="#000" strokeWidth={1.1} opacity={0.6} />
      <circle r={3.4} fill="#2e3437" />
      <circle r={2.2} fill="#050606" />
      <text
        x={-length / 2 - 1}
        y={-9}
        textAnchor="middle"
        fontSize={13}
        fontWeight={700}
        fill="#b8281f"
      >
        +
      </text>
    </g>
  );
}

/** DC motor seen from the shaft end. `speed` is −1 to 1; the rotor turns to match. */
export function MotorView(props: { a: Point; b: Point; speed: number; selected: boolean }) {
  const { length, transform } = between(props.a, props.b);
  const turning = Math.abs(props.speed) > 0;
  return (
    <g transform={transform}>
      <TwoLeads length={length} selected={props.selected} />
      <ellipse cx={2} cy={4} rx={15} ry={14.5} fill="#000" opacity={0.26} />
      {/* The steel can from the shaft end, with its two vents and the bearing in the middle. */}
      <circle r={15} fill="url(#shade-metal)" stroke="#5d666a" strokeWidth={1.2} />
      <circle r={11.2} fill="#8f989c" />
      <circle r={11.2} fill="url(#shade-dome)" opacity={0.5} />
      <rect x={-8.5} y={-2.2} width={4.4} height={4.4} rx={1} fill="#23282a" />
      <rect x={4.1} y={-2.2} width={4.4} height={4.4} rx={1} fill="#23282a" />
      <g
        className={turning ? 'motor-rotor' : undefined}
        style={
          turning
            ? {
                animationDuration: `${Math.max(0.18, 0.3 / Math.abs(props.speed))}s`,
                animationDirection: props.speed < 0 ? 'reverse' : 'normal',
              }
            : undefined
        }
      >
        {/* A marker on the shaft, so its turning can be seen. */}
        <path d="M-11 0H11M0 -11V11" stroke="#e8a21a" strokeWidth={3.6} strokeLinecap="round" />
        <circle r={3.8} fill="#d5dadd" stroke="#4f585c" />
      </g>
    </g>
  );
}

/** NPN transistor (TO-92 package) seen from above, flat face towards the viewer. */
export function TransistorView(props: { collector: Point; emitter: Point; selected: boolean }) {
  const { length, transform } = between(props.collector, props.emitter);
  const body = 'M-15 4H15V-2A15 13 0 0 0 -15 -2Z';
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      {[-length / 2, 0, length / 2].map((x) => (
        <SolderDot key={x} x={x} />
      ))}
      <path d={body} transform="translate(1.5 3)" fill="#000" opacity={0.24} />
      <path d={body} fill="#17191b" />
      <path d={body} fill="url(#shade-dome)" opacity={0.45} />
      {/* The flat face, where the type is printed. */}
      <rect x={-15} y={2.2} width={30} height={1.8} fill="#3a4043" />
      <g fontSize={8.5} fontWeight={700} fill="#4b5d57" textAnchor="middle" pointerEvents="none">
        <text x={-length / 2} y={15}>
          C
        </text>
        <text x={0} y={15}>
          B
        </text>
        <text x={length / 2} y={15}>
          E
        </text>
      </g>
    </g>
  );
}

const SENSOR_BOARD = {
  temperature: '#7b3fa0',
  soil: '#2f6b4a',
  ir: '#1f5fa8',
  dht11: '#1d3f66',
} as const;

/** Three-pin sensor module: a small board standing behind its supply, output and ground legs. */
export function SensorView(props: {
  vcc: Point;
  gnd: Point;
  kind: keyof typeof SENSOR_BOARD;
  /** Short text shown on the module, e.g. the temperature it is sensing. */
  label: string;
  /** For the IR sensor: its indicator light. */
  lit?: boolean;
  selected: boolean;
}) {
  const { length, transform } = between(props.vcc, props.gnd);
  const left = -length / 2 - 10;
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      <ModuleBoard
        x={left}
        y={-34}
        width={length + 20}
        height={40}
        color={SENSOR_BOARD[props.kind]}
      />
      <PinHeader from={-length / 2} to={length / 2} />
      {[-length / 2, 0, length / 2].map((x) => (
        <SolderDot key={x} x={x} />
      ))}
      {/* What does the sensing: a black three-leg sensor, bare probe pads, or an emitter and receiver pair. */}
      {props.kind === 'temperature' && (
        <path d="M-7 -28.5H7V-31A7 5 0 0 0 -7 -31Z" transform="translate(0 4)" fill="#17191b" />
      )}
      {/* The DHT11's pale blue case, with the slots the air reaches the sensor through. */}
      {props.kind === 'dht11' && (
        <>
          <rect x={-13} y={-33} width={26} height={13} rx={1.5} fill="#7ec3ea" />
          <rect x={-13} y={-33} width={26} height={13} rx={1.5} fill="url(#shade-board)" />
          {[-8, -4, 0, 4, 8].map((x) => (
            <rect key={x} x={x - 1} y={-30.5} width={2} height={8} rx={1} fill="#2a6f9c" />
          ))}
        </>
      )}
      {props.kind === 'soil' &&
        [-9, 9].map((x) => (
          <rect key={x} x={x - 3} y={-33} width={6} height={9} rx={1.5} fill="#d9b65c" />
        ))}
      {props.kind === 'ir' && (
        <>
          <circle cx={-7} cy={-29} r={4.2} fill="#e9ecea" stroke="#8d9396" />
          <circle cx={-7} cy={-29} r={4.2} fill="url(#shade-dome)" />
          <circle cx={7} cy={-29} r={4.2} fill="#17191b" />
          <circle cx={7} cy={-29} r={4.2} fill="url(#shade-dome)" opacity={0.6} />
        </>
      )}
      <text
        y={props.kind === 'dht11' ? -9 : -11.5}
        textAnchor="middle"
        fontSize={props.kind === 'dht11' ? 9.5 : 12}
        fontWeight={700}
        fill="#fff"
        pointerEvents="none"
      >
        {props.label}
      </text>
      {props.lit !== undefined && (
        <>
          {props.lit && <circle cx={length / 2 + 2} cy={-20} r={7} fill="#ff5340" opacity={0.35} />}
          <circle cx={length / 2 + 2} cy={-20} r={2.8} fill={props.lit ? '#ff5340' : '#5a1f1a'} />
        </>
      )}
    </g>
  );
}

const MODULE_BOARD = {
  ldrmodule: '#1f5fa8',
  rain: '#a8332b',
  mq135: '#1c4f8f',
} as const;

/**
 * Four-pin sensor module (VCC, GND, DO, AO): the sensing part at the top, and
 * below it the trimmer that sets where DO switches and the light that shows it.
 */
export function AnalogModuleView(props: {
  first: Point;
  last: Point;
  kind: keyof typeof MODULE_BOARD;
  /** Short text shown on the module: what it is sensing. */
  label: string;
  /** The module's indicator: lit while DO is LOW. */
  lit: boolean;
  selected: boolean;
}) {
  const { length, transform } = between(props.first, props.last);
  const pins = [-length / 2, -length / 6, length / 6, length / 2];
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      <ModuleBoard
        x={-length / 2 - 12}
        y={-58}
        width={length + 24}
        height={62}
        color={MODULE_BOARD[props.kind]}
      />
      <PinHeader from={-length / 2} to={length / 2} />
      {pins.map((x) => (
        <SolderDot key={x} x={x} />
      ))}
      {props.kind === 'ldrmodule' && (
        <g transform="translate(0 -44)">
          {/* The LDR seen from above: a disc with its zig-zag track. */}
          <circle cx={1} cy={2} r={10} fill="#000" opacity={0.25} />
          <circle r={10} fill="#d8cdb4" stroke="#7b7362" />
          <path
            d="M-6 -5.5H5.5V-2.5H-5.5V0.5H5.5V3.5H-5.5V6H6"
            fill="none"
            stroke="#b5452c"
            strokeWidth={1.6}
          />
          <circle r={10} fill="url(#shade-dome)" opacity={0.5} />
        </g>
      )}
      {props.kind === 'rain' && (
        <g transform="translate(0 -44)">
          {/* The sensing board: two combs of bare track that water joins. */}
          <rect x={-30} y={-10} width={60} height={20} rx={2} fill="#20242a" />
          <path
            d={[-24, -16, -8, 0, 8, 16, 24]
              .map((x, i) => (i % 2 === 0 ? `M${x} -7V5` : `M${x} -5V7`))
              .join('')}
            stroke="#d9b65c"
            strokeWidth={2.6}
            strokeLinecap="round"
          />
          <path d="M-24 -7.4H24M-16 7.4H16" stroke="#d9b65c" strokeWidth={1.6} />
        </g>
      )}
      {props.kind === 'mq135' && (
        <g transform="translate(-14 -40)">
          {/* The sensor's can, with the mesh the air reaches the heater through. */}
          <circle cx={1.2} cy={2.5} r={14} fill="#000" opacity={0.28} />
          <circle r={14} fill="url(#shade-metal)" stroke="#5d666a" />
          <circle r={10} fill="#23282a" />
          <circle r={10} fill="url(#mesh)" />
          <circle r={10} fill="url(#shade-dome)" opacity={0.45} />
        </g>
      )}
      {/* The trimmer: a blue block with a brass screw. */}
      <g
        transform={
          props.kind === 'mq135' ? 'translate(20 -46)' : `translate(${-length / 2 + 4} -20)`
        }
      >
        <rect
          x={-7}
          y={-7}
          width={14}
          height={14}
          rx={1.5}
          fill="#2d6fd2"
          stroke="rgba(0,0,0,.4)"
        />
        <circle r={4.2} fill="#d9b65c" />
        <path d="M-3 0H3M0 -3V3" stroke="#6d5a22" strokeWidth={1.3} />
      </g>
      {/* The indicator beside it. */}
      <g
        transform={
          props.kind === 'mq135' ? 'translate(40 -46)' : `translate(${length / 2 - 2} -20)`
        }
      >
        {props.lit && <circle r={8} fill="#58e07f" opacity={0.35} />}
        <rect
          x={-3.4}
          y={-2.4}
          width={6.8}
          height={4.8}
          rx={1}
          fill={props.lit ? '#58e07f' : '#1f4a2c'}
        />
      </g>
      <text
        x={props.kind === 'mq135' ? 4 : 2}
        y={props.kind === 'mq135' ? -12 : -15.5}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fill="#fff"
        pointerEvents="none"
      >
        {props.label}
      </text>
    </g>
  );
}

/** HC-SR501 motion sensor: a white faceted dome on a small board. */
export function PirView(props: {
  vcc: Point;
  gnd: Point;
  /** Something is moving in front of it. */
  motion: boolean;
  /** Its output is HIGH. */
  high: boolean;
  selected: boolean;
}) {
  const { length, transform } = between(props.vcc, props.gnd);
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      <ModuleBoard x={-length / 2 - 12} y={-54} width={length + 24} height={58} color="#1d6a45" />
      <PinHeader from={-length / 2} to={length / 2} />
      {[-length / 2, 0, length / 2].map((x) => (
        <SolderDot key={x} x={x} />
      ))}
      {/* Movement in front of the sensor, drawn as ripples either side of the dome. */}
      {props.motion && (
        <path
          className="pir-motion"
          d="M-22 -40A12 12 0 0 0 -22 -24M-27 -44A18 18 0 0 0 -27 -20M22 -40A12 12 0 0 1 22 -24M27 -44A18 18 0 0 1 27 -20"
          fill="none"
          stroke="#ffe08a"
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
      <g transform="translate(0 -32)">
        <circle cx={1.2} cy={2.5} r={15} fill="#000" opacity={0.28} />
        <circle r={15} fill="#f2f3ef" stroke="#a9aea8" />
        {/* The lens is moulded in facets. */}
        <path
          d="M-13 -7.5H13M-15 0H15M-13 7.5H13M-7.5 -13V13M0 -15V15M7.5 -13V13"
          stroke="#c9cdc6"
          strokeWidth={0.9}
        />
        <circle r={15} fill="url(#shade-dome)" opacity={0.75} />
      </g>
      <text
        y={-8.5}
        textAnchor="middle"
        fontSize={9.5}
        fontWeight={700}
        fill={props.high ? '#ffe08a' : '#cfe6d8'}
        pointerEvents="none"
      >
        {props.high ? 'HIGH' : 'LOW'}
      </text>
    </g>
  );
}

/** RGB LED module: one clear LED that shows the mixture of its three colours. */
export function RgbLedView(props: {
  first: Point;
  last: Point;
  /** How bright each colour is, 0 to 1. */
  mix: { r: number; g: number; b: number } | undefined;
  state: LedState | undefined;
  selected: boolean;
}) {
  const { length, transform } = between(props.first, props.last);
  const pins = [-length / 2, -length / 6, length / 6, length / 2];
  const { r, g, b } = props.mix ?? { r: 0, g: 0, b: 0 };
  const strongest = Math.max(r, g, b);
  const burned = props.state === 'burned';
  const lit = strongest > 0 && !burned;
  // The colour is the proportion of the three; how much of it there is, the strongest of them.
  const part = (value: number) => Math.round((255 * value) / (strongest || 1));
  const colour = `rgb(${part(r)} ${part(g)} ${part(b)})`;
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      <ModuleBoard x={-length / 2 - 12} y={-50} width={length + 24} height={54} color="#1d2023" />
      <PinHeader from={-length / 2} to={length / 2} />
      {pins.map((x) => (
        <SolderDot key={x} x={x} />
      ))}
      <g fontSize={8.5} fontWeight={700} fill="#dfe4e2" textAnchor="middle" pointerEvents="none">
        {['R', 'G', 'B', '−'].map((name, i) => (
          <text key={name} x={pins[i]} y={-9}>
            {name}
          </text>
        ))}
      </g>
      <g transform="translate(0 -32)">
        {lit && (
          <circle
            className="led-glow"
            r={16 + 26 * strongest}
            fill={colour}
            opacity={0.12 + 0.2 * strongest}
            pointerEvents="none"
          />
        )}
        <circle cx={1.2} cy={2.5} r={11} fill="#000" opacity={0.28} />
        <circle r={11} fill={burned ? '#3b3b3b' : '#e3e7e6'} />
        {lit && <circle r={11} fill={colour} opacity={0.35 + 0.65 * strongest} />}
        {lit && <circle r={4.6} fill="#fff" opacity={0.55 * strongest} />}
        <circle r={11} fill="url(#shade-dome)" opacity={burned ? 0.3 : 0.9} />
        <circle r={11} fill="none" stroke="rgba(0,0,0,.4)" strokeWidth={0.8} />
        {burned && (
          <path d="M-5 -5L5 5M5 -5L-5 5" stroke="#d0d0d0" strokeWidth={2} strokeLinecap="round" />
        )}
      </g>
    </g>
  );
}

/**
 * 0.96 inch OLED display. `image` is its picture as an address a browser can
 * draw, or undefined while the panel is dark. The screen is drawn at one screen
 * unit for each of its 128 × 64 pixels.
 */
export function OledView(props: {
  first: Point;
  last: Point;
  image: string | undefined;
  selected: boolean;
}) {
  const { length, transform } = between(props.first, props.last);
  const pins = [-length / 2, -length / 6, length / 6, length / 2];
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      <ModuleBoard x={-74} y={-98} width={148} height={102} color="#1c4f8f" />
      <PinHeader from={-length / 2} to={length / 2} />
      {pins.map((x) => (
        <SolderDot key={x} x={x} />
      ))}
      <g fontSize={7.5} fontWeight={700} fill="#dfe9f5" textAnchor="middle" pointerEvents="none">
        {['GND', 'VCC', 'SCL', 'SDA'].map((name, i) => (
          <text key={name} x={pins[i]} y={-9.5}>
            {name}
          </text>
        ))}
      </g>
      {/* The glass, a little larger than the part of it that lights. */}
      <rect x={-68} y={-90} width={136} height={72} rx={2} fill="#0b0e12" />
      <rect x={-64} y={-86} width={128} height={64} fill="#05070a" />
      {props.image && (
        <image
          href={props.image}
          x={-64}
          y={-86}
          width={128}
          height={64}
          preserveAspectRatio="none"
          style={{ imageRendering: 'pixelated' }}
        />
      )}
      <rect x={-68} y={-90} width={136} height={72} rx={2} fill="url(#shade-board)" opacity={0.5} />
    </g>
  );
}

/**
 * L298N motor driver module: the chip on its heat sink, motor screws on the two
 * sides, and along the bottom the power screws and the six control pins.
 * `terminals` gives each terminal's place from the module's corner.
 */
export function MotorDriverView(props: {
  box: Box;
  terminals: readonly { terminal: string; name: string; at: Point }[];
  /** Whether each enable jumper is in place. */
  jumpers: { ena: boolean; enb: boolean };
  /** True when its logic has power: its light is on. */
  awake: boolean;
  selected: boolean;
}) {
  const { width, height } = props.box;
  const at = (name: string) => props.terminals.find((t) => t.terminal === name)!.at;
  const screw = (point: Point) => (
    <g key={`${point.x}-${point.y}`}>
      <rect x={point.x - 12} y={point.y - 13} width={24} height={26} rx={3} fill="#2c63c9" />
      <rect
        x={point.x - 12}
        y={point.y - 13}
        width={24}
        height={26}
        rx={3}
        fill="url(#shade-side)"
      />
      <circle cx={point.x} cy={point.y} r={7} fill="url(#shade-metal)" stroke="#59626a" />
      <path
        d={`M${point.x - 4.5} ${point.y}H${point.x + 4.5}`}
        stroke="#4b545b"
        strokeWidth={1.8}
      />
    </g>
  );
  const pin = (point: Point) => (
    <g key={`${point.x}-${point.y}`}>
      <rect x={point.x - 9} y={point.y - 9} width={18} height={18} rx={2} fill="#16191b" />
      <circle cx={point.x} cy={point.y} r={4.2} fill="#e2b84a" stroke="#6f5a1c" />
    </g>
  );
  const jumper = (name: 'ena' | 'enb') =>
    props.jumpers[name] && (
      <rect
        x={at(name).x - 8}
        y={at(name).y - 30}
        width={16}
        height={28}
        rx={3}
        fill="#f2c230"
        stroke="#8a6a10"
      />
    );
  return (
    <g transform={`translate(${props.box.x} ${props.box.y})`}>
      {props.selected && (
        <rect
          x={-6}
          y={-6}
          width={width + 12}
          height={height + 12}
          rx={14}
          fill={SELECTION}
          opacity={0.4}
        />
      )}
      <rect x={3} y={6} width={width} height={height} rx={8} fill="#000" opacity={0.3} />
      <rect width={width} height={height} rx={8} fill="#a8261f" />
      <rect width={width} height={height} rx={8} fill="url(#shade-board)" />
      <rect width={width} height={height} rx={8} fill="none" stroke="rgba(0,0,0,.5)" />
      {/* The heat sink, with the chip in front of it. */}
      <rect x={64} y={14} width={108} height={58} rx={3} fill="#1b1e21" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((fin) => (
        <rect key={fin} x={70 + fin * 13} y={14} width={5} height={58} fill="#34393d" />
      ))}
      <rect x={84} y={66} width={68} height={24} rx={2} fill="#101214" />
      <text x={118} y={82} textAnchor="middle" fontSize={11} fontWeight={700} fill="#aeb6ba">
        L298N
      </text>
      {/* The regulator and the module's light. */}
      <rect x={38} y={102} width={26} height={18} rx={2} fill="#101214" />
      {props.awake && <circle cx={84} cy={111} r={8} fill="#ff5340" opacity={0.35} />}
      <circle cx={84} cy={111} r={3.2} fill={props.awake ? '#ff5340' : '#5a1f1a'} />
      {['out1', 'out2', 'out3', 'out4', 'vs', 'gnd', '5v'].map((name) => screw(at(name)))}
      {['ena', 'in1', 'in2', 'in3', 'in4', 'enb'].map((name) => pin(at(name)))}
      {jumper('ena')}
      {jumper('enb')}
      <g fontSize={8.5} fontWeight={700} fill="#ffe9e6" textAnchor="middle" pointerEvents="none">
        {props.terminals.map(({ terminal, name, at: point }) => {
          const side = terminal.startsWith('out');
          const left = point.x < width / 2;
          return (
            <text
              key={terminal}
              x={side ? point.x + (left ? 28 : -28) : point.x}
              y={side ? point.y + 3 : point.y + 20}
            >
              {name}
            </text>
          );
        })}
      </g>
    </g>
  );
}

/** Relay: coil legs on the left, contact legs on the right. The bar closes when the coil is energised. */
export function RelayView(props: {
  first: Point;
  last: Point;
  closed: boolean;
  selected: boolean;
}) {
  const { length, transform } = between(props.first, props.last);
  const box = { x: -length / 2 - 10, y: -36, width: length + 20, height: 42, rx: 4 };
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      <Shadow {...box} />
      {/* The blue plastic case; what is inside is drawn on its lid. */}
      <rect {...box} fill="#2456a6" />
      <rect {...box} fill="url(#shade-side)" />
      <rect {...box} fill="none" stroke="#153564" />
      <rect
        x={box.x + 3}
        y={-33}
        width={box.width - 6}
        height={2}
        rx={1}
        fill="#fff"
        opacity={0.22}
      />
      {[0, PITCH, length - PITCH, length].map((x) => (
        <SolderDot key={x} x={x - length / 2} />
      ))}
      {/* Coil */}
      <path
        d={`M${-length / 2} -6V-18q4 -6 8 0q4 -6 8 0q4 -6 8 0V-6`}
        fill="none"
        stroke="#f2cf1d"
        strokeWidth={2}
      />
      {/* Contact */}
      <path d={`M${length / 2 - PITCH} -6V-20`} stroke="#e9ecea" strokeWidth={2} fill="none" />
      <path d={`M${length / 2} -6V-14`} stroke="#e9ecea" strokeWidth={2} fill="none" />
      <line
        x1={length / 2 - PITCH}
        y1={-20}
        x2={length / 2 + (props.closed ? 0 : -4)}
        y2={props.closed ? -14 : -29}
        stroke={props.closed ? '#55e584' : '#e9ecea'}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
    </g>
  );
}

/** Hobby servo: the arm on top turns to the commanded angle (straight up is 90°). */
export function ServoView(props: {
  gnd: Point;
  signal: Point;
  angle: number | undefined;
  selected: boolean;
}) {
  const { length, transform } = between(props.gnd, props.signal);
  const body = { x: -length / 2 - 12, y: -46, width: length + 24, height: 50, rx: 5 };
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      <Shadow {...body} />
      {/* Mounting ears on both sides, each with a screw hole. */}
      {[body.x - 9, body.x + body.width - 3].map((x) => (
        <g key={x}>
          <rect x={x} y={-33} width={12} height={16} rx={2} fill="#1d4a92" stroke="#153564" />
          <circle cx={x + 6} cy={-25} r={2.6} fill="#174a40" />
        </g>
      ))}
      <rect {...body} fill="#2456a6" />
      <rect {...body} fill="url(#shade-side)" />
      <rect {...body} fill="none" stroke="#153564" />
      <PinHeader from={-length / 2} to={length / 2} />
      {/* Brown is ground, red is power, orange is the signal: the colours of a real servo lead. */}
      {[-length / 2, 0, length / 2].map((x, i) => (
        <SolderDot key={x} x={x} color={['#7b4a21', '#d8342a', '#ef7d1a'][i]} />
      ))}
      <circle cy={-24} r={14} fill="#1d4a92" />
      <circle cy={-24} r={12.4} fill="#e9ecea" stroke="#8d9396" />
      <circle cy={-24} r={12.4} fill="url(#shade-dome)" opacity={0.6} />
      <g transform={`translate(0 -24) rotate(${(props.angle ?? 90) - 90})`}>
        <path
          d="M-4.2 2L-2.8 -19a2.8 2.8 0 0 1 5.6 0L4.2 2a4.2 4.2 0 0 1 -8.4 0Z"
          fill="#f8faf9"
          stroke="#6d7578"
        />
        {[-17, -12.5, -8].map((cy) => (
          <circle key={cy} cy={cy} r={1} fill="#8d9396" />
        ))}
        <circle r={2.6} fill="url(#shade-metal)" stroke="#3a4245" />
        <path d="M-1.6 0h3.2M0 -1.6v3.2" stroke="#3a4245" strokeWidth={0.8} />
      </g>
    </g>
  );
}

/** HC-SR04 ultrasonic sensor: two round transducers on a small board. */
export function UltrasonicView(props: {
  vcc: Point;
  gnd: Point;
  label: string;
  selected: boolean;
}) {
  const { length, transform } = between(props.vcc, props.gnd);
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      <ModuleBoard x={-length / 2 - 14} y={-48} width={length + 28} height={52} color="#1f5fa8" />
      <PinHeader from={-length / 2} to={length / 2} />
      {[-length / 2, -length / 6, length / 6, length / 2].map((x) => (
        <SolderDot key={x} x={x} />
      ))}
      {/* The two transducers: metal cans with a fine mesh over the opening. */}
      {[-length / 2 + 4, length / 2 - 4].map((x) => (
        <g key={x}>
          <circle cx={x + 1.2} cy={-25.5} r={13} fill="#000" opacity={0.28} />
          <circle cx={x} cy={-28} r={13} fill="url(#shade-metal)" stroke="#5d666a" />
          <circle cx={x} cy={-28} r={9.2} fill="#23282a" />
          <circle cx={x} cy={-28} r={9.2} fill="url(#mesh)" />
          <circle cx={x} cy={-28} r={9.2} fill="url(#shade-dome)" opacity={0.45} />
        </g>
      ))}
      {/* The crystal that times the pulses sits between them. */}
      <rect
        x={-7}
        y={-43}
        width={14}
        height={6}
        rx={3}
        fill="url(#shade-metal)"
        stroke="#5d666a"
        strokeWidth={0.7}
      />
      <text
        y={-9.5}
        textAnchor="middle"
        fontSize={10}
        fontWeight={700}
        fill="#fff"
        pointerEvents="none"
      >
        {props.label}
      </text>
    </g>
  );
}

/** 16 × 2 character LCD. `lines` is what it shows; undefined while it is off. */
export function LcdView(props: {
  first: Point;
  last: Point;
  lines: [string, string] | undefined;
  selected: boolean;
}) {
  const { length, transform } = between(props.first, props.last);
  const cell = (length - 16) / 16;
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      <ModuleBoard x={-length / 2 - 14} y={-104} width={length + 28} height={110} color="#17603c" />
      {/* Two more mounting holes in the bottom corners. */}
      {[-length / 2 - 8.5, length / 2 + 8.5].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={-18} r={3.1} fill="#d9b65c" />
          <circle cx={cx} cy={-18} r={1.9} fill="#174a40" />
        </g>
      ))}
      <PinHeader from={-length / 2} to={length / 2} />
      {Array.from({ length: 16 }, (_, i) => (
        <SolderDot key={i} x={-length / 2 + (i * length) / 15} />
      ))}
      {/* The metal bezel clipped over the glass, then the glass itself. */}
      <rect x={-length / 2 - 3} y={-93} width={length + 6} height={68} rx={3} fill="#0c1a12" />
      <rect
        x={-length / 2 - 3}
        y={-93}
        width={length + 6}
        height={68}
        rx={3}
        fill="url(#shade-side)"
      />
      <rect
        x={-length / 2 + 4}
        y={-86}
        width={length - 8}
        height={54}
        rx={2}
        fill={props.lines ? '#b9d23c' : '#5e6f2c'}
      />
      {/* Each character has its own block of dots, faintly visible even when blank. */}
      <g fill="#000" opacity={props.lines ? 0.07 : 0.12}>
        {[0, 1].flatMap((row) =>
          Array.from({ length: 16 }, (_, column) => (
            <rect
              key={`${row}-${column}`}
              x={-length / 2 + 8 + cell * column + 1}
              y={-82 + row * 24}
              width={cell - 2}
              height={21}
              rx={1}
            />
          )),
        )}
      </g>
      <rect
        x={-length / 2 + 4}
        y={-86}
        width={length - 8}
        height={54}
        rx={2}
        fill="url(#shade-board)"
      />
      <g
        fontFamily="ui-monospace, Menlo, Consolas, monospace"
        fontSize={19}
        fontWeight={700}
        fill="#1c2a10"
        textAnchor="middle"
        pointerEvents="none"
      >
        {props.lines?.flatMap((line, row) =>
          [...line].map((character, column) =>
            character === ' ' ? null : (
              <text
                key={`${row}-${column}`}
                x={-length / 2 + 8 + cell * (column + 0.5)}
                y={-65 + row * 24}
              >
                {character}
              </text>
            ),
          ),
        )}
      </g>
      <g
        fontSize={6.5}
        fontWeight={600}
        fill="#fff"
        opacity={0.85}
        textAnchor="middle"
        pointerEvents="none"
      >
        {[
          'VSS',
          'VDD',
          'V0',
          'RS',
          'RW',
          'E',
          'D0',
          'D1',
          'D2',
          'D3',
          'D4',
          'D5',
          'D6',
          'D7',
          'A',
          'K',
        ].map((name, i) => (
          <text key={name} x={-length / 2 + (i * length) / 15} y={-11}>
            {name}
          </text>
        ))}
      </g>
    </g>
  );
}
