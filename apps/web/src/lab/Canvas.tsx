import {
  MAX_WIRE_BENDS,
  attachError,
  hasFlexibleLeads,
  isHole,
  moveWireEnd,
  movePart,
  movePin,
  parseTerminal,
  placePart,
  setWireBends,
  suggestWireColor,
  type CircuitDocument,
  type EditError,
  type EditResult,
  type Wire,
} from '@banglalab/shared';
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useT } from '../i18n';
import { describeEndpoint, joinedHoles } from './endpoints';
import { meterReading, voltageAt } from './meter';
import {
  CANVAS_WIDTH,
  HOLE_POINTS,
  PITCH,
  BOARD_SOCKETS,
  canvasHeight,
  distanceToSegment,
  endpointNear,
  endpointPoint,
  holeNear,
  holePoint,
  moveOffBoardTo,
  offBoardParts,
  partBox,
  toPosition,
  wireBends,
  type Point,
} from './geometry';
import { slackMiddle, wirePath } from './parts';
import { BoardPartDrawing, Scene } from './Scene';
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
  | { kind: 'part'; /** Holes moved so far, at the last place the part fitted. */ placed: Point }
  /** A battery or board; `corner` is where its top-left corner started. */
  | { kind: 'off-board'; corner: Point }
  /** `anchor` is where the dragged lead or wire end started. */
  | { kind: 'pin'; pin: string; anchor: Point }
  | { kind: 'wire-end'; end: 'from' | 'to'; anchor: Point }
  /** A bend point of a wire; `inserted` when the drag creates it at `index`. */
  | { kind: 'bend'; index: number; inserted: boolean; anchor: Point }
);

/** A press on the board that is not a drag of something: a tap, or a wire being pulled out. */
interface Press {
  endpoint: string | undefined;
  /** Screen position, to tell a tap from a drag whatever the zoom. */
  client: Point;
  canvas: Point;
  /** A wire was started by this press and follows the pointer until it is let go. */
  pulling: boolean;
  /** With the select tool: dragging from a free hole pulls out a wire. */
  candidate: boolean;
  fromSelect: boolean;
}

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
/** Screen pixels a press may wander and still count as a tap. */
const TAP_SLOP = 10;
/** Canvas units the pointer must travel from a hole before a wire is pulled out of it. */
const PULL_DISTANCE = 9;
/** A wire can be picked up by its end from this close. */
const WIRE_END_REACH = 11;
/** A bend this close to the straight line between its neighbours is removed when let go. */
const STRAIGHT_SLOP = 7;

