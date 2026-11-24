import { partsOf, type CircuitComponent } from '@banglalab/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { LED_PAINT } from '../parts';
import { useLab } from '../store';
import { currentFlows } from './flow';
import { layoutDiagram, type DiagramNet, type DiagramPart } from './layout';
import { PartSymbol, type SymbolState } from './symbols';

const INK = 'var(--color-ink)';
const SELECTION = '#e8a21a';
/** Which way a flag's stem leaves the wire. */
const STEM = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] } as const;

/** Where a symbol's name and value are written, relative to its left edge and the baseline. */
function labelPlace(part: DiagramPart): {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
} {
  const { type } = part.component;
  if (type === 'battery') return { x: -6, y: -3, anchor: 'end' };
  if (type === 'transistor') return { x: 6, y: -27, anchor: 'middle' };
  if (type === 'potentiometer') {
    const wiperUp = part.pins.some((pin) => pin.name === 'wiper' && pin.side === 'up');
    return { x: 40, y: wiperUp ? 24 : -17, anchor: 'middle' };
  }
  if (type === 'ldr') return { x: 40, y: -32, anchor: 'middle' };
  // An LED's arrows and a button's plunger are above the line, so their names go below it.
  if (type === 'led' || type === 'button') return { x: 40, y: 27, anchor: 'middle' };
  return { x: 40, y: -19, anchor: 'middle' };
}

/**
 * The circuit as a schematic diagram, drawn from the breadboard and kept in
 * step with it. It is for reading, not editing: tapping a symbol selects that
 * part, so its settings and its place on the breadboard are easy to find.
 */
