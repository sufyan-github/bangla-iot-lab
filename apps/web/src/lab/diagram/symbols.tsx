import { LOGIC_CHIP_GATES, type CircuitComponent, type GateKind } from '@banglalab/shared';
import type { ReactNode } from 'react';
import { GATE_CELL, gatesInUse, pinLabel, type DiagramPart } from './layout';

/**
 * Schematic symbols, drawn the way school textbooks draw them. Each is drawn
 * from its left leg at (0, 0) to its right leg at (80, 0) unless noted, in the
 * current stroke colour. Pure SVG: no state.
 */

const W = 80;
const ZIGZAG = 'M20 0l3.3-8 6.7 16 6.7-16 6.7 16 6.7-16 6.6 16 3.3-8';

/** What a symbol may show of the running circuit. */
export interface SymbolState {
  /** 0 to 1 for an LED that is lit. */
  brightness: number;
  /** Colour an LED glows in. */
  glow: string;
  /** True for a switch that is closed or a button held down. */
  closed: boolean;
}

function Arrows({ inward }: { inward: boolean }) {
  // Two small arrows: light leaving an LED, or falling on a light sensor.
  const one = inward
    ? 'M-9 -9L0 0M0 0l-5.5 -1.2M0 0l-1.2 -5.5'
    : 'M0 0l9 -9M9 -9l-5.5 1.2M9 -9l-1.2 5.5';
  return (
    <g strokeWidth={1.6}>
      <path d={one} transform={inward ? 'translate(30 -22)' : 'translate(40 -17)'} />
      <path d={one} transform={inward ? 'translate(42 -24)' : 'translate(50 -14)'} />
    </g>
  );
}

function twoLegSymbol(type: CircuitComponent['type'], state: SymbolState): ReactNode {
  switch (type) {
    case 'resistor':
      return <path d={`M0 0H20${ZIGZAG.slice(5)}H${W}`} />;
    case 'cell':
      // A cell: the long plate is +, on the first leg's side.
      return (
        <>
          <path d="M0 0H35M45 0H80M35 -13V13" />
          <path d="M45 -7V7" strokeWidth={4.5} />
        </>
      );
    case 'solar':
      // A solar cell: a cell in a circle, with light falling on it.
      return (
        <>
          <path d="M0 0H26M54 0H80" />
          <circle cx={40} cy={0} r={14} fill="var(--color-surface)" />
          <path d="M37 -9V9" />
          <path d="M43 -5V5" strokeWidth={3.5} />
          {/* Light falling on it from the upper right, clear of the name above it. */}
          <path d="M62 -24l-7 9M70 -20l-7 9" strokeWidth={1.4} />
          <path d="M55 -15l4 -1.2M55 -15l0.8 -4M63 -11l4 -1.2M63 -11l0.8 -4" strokeWidth={1.4} />
        </>
      );
    case 'led':
    case 'diode':
      return (
        <>
          <path d={`M0 0H29M51 0H${W}M51 -12V12`} />
          <path
            d="M29 -12V12L51 0Z"
            fill={type === 'led' && state.brightness > 0 ? state.glow : 'var(--color-surface)'}
            fillOpacity={
              type === 'led' && state.brightness > 0 ? 0.45 + 0.55 * state.brightness : 1
            }
          />
          {type === 'led' && <Arrows inward={false} />}
        </>
      );
    case 'capacitor':
      return <path d={`M0 0H36M44 0H${W}M36 -13V13M44 -13V13`} />;
    case 'button':
      return (
        <>
          <path d={`M0 0H24M56 0H${W}`} />
          <path d={state.closed ? 'M22 -2H58M40 -2V-14' : 'M22 -10H58M40 -10V-22'} />
          <circle cx={24} cy={0} r={2.6} fill="var(--color-surface)" />
          <circle cx={56} cy={0} r={2.6} fill="var(--color-surface)" />
        </>
      );
    case 'switch':
      return (
        <>
          <path d={`M0 0H24M56 0H${W}`} />
          <path d={state.closed ? 'M24 0H56' : 'M24 0L53 -15'} />
          <circle cx={24} cy={0} r={2.6} fill="var(--color-surface)" />
          <circle cx={56} cy={0} r={2.6} fill="var(--color-surface)" />
        </>
      );
    case 'ldr':
      return (
        <>
          <path d={`M0 0H20${ZIGZAG.slice(5)}H${W}`} />
          <circle cx={40} cy={0} r={24} />
          <Arrows inward />
        </>
      );
    case 'buzzer':
      return (
        <>
          <path d={`M0 0H26M54 0H${W}`} />
          <path d="M24 10A16 16 0 0 1 56 10Z" fill="var(--color-surface)" />
          <path d="M26 10V0M54 10V0" />
        </>
      );
    case 'motor':
      return (
        <>
          <path d={`M0 0H23M57 0H${W}`} />
          <circle cx={40} cy={0} r={17} fill="var(--color-surface)" />
          <text
            x={40}
            y={6}
            textAnchor="middle"
            fontSize={17}
            fontWeight={700}
            stroke="none"
            fill="currentColor"
          >
            M
          </text>
        </>
      );
    default:
      return <path d={`M0 0H${W}`} />;
  }
}

