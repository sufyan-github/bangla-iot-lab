import type { LedColor } from '@banglalab/shared';
import type { LedState } from '@banglalab/simulation';
import { PITCH, type Point } from './geometry';
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
