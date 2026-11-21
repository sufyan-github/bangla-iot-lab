import type { CircuitComponent } from '@banglalab/shared';
import type { ReactNode } from 'react';
import type { DiagramPart } from './layout';

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
        y={box.top + box.height / 2 + 4.5}
        textAnchor="middle"
        fontSize={12.5}
        fontWeight={700}
        stroke="none"
        fill="currentColor"
      >
        {name}
      </text>
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