/**
 * A gate drawn as in a textbook, its body from x to x + 30 around the line y:
 * AND flat-backed with a round front, OR curved, XOR with a second curve
 * behind, NOT a triangle; a small circle on the output inverts it.
 */
function GateSymbol(props: {
  kind: GateKind;
  x: number;
  y: number;
  inputs: string[];
  output: string;
}) {
  const { kind, x, y } = props;
  const inverted = kind === 'NAND' || kind === 'NOR' || kind === 'NOT';
  const end = kind === 'NOT' ? x + 22 : x + 30;
  const outX = end + (inverted ? 6 : 0);
  const body =
    kind === 'NOT'
      ? `M${x} ${y - 10}L${end} ${y}L${x} ${y + 10}Z`
      : kind === 'AND' || kind === 'NAND'
        ? `M${x} ${y - 12}H${x + 18}A12 12 0 0 1 ${x + 18} ${y + 12}H${x}Z`
        : `M${x} ${y - 12}Q${x + 22} ${y - 12} ${end} ${y}Q${x + 22} ${y + 12} ${x} ${y + 12}Q${x + 7} ${y} ${x} ${y - 12}Z`;
  const inputY = props.inputs.length === 1 ? [y] : [y - 6, y + 6];
  // An OR's back is curved, so its input lines reach a little further in.
  const inputEnd = kind === 'OR' || kind === 'NOR' || kind === 'XOR' ? x + 4 : x;
  const label = { fontSize: 7.5, fontWeight: 600, stroke: 'none', fill: 'var(--color-ink-soft)' };
  return (
    <g strokeWidth={1.4}>
      {inputY.map((iy, i) => (
        <g key={i}>
          <path d={`M${x - 9} ${iy}H${inputEnd}`} />
          <text x={x - 11} y={iy + 2.6} textAnchor="end" {...label}>
            {props.inputs[i]}
          </text>
        </g>
      ))}
      {kind === 'XOR' && (
        <path d={`M${x - 5} ${y - 12}Q${x + 2} ${y} ${x - 5} ${y + 12}`} fill="none" />
      )}
      <path d={body} fill="var(--color-surface)" />
      {inverted && <circle cx={end + 3} cy={y} r={3} fill="var(--color-surface)" />}
      <path d={`M${outX} ${y}H${outX + 8}`} />
      <text x={outX + 10} y={y + 2.6} {...label}>
        {props.output}
      </text>
    </g>
  );
}

/** A logic chip's gates in use, in a row across its box. */
function ChipGates({ part }: { part: DiagramPart }) {
  const { component } = part;
  if (component.type !== 'logic') return null;
  const connected = new Set(part.pins.filter((pin) => pin.net !== null).map((pin) => pin.name));
  const used = gatesInUse(component, (name) => connected.has(name));
  const { kind, gates } = LOGIC_CHIP_GATES[component.props.chip];
  const box = part.box!;
  const y = box.top + box.height / 2 + 10;
  const start = (box.width - used.length * GATE_CELL) / 2;
  const name = (n: number) => pinLabel(component, `p${n}`);
  return (
    <g data-gates={used.length}>
      {used.map((index, i) => (
        <GateSymbol
          key={index}
          kind={kind}
          x={start + i * GATE_CELL + 24}
          y={y}
          inputs={gates[index]!.inputs.map(name)}
          output={name(gates[index]!.output)}
        />
      ))}
    </g>
  );
}