const AMBER = '#e8a21a';
const DANGER = '#d8342a';

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const isMouse = (event: { pointerType: string }) => event.pointerType !== 'touch';

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
  const meter = useLab((s) => s.meter);
  const canUndo = useLab((s) => s.past.length > 0);
  const canRedo = useLab((s) => s.future.length > 0);
  const {
    select,
    tapEndpoint,
    endWire,
    setTool,
    replaceCircuit,
    commitDrag,
    undo,
    redo,
    setNotice,
    setPressed,
    setProps,
    removeSelected,
    flipSelected,
    straightenSelected,
    clearMeter,
  } = useLab.getState();
  const height = canvasHeight(circuit);
  const { t, quantity, number } = useT();

  const frameRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const press = useRef<Press | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  /** The hole, terminal or socket under the pointer, and whether a lead may go there. */
  const [hover, setHover] = useState<string | null>(null);
  const [hoverRefused, setHoverRefused] = useState(false);
  const [lift, setLift] = useState<{ id: string; x: number; y: number } | null>(null);
  const [floating, setFloating] = useState<{ id: string; key: string; point: Point } | null>(null);
  const [fitZoom, setFitZoom] = useState(1);
  /** Set once the student changes the zoom; until then the board follows the window. */
  const [chosenZoom, setChosenZoom] = useState<number | null>(null);
  const zoom = chosenZoom ?? fitZoom;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

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

  // Ctrl or ⌘ with the wheel (and a trackpad pinch) zooms the board, not the whole page.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const next = zoomRef.current * Math.exp(-event.deltaY * 0.0025);
      setChosenZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)));
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, []);

  const toCanvas = (event: { clientX: number; clientY: number }): Point => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  };

  const showHover = (endpoint: string | null, refused = false) => {
    setHover(endpoint);
    setHoverRefused(refused);
  };

  const startDrag = (event: ReactPointerEvent, next: Drag) => {
    event.stopPropagation();
    event.preventDefault();
    svgRef.current?.setPointerCapture(event.pointerId);
    drag.current = next;
    press.current = null;
    showHover(null);
    select(next.id);
  };

  const moveDrag = (active: Drag, point: Point) => {
    const moveX = point.x - active.grab.x;
    const moveY = point.y - active.grab.y;

    if (active.kind === 'off-board') {
      // Batteries and the board move freely. Against an obstacle they slide along it.
      const now = useLab.getState().circuit;
      const part = offBoardParts(now).find((c) => c.id === active.id);
      if (!part) return;
      const here = partBox(now, part);
      const wanted = { x: active.corner.x + moveX, y: active.corner.y + moveY };
      const tries = [wanted, { x: wanted.x, y: here.y }, { x: here.x, y: wanted.y }];
      for (const corner of tries) {
        const moved = moveOffBoardTo(now, active.id, corner);
        if (moved.ok) {
          active.error = corner === wanted ? null : 'no-room';
          replaceCircuit(moved.circuit);
          return;
        }
      }
      active.error = 'no-room';
      return;
    }

    if (active.kind === 'part') {
      const dx = Math.round(moveX / PITCH);
      const dy = Math.round(moveY / PITCH);
      const key = `${dx},${dy}`;
      if (key !== active.last) {
        active.last = key;
        const moved = movePart(active.origin, active.id, dx, dy);
        active.error = moved.ok ? null : moved.error;
        if (moved.ok) {
          active.placed = { x: dx, y: dy };
          replaceCircuit(moved.circuit);
        }
      }
      // The part follows the hand; the rings show the holes it will drop into.
      setLift({
        id: active.id,
        x: moveX - active.placed.x * PITCH,
        y: moveY - active.placed.y * PITCH,
      });
      return;
    }

    const carried = { x: active.anchor.x + moveX, y: active.anchor.y + moveY };
    if (active.kind === 'bend') {
      const wire = active.origin.wires.find((w) => w.id === active.id);
      if (!wire) return;
      const bends = [...(wire.bends ?? [])];
      bends.splice(active.index, active.inserted ? 0 : 1, toPosition(carried));
      const moved = setWireBends(active.origin, active.id, bends);
      if (moved.ok) replaceCircuit(moved.circuit);
      return;
    }
    const target = active.kind === 'pin' ? holeNear(carried) : endpointNear(active.origin, carried);
    setFloating({
      id: active.id,
      key: active.kind === 'pin' ? active.pin : active.end,
      point: carried,
    });
    const key = target ?? 'none';
    if (key === active.last) return;
    active.last = key;
    const moved: EditResult = !target
      ? { ok: false, error: 'no-room' }
      : active.kind === 'pin'
        ? movePin(active.origin, active.id, active.pin, target)
        : moveWireEnd(active.origin, active.id, active.end, target);
    active.error = moved.ok ? null : moved.error;
    if (moved.ok) replaceCircuit(moved.circuit);
    showHover(target ?? null, !moved.ok);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const point = toCanvas(event);
    const active = drag.current;
    if (active) {
      moveDrag(active, point);
      return;
    }

    const lab = useLab.getState();
    const held = press.current;
    if (held?.candidate && !held.pulling && distance(point, held.canvas) > PULL_DISTANCE) {
      // Dragging away from a free hole with the select tool pulls a wire out of it.
      setTool('wire');
      tapEndpoint(held.endpoint!);
      held.pulling = true;
      held.fromSelect = true;
    }
    if (lab.wireStart || held?.pulling) setPointer(point);

    if (!isMouse(event) && !held?.pulling) return; // a finger has no hover
    const near = endpointNear(lab.circuit, point) ?? null;
    const drawing = lab.tool === 'wire' || held?.pulling === true;
    if (!near) {
      showHover(null);
    } else if (drawing || lab.tool !== 'select') {
      const start = useLab.getState().wireStart;
      showHover(near, drawing && near !== start && attachError(lab.circuit, near) !== null);
    } else {
      // With the select tool, a hole under a part's body is not worth pointing out.
      const overItem = (event.target as Element).closest('[data-hit],[data-handle],[data-press]');
      const info = describeEndpoint(lab.circuit, near);
      showHover(!overItem || info?.used || !isHole(near) ? near : null);
    }
  };

  const endDrag = (event: ReactPointerEvent) => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    svgRef.current?.releasePointerCapture(event.pointerId);
    setLift(null);
    setFloating(null);
    showHover(null);
    if (active.kind === 'bend') {
      // A bend left lying on the straight line between its neighbours is no bend: take it out.
      const now = useLab.getState().circuit;
      const wire = now.wires.find((w) => w.id === active.id);
      const from = wire && endpointPoint(now, wire.from);
      const to = wire && endpointPoint(now, wire.to);
      if (wire && from && to) {
        const route = [from, ...wireBends(wire), to];
        const bend = route[active.index + 1];
        const before = route[active.index];
        const after = route[active.index + 2];
        if (bend && before && after && distanceToSegment(bend, before, after) < STRAIGHT_SLOP) {
          const kept = (wire.bends ?? []).filter((_, i) => i !== active.index);
          const straightened = setWireBends(now, wire.id, kept);
          if (straightened.ok) replaceCircuit(straightened.circuit);
        }
      }
    }
    commitDrag(active.origin);
    // The part stays at the last valid place; say why it would not go further.
    if (active.error && active.kind !== 'off-board') setNotice(active.error);
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    const lab = useLab.getState();
    const point = toCanvas(event);
    const endpoint = endpointNear(lab.circuit, point);
    const free = endpoint !== undefined && attachError(lab.circuit, endpoint) === null;
    const next: Press = {
      endpoint,
      client: { x: event.clientX, y: event.clientY },
      canvas: point,
      pulling: false,
      candidate: false,
      fromSelect: false,
    };
    if (lab.tool === 'select') {
      select(null);
      next.candidate = isMouse(event) && free;
    } else if (lab.tool === 'wire' && isMouse(event) && free && lab.wireStart === null) {
      // With a mouse the wire starts at once, so it can be dragged to its other end in one go.
      tapEndpoint(endpoint);
      next.pulling = true;
      setPointer(point);
    }
    press.current = next;
    if (isMouse(event)) svgRef.current?.setPointerCapture(event.pointerId);
  };

  const onPointerUp = (event: ReactPointerEvent) => {
    if (drag.current) {
      endDrag(event);
      return;
    }
    const held = press.current;
    press.current = null;
    if (!held) return;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
    const lab = useLab.getState();
    const end = endpointNear(lab.circuit, toCanvas(event));
    const tapped = distance({ x: event.clientX, y: event.clientY }, held.client) < TAP_SLOP;

    if (held.pulling) {
      // Only a real drag finishes the wire here. A press that barely moved is a tap, even if the
      // page shifted under the pointer meanwhile, and the wire then waits for a tap on its other end.
      if (!tapped && end && end !== held.endpoint) {
        tapEndpoint(end);
        endWire(held.fromSelect); // refused or not, a dragged wire does not linger
      } else if (held.fromSelect || (!tapped && !end)) {
        endWire(held.fromSelect);
      }
    } else if (lab.tool !== 'select') {
      if (tapped && end) tapEndpoint(end);
    } else if (held.candidate && tapped) {
      // A plain tap on a terminal or socket selects the part it belongs to.
      const owner = parseTerminal(held.endpoint ?? '')?.componentId;
      if (owner) select(owner);
    }
    if (!useLab.getState().wireStart) setPointer(null);
    if (!isMouse(event)) showHover(null);
  };

  const onPointerCancel = (event: ReactPointerEvent) => {
    if (drag.current) {
      endDrag(event);
      return;
    }
    const held = press.current;
    press.current = null;
    if (held?.pulling) endWire(held.fromSelect);
    showHover(null);
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

  /** A free terminal of this part under the pointer: pressing there starts a wire, not a move. */
  const freeTerminalOf = (id: string, event: ReactPointerEvent): boolean => {
    if (!isMouse(event)) return false;
    const endpoint = endpointNear(circuit, toCanvas(event));
    return (
      endpoint !== undefined &&
      parseTerminal(endpoint)?.componentId === id &&
      attachError(circuit, endpoint) === null
    );
  };

  /** Dots along the selected wire: solid ones are its bends, small ones add a bend when dragged. */
  const bendHandles = (wire: Wire) => {
    const from = endpointPoint(circuit, wire.from);
    const to = endpointPoint(circuit, wire.to);
    if (!from || !to) return null;
    const bends = wireBends(wire);
    const route = [from, ...bends, to];
    const grab = (event: ReactPointerEvent, index: number, inserted: boolean, anchor: Point) =>
      startDrag(event, { ...dragOf(wire.id, event), kind: 'bend', index, inserted, anchor });
    return (
      <>
        {bends.length < MAX_WIRE_BENDS &&
          route.slice(0, -1).map((start, index) => {
            const end = route[index + 1]!;
            const middle =
              bends.length === 0
                ? slackMiddle(from, to)
                : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
            if (distance(start, end) < PITCH * 1.5) return null; // no room for another bend
            return (
              <g
                key={`add${index}`}
                className="drag-handle"
                data-handle={`${wire.id}.add${index}`}
                onPointerDown={(event) => grab(event, index, true, middle)}
              >
                <circle cx={middle.x} cy={middle.y} r={11} fill="transparent" />
                <circle
                  className="handle-dot"
                  cx={middle.x}
                  cy={middle.y}
                  r={4.5}
                  fill={AMBER}
                  stroke="#fff"
                  strokeWidth={2}
                />
              </g>
            );
          })}
        {bends.map((bend, index) => (
          <Handle
            key={`bend${index}`}
            name={`${wire.id}.bend${index}`}
            point={bend}
            onPointerDown={(event) => grab(event, index, false, bend)}
          />
        ))}
      </>
    );
  };

  // While a part tool is held over a hole, show the part where it would go.
  const ghost = useMemo(() => {
    if (tool === 'select' || tool === 'wire' || tool === 'probe') return null;
    if (!hover || !isHole(hover)) return null;
    const placed = placePart(circuit, tool, hover);
    if (!placed.ok) return { part: null, hole: hover };
    const part = placed.circuit.components.find((c) => c.id === placed.id);
    return part && 'pins' in part ? { part, hole: hover } : null;
  }, [circuit, tool, hover]);

  const liftedPart = lift && circuit.components.find((c) => c.id === lift.id);
  const hoverInfo = hover ? describeEndpoint(circuit, hover) : null;
  const hoverPoint = hover ? endpointPoint(circuit, hover) : null;
  const hoverIsFree = hover !== null && attachError(circuit, hover) === null;
  // While the circuit runs, pointing at a place also shows its voltage above ground.
  const hoverVolts = result && hover ? voltageAt(result, hover) : undefined;
  const reading = meterReading(result, meter);
  const probeName = (endpoint: string | null) => {
    const info = endpoint ? describeEndpoint(circuit, endpoint) : null;
    return info ? [info.lead, info.name].filter(Boolean).join(' ') : 'GND';
  };
  const previewEnd =
    hover && hoverPoint && hover !== wireStart && !hoverRefused ? hoverPoint : pointer;

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
          style={{ cursor: selecting && !hoverIsFree ? 'default' : 'crosshair' }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerDown={onPointerDown}
          onPointerLeave={() => !drag.current && !press.current && showHover(null)}
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
            lift={lift}
            floating={floating}
          />

          {selecting && (
            <g>
              {/* Wires first, so a part lying under a wire can still be picked up. */}
              {circuit.wires.map((wire) => {
                const from = endpointPoint(circuit, wire.from);
                const to = endpointPoint(circuit, wire.to);
                if (!from || !to || floating?.id === wire.id) return null;
                return (
                  <path
                    key={wire.id}
                    className="wire-hit"
                    data-hit={wire.id}
                    d={wirePath(from, to, wireBends(wire))}
                    onPointerDown={(event) => {
                      // Grabbed near an end, the wire comes out of its hole and follows the hand.
                      const point = toCanvas(event);
                      const end =
                        distance(point, from) <= WIRE_END_REACH
                          ? 'from'
                          : distance(point, to) <= WIRE_END_REACH
                            ? 'to'
                            : null;
                      if (end) {
                        startDrag(event, {
                          ...dragOf(wire.id, event),
                          kind: 'wire-end',
                          end,
                          anchor: end === 'from' ? from : to,
                        });
                      } else {
                        event.stopPropagation();
                        select(wire.id);
                      }
                    }}
                  />
                );
              })}

              {circuit.components.map((component) => {
                if (!('pins' in component)) {
                  const box = partBox(circuit, component);
                  const reach = component.type === 'battery' ? 28 : 0;
                  return (
                    <rect
                      key={component.id}
                      className="drag-handle part-hit"
                      data-hit={component.id}
                      x={box.x - 6}
                      y={box.y - 6}
                      width={box.width + 12 + reach}
                      height={box.height + 12}
                      rx={14}
                      style={
                        hoverIsFree && parseTerminal(hover ?? '')?.componentId === component.id
                          ? { cursor: 'crosshair' }
                          : undefined
                      }
                      onPointerDown={(event) => {
                        if (freeTerminalOf(component.id, event)) return; // the canvas starts a wire
                        startDrag(event, {
                          ...dragOf(component.id, event),
                          kind: 'off-board',
                          corner: { x: box.x, y: box.y },
                        });
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
                    className="drag-handle part-hit"
                    data-hit={component.id}
                    x={-length / 2 - 12}
                    y={-12 - bodyHeight}
                    width={length + 24}
                    height={24 + bodyHeight}
                    rx={12}
                    transform={`translate(${(first.x + second.x) / 2} ${(first.y + second.y) / 2}) rotate(${angle})`}
                    onPointerDown={(event) =>
                      startDrag(event, {
                        ...dragOf(component.id, event),
                        kind: 'part',
                        placed: { x: 0, y: 0 },
                      })
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
                !lift &&
                Object.entries(selectedPart.pins).map(([pin, hole]) => (
                  <Handle
                    key={pin}
                    name={`${selectedPart.id}.${pin}`}
                    point={
                      floating?.id === selectedPart.id && floating.key === pin
                        ? floating.point
                        : holePoint(hole)
                    }
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
                        point={
                          floating?.id === selectedWire.id && floating.key === end
                            ? floating.point
                            : point
                        }
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
              {selectedWire && !floating && bendHandles(selectedWire)}
            </g>
          )}

          {!selecting && (
            <TapTargets circuit={circuit} wiring={tool === 'wire' || tool === 'probe'} />
          )}

          <g pointerEvents="none">
            {/* Holes a carried part will drop into. */}
            {liftedPart &&
              'pins' in liftedPart &&
              Object.values(liftedPart.pins).map((hole) => (
                <LandingRing key={hole} point={holePoint(hole)} />
              ))}

            {ghost?.part && (
              <g opacity={0.6} data-testid="ghost" data-ghost={ghost.part.type}>
                <BoardPartDrawing
                  part={ghost.part}
                  reading={undefined}
                  held={false}
                  selected={false}
                  formatNumber={number}
                />
              </g>
            )}
            {ghost?.part &&
              Object.values(ghost.part.pins).map((hole) => (
                <LandingRing key={hole} point={holePoint(hole)} />
              ))}

            {startPoint && (
              <>
                {previewEnd && (
                  <path
                    d={wirePath(startPoint, previewEnd)}
                    fill="none"
                    stroke={suggestWireColor(circuit, wireStart!, hover ?? wireStart!)}
                    strokeWidth={5.4}
                    strokeLinecap="round"
                    opacity={0.8}
                    data-testid="wire-preview"
                  />
                )}
                <circle
                  cx={startPoint.x}
                  cy={startPoint.y}
                  r={9}
                  fill="none"
                  stroke={AMBER}
                  strokeWidth={3}
                />
              </>
            )}

            {/* The multimeter's probes: black leans left and red right, so they can sit side by side. */}
            {(['black', 'red'] as const).map((which) => {
              const endpoint = meter[which];
              const at = endpoint ? endpointPoint(circuit, endpoint) : null;
              return (
                at && (
                  <g
                    key={which}
                    data-testid={`probe-${which}`}
                    data-probe={endpoint}
                    transform={`translate(${at.x} ${at.y})${which === 'black' ? ' scale(-1 1)' : ''}`}
                    strokeLinecap="round"
                  >
                    <path
                      d="M10 -15L30 -48"
                      stroke="#000"
                      strokeWidth={11}
                      opacity={0.25}
                      transform="translate(2 3)"
                    />
                    <path d="M0 0L10 -16" stroke="#6f787c" strokeWidth={3.4} />
                    <path d="M0 0L10 -16" stroke="#e6ebed" strokeWidth={1.3} />
                    <path
                      d="M10 -16L30 -49"
                      stroke={which === 'red' ? '#c92a20' : '#1d2224'}
                      strokeWidth={10}
                    />
                    <path d="M10 -16L14 -22.6" stroke="#0c0e0f" strokeWidth={10} />
                    <path
                      d="M15 -27L27 -46.8"
                      stroke="#fff"
                      strokeWidth={1.6}
                      opacity={0.3}
                      transform="translate(-2.2 -1.2)"
                    />
                  </g>
                )
              );
            })}

            {hover && hoverPoint && hoverInfo && !lift && (
              <HoverMark
                endpoint={hover}
                point={hoverPoint}
                lead={hoverInfo.lead}
                name={hoverInfo.name}
                detail={hoverVolts === undefined ? undefined : quantity(hoverVolts, 'V')}
                refused={hoverRefused || ghost?.part === null}
              />
            )}
          </g>
        </svg>
      </div>

      {/* Bottom-left overlays, newest on top. On a narrow screen they sit above the zoom buttons. */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col-reverse items-start gap-2 max-sm:bottom-[4.5rem]">
        {(meter.red || meter.black) && (
          <div
            className="quick-actions pointer-events-auto flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-md"
            data-testid="probe-meter"
          >
            <div className="min-w-36 rounded-lg bg-lcd px-3 py-1 text-lcd-ink shadow-[inset_0_2px_5px_rgba(0,0,0,.22)]">
              <p
                className="text-2xl leading-tight font-semibold tabular-nums"
                data-testid="probe-reading"
                data-state={reading?.state ?? 'none'}
                data-volts={reading?.state === 'ok' ? reading.volts.toFixed(3) : undefined}
              >
                {reading?.state === 'ok' ? quantity(reading.volts, 'V') : '— V'}
              </p>
              <p className="flex items-center gap-1.5 text-xs font-medium">
                {reading === null ? (
                  t('meter.needRed')
                ) : reading.state === 'off' ? (
                  t('meter.idle')
                ) : reading.state === 'open' ? (
                  t('meter.open')
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-[#c92a20]" aria-hidden />
                    {probeName(meter.red)}
                    <span className="mx-0.5 opacity-60" aria-hidden>
                      −
                    </span>
                    <span className="h-2 w-2 rounded-full bg-[#1d2224]" aria-hidden />
                    {probeName(meter.black)}
                  </>
                )}
              </p>
            </div>
            <button
              type="button"
              data-testid="probe-clear"
              aria-label={t('meter.clear')}
              title={t('meter.clear')}
              onClick={clearMeter}
              className="h-10 w-10 rounded-lg text-xl text-ink-soft hover:bg-paper hover:text-ink"
            >
              ×
            </button>
          </div>
        )}

        {selecting && (selectedPart || selectedWire) && !lift && !floating && (
          <div className="quick-actions pointer-events-auto flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-md">
            <span className="px-2 text-sm font-semibold text-ink">{selectedId}</span>
            {selectedPart && 'pins' in selectedPart && (
              <button
                type="button"
                data-testid="quick-flip"
                onClick={flipSelected}
                className="min-h-10 rounded-lg px-3 text-sm font-medium text-ink hover:bg-paper"
              >
                {t('inspector.flip')}
              </button>
            )}
            {selectedWire?.bends && (
              <button
                type="button"
                data-testid="quick-straighten"
                onClick={straightenSelected}
                className="min-h-10 rounded-lg px-3 text-sm font-medium text-ink hover:bg-paper"
              >
                {t('lab.straighten')}
              </button>
            )}
            <button
              type="button"
              data-testid="quick-remove"
              onClick={removeSelected}
              className="min-h-10 rounded-lg px-3 text-sm font-medium text-danger hover:bg-danger-soft"
            >
              {t('inspector.remove')}
            </button>
          </div>
        )}
      </div>

      <div className="absolute top-3 right-3 flex overflow-hidden rounded-xl border border-line bg-surface shadow-md">
        <HistoryButton testId="undo" label={t('lab.undo')} enabled={canUndo} onClick={undo}>
          <path d="M9 7L4 12l5 5M4.5 12H14a5.5 5.5 0 0 1 0 11h-2" />
        </HistoryButton>
        <HistoryButton testId="redo" label={t('lab.redo')} enabled={canRedo} onClick={redo}>
          <path d="M15 7l5 5-5 5M19.5 12H10a5.5 5.5 0 0 0 0 11h2" />
        </HistoryButton>
      </div>

      <div className="absolute right-3 bottom-3 flex overflow-hidden rounded-xl border border-line bg-surface shadow-md">
        <ZoomButton
          label={t('lab.zoomOut')}
          onClick={() => setChosenZoom(Math.max(ZOOM_MIN, zoom - 0.15))}
        >
          −
        </ZoomButton>
        <button
          type="button"
          data-testid="zoom-fit"
          title={t('lab.zoomFit')}
          aria-label={t('lab.zoomFit')}
          onClick={() => setChosenZoom(null)}
          className="min-w-16 border-x border-line px-2 text-sm font-semibold text-ink-soft tabular-nums hover:bg-paper hover:text-ink"
        >
          {number(Math.round(zoom * 100))}%
        </button>
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

/**
 * Targets over every hole, terminal and socket while a wire or a part is being
 * placed. The canvas works out what was tapped from the pointer's position;
 * these give each place a name for tests and a pointer cursor.
 */
const TapTargets = memo(function TapTargets(props: { circuit: CircuitDocument; wiring: boolean }) {
  const { circuit, wiring } = props;
  return (
    <g>
      {HOLE_POINTS.map(({ hole, point }) => (
        <circle
          key={hole}
          className="tap-target"
          data-endpoint={hole}
          cx={point.x}
          cy={point.y}
          r={PITCH / 2 - 0.5}
        />
      ))}
      {wiring &&
        offBoardParts(circuit).flatMap((part) =>
          (part.type === 'battery'
            ? ['pos', 'neg']
            : BOARD_SOCKETS[part.type].map((s) => s.terminal)
          ).map((pin) => {
            const endpoint = `${part.id}.${pin}`;
            const point = endpointPoint(circuit, endpoint);
            return (
              point && (
                <circle
                  key={endpoint}
                  className="tap-target"
                  data-endpoint={endpoint}
                  cx={point.x}
                  cy={point.y}
                  r={part.type === 'battery' ? 15 : 10.5}
                />
              )
            );
          }),
        )}
    </g>
  );
});

function LandingRing({ point }: { point: Point }) {
  return (
    <circle
      cx={point.x}
      cy={point.y}
      r={7.5}
      fill="rgba(232,162,26,.25)"
      stroke={AMBER}
      strokeWidth={2}
    />
  );
}

/**
 * Marks what the pointer is over: a ring on the hole, a glow on the holes
 * joined to it inside the board, and a label saying what it is.
 */
const HoverMark = memo(function HoverMark(props: {
  endpoint: string;
  point: Point;
  lead: string | undefined;
  name: string;
  /** A measurement to show after the name, such as the voltage there. */
  detail?: string;
  refused: boolean;
}) {
  const { point, lead, name, detail, refused } = props;
  const color = refused ? DANGER : AMBER;
  // Holes in one strip are joined inside the board; the band shows which ones.
  const joined = joinedHoles(props.endpoint);
  const text = [lead, name, detail].filter(Boolean).join('  ');
  const width = Math.max(30, text.length * 7.2 + 16);
  const x = Math.min(CANVAS_WIDTH - width / 2 - 4, Math.max(width / 2 + 4, point.x));
  const y = point.y < 52 ? point.y + 30 : point.y - 24;
  return (
    <g
      data-testid="hover-mark"
      data-hover={props.endpoint}
      data-refused={refused}
      data-joined={joined.length}
    >
      {joined.length > 1 && (
        <line
          x1={holePoint(joined[0]!).x}
          y1={holePoint(joined[0]!).y}
          x2={holePoint(joined.at(-1)!).x}
          y2={holePoint(joined.at(-1)!).y}
          stroke={color}
          strokeWidth={15}
          strokeLinecap="round"
          opacity={0.32}
        />
      )}
      <circle
        className="hover-ring"
        cx={point.x}
        cy={point.y}
        r={9}
        fill={refused ? 'rgba(216,52,42,.2)' : 'rgba(232,162,26,.28)'}
        stroke={color}
        strokeWidth={2.5}
      />
      <rect x={x - width / 2} y={y - 13} width={width} height={20} rx={6} fill="#13231f" />
      <text x={x} y={y + 1.5} textAnchor="middle" fontSize={12} fontWeight={600} fill="#f4f7f5">
        {lead && <tspan>{lead} </tspan>}
        <tspan fill={lead ? '#f3c869' : '#f4f7f5'}>{name}</tspan>
        {detail && <tspan fill="#9fe3b4"> {detail}</tspan>}
      </text>
    </g>
  );
});

function Handle(props: {
  name: string;
  point: Point;
  onPointerDown(event: ReactPointerEvent): void;
}) {
  return (
    <g className="drag-handle" data-handle={props.name} onPointerDown={props.onPointerDown}>
      <circle cx={props.point.x} cy={props.point.y} r={14} fill="transparent" />
      <circle
        className="handle-dot"
        cx={props.point.x}
        cy={props.point.y}
        r={7.5}
        fill="#fff"
        stroke={AMBER}
        strokeWidth={3.5}
      />
    </g>
  );
}

function HistoryButton(props: {
  testId: string;
  label: string;
  enabled: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={props.testId}
      aria-label={props.label}
      title={props.label}
      disabled={!props.enabled}
      onClick={props.onClick}
      className="flex h-11 w-11 items-center justify-center text-ink hover:bg-paper disabled:text-line disabled:hover:bg-transparent"
    >
      <svg
        viewBox="0 0 24 26"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {props.children}
      </svg>
    </button>
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
