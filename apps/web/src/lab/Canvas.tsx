import {
  hasFlexibleLeads,
  moveWireEnd,
  movePart,
  movePin,
  type CircuitDocument,
  type EditError,
  type EditResult,
} from '@banglalab/shared';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useT } from '../i18n';
import {
  CANVAS_WIDTH,
  HOLE_POINTS,
  PITCH,
  UNO_BOX,
  UNO_SOCKETS,
  canvasHeight,
  endpointNear,
  endpointPoint,
  holeNear,
  holePoint,
  type Point,
} from './geometry';
import { wirePath } from './parts';
import { Scene } from './Scene';
import { useLab } from './store';

/** What is being dragged, and the circuit as it was when the drag began. */
type Drag = {
  id: string;
  origin: CircuitDocument;
  /** Where the pointer went down. Movement is measured from here, so a tap never moves anything. */
  grab: Point;
  last: string;
  error: EditError | null;
} & (
  | { kind: 'part' }
  /** `anchor` is where the dragged lead or wire end started. */
  | { kind: 'pin'; pin: string; anchor: Point }
  | { kind: 'wire-end'; end: 'from' | 'to'; anchor: Point }
);

/** How far each module's body rises above its row of legs, in canvas units. */
const BODY_HEIGHT: Partial<Record<string, number>> = {
  temperature: 24,
  soil: 24,
  ir: 24,
  relay: 26,
  servo: 36,
  ultrasonic: 38,
  lcd: 94,
};

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2;