/** A box symbol: each leg runs from its tip to the nearest edge, with its name just inside. */
function BoxSymbol({ part, name }: { part: DiagramPart; name: string }) {
  const box = part.box!;
  const bottom = box.top + box.height;
  return (
    <>
      <rect
        x={0}
        y={box.top}
        width={box.width}
        height={box.height}
        rx={5}
        fill="var(--color-surface)"
      />
      <text
        x={box.width / 2}
        y={part.component.type === 'logic' ? box.top + 25 : box.top + box.height / 2 + 4.5}
        textAnchor="middle"
        fontSize={12.5}
        fontWeight={700}
        stroke="none"
        fill="currentColor"
      >
        {name}
        {part.component.type === 'logic' && (
          <tspan dx={6} fontWeight={600} fill="var(--color-ink-soft)">
            {part.component.props.chip}
          </tspan>
        )}
      </text>
      <ChipGates part={part} />
      {part.pins.map((pin) => {
        const x = pin.x - part.x;
        const y = pin.y - part.y;
        const sideways = pin.side === 'left' || pin.side === 'right';
        const leg = sideways
          ? `M${pin.side === 'left' ? 0 : box.width} ${y}H${x}`
          : `M${x} ${pin.side === 'up' ? box.top : bottom}V${y}`;
        const label = sideways
          ? { x: pin.side === 'left' ? 5 : box.width - 5, y: y + 3 }
          : { x, y: pin.side === 'up' ? box.top + 11 : bottom - 4.5 };
        return (
          <g key={pin.name}>
            <path d={leg} />
            <text
              {...label}
              textAnchor={sideways ? (pin.side === 'left' ? 'start' : 'end') : 'middle'}
              fontSize={8.5}
              fontWeight={600}
              stroke="none"
              fill="var(--color-ink-soft)"
            >
              {pin.label}
            </text>
          </g>
        );
      })}
    </>
  );
}

/** One part's symbol, drawn from its left edge on the baseline. */
export function PartSymbol(props: { part: DiagramPart; name: string; state: SymbolState }) {
  const { part, state } = props;
  const { component } = part;
  if (part.box) return <BoxSymbol part={part} name={props.name} />;

  if (component.type === 'battery') {
    return (
      <>
        <path d="M20 -30V-6M20 6V30M5 -6H35" />
        <path d="M12 6H28" strokeWidth={4.5} />
        <path d="M27 -20h7M30.5 -23.5v7" strokeWidth={1.5} />
      </>
    );
  }
  if (component.type === 'transistor') {
    return (
      <>
        <circle cx={34} cy={0} r={21} fill="var(--color-surface)" />
        <path d="M0 0H25M40 -30V-17L25 -6M25 6L40 17V30" />
        <path d="M25 -13V13" strokeWidth={3.4} />
        <path d="M40 17l-8.5 -1.5 4.4 -6z" fill="currentColor" strokeWidth={1} />
      </>
    );
  }
  if (component.type === 'potentiometer') {
    const wiper = part.pins.find((pin) => pin.name === 'wiper')!;
    const up = wiper.side === 'up';
    const wiperY = wiper.y - part.y;
    const tip = up ? -9 : 9;
    return (
      <>
        <path d={`M0 0H20${ZIGZAG.slice(5)}H${W}`} />
        <path d={`M40 ${wiperY}V${tip}`} />
        <path d={`M40 ${tip}l-4.5 ${up ? -7 : 7}h9z`} fill="currentColor" strokeWidth={1} />
      </>
    );
  }
  // Polarised parts are mirrored when their second leg faces the supply.
  return (
    <g transform={part.flipped ? `translate(${W} 0) scale(-1 1)` : undefined}>
      {twoLegSymbol(component.type, state)}
    </g>
  );
}
