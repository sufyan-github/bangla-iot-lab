import type { CircuitComponent } from '@banglalab/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { LED_PAINT } from '../parts';
import { useLab } from '../store';
import { layoutDiagram, type DiagramNet, type DiagramPart } from './layout';
import { PartSymbol, type SymbolState } from './symbols';

const INK = '#13231f';
const SELECTION = '#e8a21a';

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
  if (type === 'led') return { x: 40, y: 27, anchor: 'middle' };
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
        : '5V';

  if (circuit.components.length === 0) {
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
      className="diagram-paper min-h-0 flex-1 overflow-auto pt-14 pb-4"
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
                  fill={net.kind === 'supply' ? '#b8281f' : '#2f6fd0'}
                >
                  {railName(net)}
                </text>
              )}
            </g>
          ))}

          {layout.parts.map((part) => {
            const place = labelPlace(part);
            const value = valueOf(part.component);
            const selected = part.id === selectedId;
            const top = part.box ? -part.box.height / 2 - 14 : -34;
            const height = part.box ? part.box.height + 28 : 68;
            return (
              <g
                key={part.id}
                data-symbol={part.id}
                data-type={part.component.type}
                data-selected={selected}
                transform={`translate(${part.x} ${layout.baseline})`}
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
                        fill="#4b5d57"
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