/** The interactive breadboard: the scene plus tap targets and drag handles. */
export function Canvas() {
  const circuit = useLab((s) => s.circuit);
  const result = useLab((s) => s.result);
  const tool = useLab((s) => s.tool);
  const selectedId = useLab((s) => s.selectedId);
  const wireStart = useLab((s) => s.wireStart);
  const running = useLab((s) => s.running);
  const pressed = useLab((s) => s.pressed);
  const boards = useLab((s) => s.boards);
  const { select, tapEndpoint, replaceCircuit, setNotice, setPressed, setProps } =
    useLab.getState();
  const height = canvasHeight(circuit);
  const { t, quantity, number } = useT();

  const frameRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [fitZoom, setFitZoom] = useState(1);
  /** Set once the student uses the zoom buttons; until then the board follows the window. */
  const [chosenZoom, setChosenZoom] = useState<number | null>(null);
  const zoom = chosenZoom ?? fitZoom;

  // Show the whole board when there is room. On touch screens never go below
  // full size, because the holes would be too small to tap; the frame scrolls instead.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const measure = () => {
      const fit = Math.min(1.6, frame.clientWidth / CANVAS_WIDTH);
      setFitZoom(Math.max(coarse ? 1 : 0.5, fit));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const toCanvas = (event: { clientX: number; clientY: number }): Point => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  };

  const startDrag = (event: ReactPointerEvent, next: Drag) => {
    event.stopPropagation();
    event.preventDefault();
    svgRef.current?.setPointerCapture(event.pointerId);
    drag.current = next;
    select(next.id);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const point = toCanvas(event);
    if (tool === 'wire' && wireStart) setPointer(point);
    const active = drag.current;
    if (!active) return;

    let key: string;
    let attempt: () => EditResult;
    const moveX = point.x - active.grab.x;
    const moveY = point.y - active.grab.y;
    if (active.kind === 'part') {
      const dx = Math.round(moveX / PITCH);
      const dy = Math.round(moveY / PITCH);
      key = `${dx},${dy}`;
      attempt = () => movePart(active.origin, active.id, dx, dy);
    } else {
      const moved = { x: active.anchor.x + moveX, y: active.anchor.y + moveY };
      const target = active.kind === 'pin' ? holeNear(moved) : endpointNear(active.origin, moved);
      key = target ?? 'none';
      attempt = () =>
        !target
          ? { ok: false, error: 'no-room' }
          : active.kind === 'pin'
            ? movePin(active.origin, active.id, active.pin, target)
            : moveWireEnd(active.origin, active.id, active.end, target);
    }
    if (key === active.last) return;
    active.last = key;
    const moved = attempt();
    active.error = moved.ok ? null : moved.error;
    if (moved.ok) replaceCircuit(moved.circuit);
  };

  const endDrag = (event: ReactPointerEvent) => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    svgRef.current?.releasePointerCapture(event.pointerId);
    // The part stays at the last valid place; say why it would not go further.
    if (active.error) setNotice(active.error);
  };

  const selecting = tool === 'select';
  const selectedPart = circuit.components.find((c) => c.id === selectedId);
  const selectedWire = circuit.wires.find((w) => w.id === selectedId);
  const startPoint = wireStart ? endpointPoint(circuit, wireStart) : null;
  const dragOf = (id: string, event: ReactPointerEvent) => ({
    id,
    origin: circuit,
    grab: toCanvas(event),
    last: '',
    error: null,
  });

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={frameRef} className="h-full overflow-auto bg-mat" data-testid="canvas-frame">
        <svg
          ref={svgRef}
          role="img"
          aria-label={t('lab.canvasLabel')}
          viewBox={`0 0 ${CANVAS_WIDTH} ${height}`}
          width={CANVAS_WIDTH * zoom}
          height={height * zoom}
          className="mx-auto block select-none"
          style={{ cursor: selecting ? 'default' : 'crosshair' }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerDown={() => selecting && select(null)}
        >
          <Scene
            circuit={circuit}
            result={result}
            selectedId={selectedId}
            pressed={pressed}
            boards={boards}
            batteryLabel={(volts) => quantity(volts, 'V')}
            readingLabel={(amperes) => quantity(amperes, 'A')}
            formatNumber={number}
          />

          {selecting && (
            <g>
              {/* Wires first, so a part lying under a wire can still be picked up. */}
              {circuit.wires.map((wire) => {
                const from = endpointPoint(circuit, wire.from);
                const to = endpointPoint(circuit, wire.to);
                if (!from || !to) return null;
                return (
                  <path
                    key={wire.id}
                    data-hit={wire.id}
                    d={wirePath(from, to)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={18}
                    strokeLinecap="round"
                    style={{ cursor: 'pointer' }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      select(wire.id);
                    }}
                  />
                );
              })}

              {circuit.components.map((component) => {
                if (component.type === 'battery' || component.type === 'uno') {
                  const top = endpointPoint(circuit, `${component.id}.pos`);
                  const box =
                    component.type === 'uno'
                      ? UNO_BOX
                      : { x: 20, y: (top?.y ?? 0) - 50, width: 116, height: 168 };
                  return (
                    <rect
                      key={component.id}
                      data-hit={component.id}
                      {...box}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        select(component.id);
                      }}
                    />
                  );
                }
                const leads = Object.values(component.pins).map(holePoint);
                const first = leads[0]!;
                const second = leads.at(-1)!;
                // Modules stand taller than their legs; the whole body is touchable.
                const bodyHeight = BODY_HEIGHT[component.type] ?? 0;
                const length = Math.hypot(second.x - first.x, second.y - first.y);
                const angle = (Math.atan2(second.y - first.y, second.x - first.x) * 180) / Math.PI;
                return (
                  <rect
                    key={component.id}
                    className="drag-handle"
                    data-hit={component.id}
                    x={-length / 2 - 12}
                    y={-12 - bodyHeight}
                    width={length + 24}
                    height={24 + bodyHeight}
                    rx={12}
                    fill="transparent"
                    transform={`translate(${(first.x + second.x) / 2} ${(first.y + second.y) / 2}) rotate(${angle})`}
                    onPointerDown={(event) =>
                      startDrag(event, { ...dragOf(component.id, event), kind: 'part' })
                    }
                  />
                );
              })}
              {running &&
                circuit.components.map((component) => {
                  // While the circuit runs, touching these parts operates them instead of moving them:
                  // a button is held, a switch flips, an IR sensor gets or loses its obstacle.
                  const { type, id } = component;
                  if (type !== 'button' && type !== 'switch' && type !== 'ir') return null;
                  const leads = Object.values(component.pins).map(holePoint);
                  const centre = {
                    x: (leads[0]!.x + leads.at(-1)!.x) / 2,
                    y: (leads[0]!.y + leads.at(-1)!.y) / 2 - (type === 'ir' ? 14 : 0),
                  };
                  const release = () => type === 'button' && setPressed(id, false);
                  return (
                    <circle
                      key={id}
                      className="drag-handle"
                      data-press={id}
                      cx={centre.x}
                      cy={centre.y}
                      r={type === 'ir' ? 22 : 16}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        select(id);
                        if (type === 'button') {
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setPressed(id, true);
                        } else if (type === 'switch') {
                          setProps(id, { closed: !component.props.closed });
                        } else {
                          setProps(id, { detected: !component.props.detected });
                        }
                      }}
                      onPointerUp={release}
                      onPointerCancel={release}
                      onLostPointerCapture={release}
                    />
                  );
                })}
              {selectedPart &&
                'pins' in selectedPart &&
                hasFlexibleLeads(selectedPart.type) &&
                Object.entries(selectedPart.pins).map(([pin, hole]) => (
                  <Handle
                    key={pin}
                    name={`${selectedPart.id}.${pin}`}
                    point={holePoint(hole)}
                    onPointerDown={(event) =>
                      startDrag(event, {
                        ...dragOf(selectedPart.id, event),
                        kind: 'pin',
                        pin,
                        anchor: holePoint(hole),
                      })
                    }
                  />
                ))}
              {selectedWire &&
                (['from', 'to'] as const).map((end) => {
                  const point = endpointPoint(circuit, selectedWire[end]);
                  return (
                    point && (
                      <Handle
                        key={end}
                        name={`${selectedWire.id}.${end}`}
                        point={point}
                        onPointerDown={(event) =>
                          startDrag(event, {
                            ...dragOf(selectedWire.id, event),
                            kind: 'wire-end',
                            end,
                            anchor: point,
                          })
                        }
                      />
                    )
                  );
                })}
            </g>
          )}

          {!selecting && (
            <g>
              {HOLE_POINTS.map(({ hole, point }) => (
                <circle
                  key={hole}
                  className="tap-target"
                  data-endpoint={hole}
                  cx={point.x}
                  cy={point.y}
                  r={PITCH / 2 - 0.5}
                  onClick={() => tapEndpoint(hole)}
                />
              ))}
              {tool === 'wire' &&
                circuit.components
                  .filter((c) => c.type === 'battery')
                  .flatMap((battery) =>
                    ['pos', 'neg'].map((pin) => {
                      const endpoint = `${battery.id}.${pin}`;
                      const point = endpointPoint(circuit, endpoint)!;
                      return (
                        <circle
                          key={endpoint}
                          className="tap-target"
                          data-endpoint={endpoint}
                          cx={point.x}
                          cy={point.y}
                          r={15}
                          onClick={() => tapEndpoint(endpoint)}
                        />
                      );
                    }),
                  )}
              {tool === 'wire' &&
                circuit.components
                  .filter((c) => c.type === 'uno')
                  .flatMap((board) =>
                    UNO_SOCKETS.map(({ terminal, point }) => (
                      <circle
                        key={terminal}
                        className="tap-target"
                        data-endpoint={`${board.id}.${terminal}`}
                        cx={point.x}
                        cy={point.y}
                        r={10.5}
                        onClick={() => tapEndpoint(`${board.id}.${terminal}`)}
                      />
                    )),
                  )}
              {startPoint && (
                <g pointerEvents="none">
                  {pointer && (
                    <path
                      d={wirePath(startPoint, pointer)}
                      fill="none"
                      stroke="#e8a21a"
                      strokeWidth={4}
                      strokeDasharray="7 6"
                      strokeLinecap="round"
                    />
                  )}
                  <circle
                    cx={startPoint.x}
                    cy={startPoint.y}
                    r={9}
                    fill="none"
                    stroke="#e8a21a"
                    strokeWidth={3}
                  />
                </g>
              )}
            </g>
          )}
        </svg>
      </div>

      <div className="absolute right-3 bottom-3 flex overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
        <ZoomButton
          label={t('lab.zoomOut')}
          onClick={() => setChosenZoom(Math.max(ZOOM_MIN, zoom - 0.15))}
        >
          −
        </ZoomButton>
        <ZoomButton
          label={t('lab.zoomIn')}
          onClick={() => setChosenZoom(Math.min(ZOOM_MAX, zoom + 0.15))}
        >
          +
        </ZoomButton>
      </div>
    </div>
  );
}

function Handle(props: {
  name: string;
  point: Point;
  onPointerDown(event: ReactPointerEvent): void;
}) {
  return (
    <g className="drag-handle" data-handle={props.name} onPointerDown={props.onPointerDown}>
      <circle cx={props.point.x} cy={props.point.y} r={14} fill="transparent" />
      <circle
        cx={props.point.x}
        cy={props.point.y}
        r={7.5}
        fill="#fff"
        stroke="#e8a21a"
        strokeWidth={3.5}
      />
    </g>
  );
}

function ZoomButton(props: { label: string; onClick(): void; children: string }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className="h-11 w-11 text-xl font-semibold text-ink hover:bg-paper"
    >
      {props.children}
    </button>
  );
}