export function Diagram() {
  const circuit = useLab((s) => s.circuit);
  const result = useLab((s) => s.result);
  const pressed = useLab((s) => s.pressed);
  const selectedId = useLab((s) => s.selectedId);
  const { select } = useLab.getState();
  const { t, quantity } = useT();
  const layout = useMemo(() => layoutDiagram(circuit), [circuit]);
  // While the circuit runs, moving dashes show where current flows and which way.
  const legCurrents = result?.legCurrents;
  const flows = useMemo(
    () => (legCurrents ? currentFlows(layout, legCurrents) : []),
    [layout, legCurrents],
  );

  const frameRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    // Fill the width when the diagram is small; never shrink below a readable size.
    const measure = () =>
      setZoom(Math.min(1.7, Math.max(0.85, (frame.clientWidth - 24) / layout.width)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [layout.width]);

  const valueOf = (component: CircuitComponent): string | null => {
    if (component.type === 'battery') return quantity(component.props.voltage, 'V');
    if (component.type === 'resistor' || component.type === 'potentiometer') {
      return quantity(component.props.resistance, 'Ω');
    }
    if (component.type === 'capacitor') return quantity(component.props.capacitance, 'F');
    return null;
  };
  const stateOf = (component: CircuitComponent): SymbolState => ({
    brightness: result?.readings[component.id]?.led?.brightness ?? 0,
    glow: component.type === 'led' ? LED_PAINT[component.props.color].on : '#ffffff',
    closed:
      (component.type === 'switch' && component.props.closed) || pressed.includes(component.id),
  });
  const railName = (net: DiagramNet) =>
    net.kind === 'ground'
      ? 'GND'
      : net.source?.type === 'battery'
        ? `+${quantity(net.source.voltage, 'V')}`
        : (net.source?.label ?? '5V');

  if (partsOf(circuit).length === 0) {
    return (
      <div className="diagram-paper flex min-h-0 flex-1 items-center justify-center p-6">
        <p className="max-w-sm text-center text-ink-soft" data-testid="diagram-empty">
          {t('diagram.empty')}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={frameRef}
      className="diagram-paper min-h-0 flex-1 overflow-auto py-4"
      data-testid="diagram"
    >
      <svg
        role="img"
        aria-label={t('lab.viewDiagram')}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width * zoom}
        height={layout.height * zoom}
        className="mx-auto block select-none"
        onPointerDown={() => select(null)}
      >
        <g fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          {layout.nets.map((net, index) => (
            <g key={index} data-net={net.kind} data-legs={net.legs.join(' ')}>
              {net.segments.map((s, i) => (
                <path key={i} d={`M${s.x1} ${s.y1}L${s.x2} ${s.y2}`} />
              ))}
              {net.dots.map((dot, i) => (
                <circle key={i} cx={dot.x} cy={dot.y} r={3.6} fill={INK} stroke="none" />
              ))}
              {net.groundAt && (
                <path d={`M${net.groundAt.x} ${net.groundAt.y}h16v9m-10 0h20m-16 5h12m-8.5 5h5`} />
              )}
              {net.labelAt && (
                <text
                  x={net.labelAt.x - 8}
                  y={net.labelAt.y + 4}
                  textAnchor="end"
                  fontSize={12}
                  fontWeight={700}
                  stroke="none"
                  fill={net.kind === 'supply' ? 'var(--color-danger)' : '#2f6fd0'}
                >
                  {railName(net)}
                </text>
              )}
            </g>
          ))}

          {flows.length > 0 && (
            <g
              data-testid="diagram-flow"
              stroke="#e8a21a"
              strokeWidth={3.4}
              strokeDasharray="5 9"
              pointerEvents="none"
            >
              {flows.map((flow, index) => (
                <path
                  key={index}
                  className="wire-flow"
                  data-ma={(flow.amperes * 1000).toFixed(2)}
                  d={`M${flow.from.x} ${flow.from.y}L${flow.to.x} ${flow.to.y}`}
                />
              ))}
            </g>
          )}

          {layout.terminals.map((terminal, index) => {
            const net = layout.nets[terminal.net]!;
            const { x, y } = terminal;
            if (terminal.kind === 'ground') {
              return (
                <path
                  key={index}
                  data-terminal="ground"
                  d={`M${x} ${y}v8m-10 0h20m-16 5h12m-8.5 5h5`}
                />
              );
            }
            if (terminal.kind === 'supply') {
              return (
                <g key={index} data-terminal="supply">
                  <path d={`M${x} ${y}v-8m-8 0h16`} stroke="var(--color-danger)" />
                  <text
                    x={x}
                    y={y - 13}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    stroke="none"
                    fill="var(--color-danger)"
                  >
                    {railName(net)}
                  </text>
                </g>
              );
            }
            // A flag: a short stem, then the name of the net it belongs to.
            const [dx, dy] = STEM[terminal.side];
            const text = terminal.text ?? railName(net);
            const width = text.length * 6.4 + 10;
            const cx = x + dx * (9 + width / 2);
            const cy = y + dy * 17;
            return (
              <g key={index} data-terminal="flag" data-flag={text}>
                <path d={`M${x} ${y}l${dx * 9} ${dy * 9}`} />
                <rect
                  x={cx - width / 2}
                  y={cy - 8}
                  width={width}
                  height={16}
                  rx={4}
                  fill="var(--color-amber-soft)"
                  stroke="var(--color-amber-deep)"
                  strokeWidth={1.2}
                />
                <text
                  x={cx}
                  y={cy + 3.8}
                  textAnchor="middle"
                  fontSize={10.5}
                  fontWeight={700}
                  stroke="none"
                  fill="var(--color-amber-deep)"
                >
                  {text}
                </text>
              </g>
            );
          })}

          {layout.parts.map((part) => {
            const place = labelPlace(part);
            const value = valueOf(part.component);
            const selected = part.id === selectedId;
            const top = part.box ? part.box.top - 14 : -34;
            const height = part.box ? part.box.height + 28 : 68;
            return (
              <g
                key={part.id}
                data-symbol={part.id}
                data-type={part.component.type}
                data-selected={selected}
                transform={`translate(${part.x} ${part.y})`}
                style={{ cursor: 'pointer' }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  select(part.id);
                }}
              >
                <rect
                  x={-6}
                  y={top}
                  width={part.width + 12}
                  height={height}
                  rx={10}
                  stroke="none"
                  fill={selected ? SELECTION : 'transparent'}
                  fillOpacity={0.28}
                />
                <PartSymbol part={part} name={part.id} state={stateOf(part.component)} />
                {!part.box && (
                  <text
                    x={place.x}
                    y={place.y}
                    textAnchor={place.anchor}
                    fontSize={11.5}
                    stroke="none"
                    fill={INK}
                  >
                    <tspan fontWeight={700}>{part.id}</tspan>
                    {value && (
                      <tspan
                        fill="var(--color-ink-soft)"
                        {...(part.component.type === 'battery'
                          ? { x: place.x, dy: 14 }
                          : { dx: 5 })}
                      >
                        {value}
                      </tspan>
                    )}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
