import type { LedColor } from '@banglalab/shared';
import type { LedState } from '@banglalab/simulation';
import { PITCH, UNO_BOX, UNO_SOCKETS, type Point } from './geometry';
import { resistorBands } from './resistor-bands';

/** Drawings of the parts. Pure SVG: no state, no event handling. */

const LEG = '#aab3b6';
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

export function ResistorView(props: { a: Point; b: Point; resistance: number; selected: boolean }) {
  const { length, transform } = between(props.a, props.b);
  const body = Math.min(54, Math.max(20, length - 14));
  const bands = resistorBands(props.resistance);
  const bandAt = [0.16, 0.34, 0.52, 0.8];
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      <line x1={-length / 2} x2={length / 2} stroke={LEG} strokeWidth={2.6} strokeLinecap="round" />
      <rect x={-body / 2} y={-8} width={body} height={16} rx={7} fill="#e2c89d" stroke="#b3955f" />
      {bands.map((color, i) => (
        <rect
          key={i}
          x={-body / 2 + body * bandAt[i]! - 2}
          y={-8}
          width={4}
          height={16}
          fill={color}
        />
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
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      {lit && (
        <circle
          className="led-glow"
          r={16 + 30 * props.brightness}
          fill={`url(#glow-${props.color})`}
          opacity={0.45 + 0.55 * props.brightness}
          pointerEvents="none"
        />
      )}
      <line x1={-length / 2} x2={length / 2} stroke={LEG} strokeWidth={2.6} strokeLinecap="round" />
      <circle r={10.5} fill={burned ? '#3b3b3b' : paint.off} stroke="rgba(0,0,0,.45)" />
      {lit && <circle r={10.5} fill={paint.on} opacity={0.35 + 0.65 * props.brightness} />}
      {/* The flat edge marks the cathode (−), as on a real LED. */}
      <line x1={8.2} x2={8.2} y1={-6.4} y2={6.4} stroke="rgba(0,0,0,.55)" strokeWidth={2.2} />
      <circle cx={-3} cy={-3.5} r={2.6} fill="#fff" opacity={burned ? 0.08 : 0.35} />
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
  positive: Point;
  negative: Point;
  selected: boolean;
}) {
  const { x, y, width, height } = props.box;
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
      <line
        x1={x + width}
        y1={props.positive.y}
        x2={props.positive.x}
        y2={props.positive.y}
        stroke={LEG}
        strokeWidth={5}
      />
      <line
        x1={x + width}
        y1={props.negative.y}
        x2={props.negative.x}
        y2={props.negative.y}
        stroke={LEG}
        strokeWidth={5}
      />
      <circle
        cx={props.positive.x}
        cy={props.positive.y}
        r={8.5}
        fill="#d9b65c"
        stroke="#8a6d1f"
        strokeWidth={1.5}
      />
      <circle
        cx={props.negative.x}
        cy={props.negative.y}
        r={8.5}
        fill="#d9b65c"
        stroke="#8a6d1f"
        strokeWidth={1.5}
      />
      <rect x={x} y={y} width={width} height={height} rx={11} fill="#262d2f" />
      <rect x={x} y={y} width={width} height={34} rx={11} fill="#e8a21a" />
      <rect x={x} y={y + 22} width={width} height={12} fill="#e8a21a" />
      <text
        x={x + width / 2}
        y={y + 96}
        textAnchor="middle"
        fontSize={30}
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

/** Path of a wire: a gentle sag so wires that share a row stay tellable apart. */
export function wirePath(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  let nx = -dy / length;
  let ny = dx / length;
  if (ny < 0 || (ny === 0 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const sag = Math.min(PITCH * 0.9, length * 0.14);
  const cx = (from.x + to.x) / 2 + nx * sag;
  const cy = (from.y + to.y) / 2 + ny * sag;
  return `M${from.x} ${from.y}Q${cx} ${cy} ${to.x} ${to.y}`;
}

export function WireView(props: {
  from: Point;
  to: Point;
  color: string;
  /** Amperes from `from` to `to`; undefined while the circuit is stopped. */
  current: number | undefined;
  selected: boolean;
}) {
  const d = wirePath(props.from, props.to);
  const flowing = props.current !== undefined && Math.abs(props.current) > 1e-6;
  return (
    <g fill="none" strokeLinecap="round">
      {props.selected && <path d={d} stroke={SELECTION} strokeWidth={16} opacity={0.5} />}
      <path d={d} stroke="rgba(0,0,0,.4)" strokeWidth={7.5} />
      <path d={d} stroke={props.color} strokeWidth={5.5} />
      {flowing && (
        <path
          d={d}
          className={props.current! < 0 ? 'wire-flow wire-flow-reverse' : 'wire-flow'}
          stroke="rgba(255,255,255,.92)"
          strokeWidth={2.2}
          strokeDasharray="3 11"
        />
      )}
      <circle cx={props.from.x} cy={props.from.y} r={4.2} fill="#2a2f31" />
      <circle cx={props.to.x} cy={props.to.y} r={4.2} fill="#2a2f31" />
    </g>
  );
}

/** Tactile push button seen from above. The cap sinks and darkens while held. */
export function ButtonView(props: { a: Point; b: Point; pressed: boolean; selected: boolean }) {
  const { length, transform } = between(props.a, props.b);
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      <line x1={-length / 2} x2={length / 2} stroke={LEG} strokeWidth={2.6} strokeLinecap="round" />
      <rect x={-13} y={-13} width={26} height={26} rx={4} fill="#2c3133" stroke="#15191b" />
      <circle
        r={props.pressed ? 7.5 : 9}
        fill={props.pressed ? '#9d241c' : '#e0493e'}
        stroke="rgba(0,0,0,.4)"
      />
      {!props.pressed && <circle cx={-2.5} cy={-3} r={2.4} fill="#fff" opacity={0.35} />}
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
  return (
    <g transform={transform}>
      {props.selected && <SelectionHalo length={length} />}
      <rect
        x={-length / 2 - 9}
        y={-15}
        width={length + 18}
        height={30}
        rx={5}
        fill="#2b62b0"
        stroke="#1b3f73"
      />
      {[-length / 2, 0, length / 2].map((x) => (
        <circle key={x} cx={x} cy={11} r={2.4} fill={LEG} />
      ))}
      <circle r={12} fill="#e9ecea" stroke="#8d9396" strokeWidth={1.5} />
      <line
        y2={-10}
        stroke="#13231f"
        strokeWidth={3}
        strokeLinecap="round"
        transform={`rotate(${angle})`}
      />
    </g>
  );
}

/** The UNO board with its two rows of sockets. `ledLevel` is how bright the pin 13 LED is, 0 to 1. */
export function UnoView(props: { ledLevel: number; powered: boolean; selected: boolean }) {
  const { x, y, width, height } = UNO_BOX;
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
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={10}
        fill="#0f7a86"
        stroke="#0a5a63"
        strokeWidth={2}
      />
      {/* USB socket, power jack and the processor */}
      <rect x={x - 12} y={y + 38} width={58} height={44} rx={3} fill="#b9c0c4" stroke="#8d9396" />
      <rect x={x - 6} y={y + 122} width={46} height={40} rx={3} fill="#22282b" />
      <rect x={x + 250} y={y + 96} width={170} height={34} rx={3} fill="#1b1f21" />
      <text x={x + 335} y={y + 117} textAnchor="middle" fontSize={10} fill="#8b979c">
        ATmega328P
      </text>
      <text
        x={x + 150}
        y={y + 112}
        textAnchor="middle"
        fontSize={22}
        fontWeight={700}
        fill="#d7f0f2"
      >
        UNO
      </text>

      {/* Power light and the LED wired to pin 13 */}
      <rect
        x={x + 66}
        y={y + 136}
        width={11}
        height={7}
        rx={2}
        fill={props.powered ? '#7dff9b' : '#2f5d3a'}
      />
      <text x={x + 82} y={y + 143} fontSize={9} fill="#d7f0f2">
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
      <text x={x + 82} y={y + 62} fontSize={9} fill="#d7f0f2">
        L
      </text>

      {UNO_SOCKETS.map(({ terminal, point, label, top }) => (
        <g key={terminal}>
          <rect x={point.x - 8} y={point.y - 8} width={16} height={16} rx={2} fill="#15191b" />
          <rect x={point.x - 3.5} y={point.y - 3.5} width={7} height={7} rx={1} fill="#4a5256" />
          <text
            x={point.x}
            y={point.y + (top ? 22 : -14)}
            textAnchor="middle"
            fontSize={9}
            fontWeight={600}
            fill="#d7f0f2"
          >
            {label}
          </text>
        </g>
      ))}
    </g>
  );
}
