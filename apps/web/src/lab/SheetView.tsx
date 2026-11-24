import type { MessageKey } from '@banglalab/i18n';
import {
  SHEET_GATES,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  addSheetElement,
  connectSheet,
  moveSheetElement,
  removeFromSheet,
  setSheetElement,
  sheetPorts,
  type LogicSheet,
  type SheetElement,
  type SheetError,
  type SheetKind,
} from '@banglalab/shared';
import {
  evaluateSheet,
  nextSheetClockChange,
  sheetTruthTable,
  simplestSum,
  type SheetState,
  type SheetTruthTable,
} from '@banglalab/simulation';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useT } from '../i18n';
import { useLab } from './store';

/** One grid step, in drawing units. Each element is three steps square. */
const CELL = 24;
const SIZE = 3;
const HIGH = '#e8a21a';
const LOW = 'var(--color-line)';

type SheetTool = 'select' | SheetKind;

/** Where a port sits, in grid steps: inputs on the left edge, outputs on the right. */
function portPoint(element: SheetElement, port: string): { x: number; y: number } {
  const { inputs, outputs } = sheetPorts(element);
  const side = inputs.includes(port) ? inputs : outputs;
  const index = side.indexOf(port);
  // Spread evenly down the side: one in the middle, two at the thirds, and so on.
  const y = element.y + (SIZE * (index + 1)) / (side.length + 1);
  return { x: inputs.includes(port) ? element.x : element.x + SIZE, y };
}

/** Works the sheet out as time passes, stopping at every clock change so no edge is lost. */
function useSheetState(sheet: LogicSheet): SheetState {
  const start = useRef(performance.now());
  const last = useRef<SheetState | undefined>(undefined);
  const [state, setState] = useState<SheetState>(() => evaluateSheet(sheet, 0));
  useEffect(() => {
    let key = '';
    const publish = (next: SheetState) => {
      last.current = next;
      const nextKey = JSON.stringify([next.levels, next.memory, next.unsettled]);
      if (nextKey !== key) {
        key = nextKey;
        setState(next);
      }
    };
    let time = performance.now() - start.current;
    publish(evaluateSheet(sheet, time, last.current));
    if (!sheet.elements.some((e) => e.kind === 'clock')) return;
    let frame = 0;
    const tick = () => {
      const now = performance.now() - start.current;
      let current = last.current;
      for (let at = nextSheetClockChange(sheet, time); at <= now;) {
        current = evaluateSheet(sheet, at, current);
        at = nextSheetClockChange(sheet, at);
      }
      time = now;
      publish(evaluateSheet(sheet, now, current));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [sheet]);
  return state;
}

/** The toolbar's groups: what is placed on the sheet, by what it does. */
const TOOL_GROUPS: { id: string; items: SheetTool[] }[] = [
  { id: 'select', items: ['select'] },
  { id: 'io', items: ['input', 'output', 'clock'] },
  { id: 'gates', items: ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR'] },
  { id: 'blocks', items: ['MUX', 'FA', 'HEX'] },
  { id: 'memory', items: ['DFF', 'JKFF', 'TFF'] },
];

/** A small drawing of each tool, a gate's symbol as a textbook draws it. */
function ToolGlyph({ id }: { id: SheetTool }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinejoin: 'round' as const,
  };
  const bubble = id === 'NAND' || id === 'NOR' || id === 'NOT';
  const body =
    id === 'select' ? (
      <path d="M7 4l10 7-5 1.5L10 18z" {...common} />
    ) : id === 'input' ? (
      <>
        <rect x="4" y="8" width="16" height="8" rx="4" {...common} />
        <circle cx="16" cy="12" r="2.5" fill="currentColor" />
      </>
    ) : id === 'output' ? (
      <>
        <circle cx="12" cy="12" r="6" {...common} />
        <path d="M8 8l8 8M16 8l-8 8" {...common} strokeWidth={1.2} />
      </>
    ) : id === 'clock' ? (
      <path d="M3 16h4V8h5v8h5V8h4" {...common} />
    ) : id === 'AND' || id === 'NAND' ? (
      <path d="M5 6h6a6 6 0 0 1 0 12H5z" {...common} />
    ) : id === 'OR' || id === 'NOR' || id === 'XOR' ? (
      <>
        <path d="M5 6q9 0 12 6q-3 6-12 6q3-6 0-12z" {...common} />
        {id === 'XOR' && <path d="M3 6q3 6 0 12" {...common} />}
      </>
    ) : id === 'NOT' ? (
      <path d="M5 6l10 6-10 6z" {...common} />
    ) : id === 'MUX' ? (
      <path d="M7 4l10 4v8l-10 4z" {...common} />
    ) : id === 'HEX' ? (
      <>
        <rect x="6" y="3" width="12" height="18" rx="2" {...common} />
        <path d="M9 7h6M9 12h6M9 17h6M9 7v10M15 7v10" {...common} strokeWidth={1.2} />
      </>
    ) : (
      <>
        <rect x="5" y="4" width="14" height="16" rx="1.5" {...common} />
        {id !== 'FA' && <path d="M5 13l3 2-3 2" {...common} strokeWidth={1.2} />}
        {id === 'FA' && <path d="M9 9h6l-4 3 4 3H9" {...common} strokeWidth={1.2} />}
      </>
    );
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      {body}
      {bubble && <circle cx={id === 'NOT' ? 17.5 : 19.5} cy="12" r="2" {...common} />}
    </svg>
  );
}

/** A gate's textbook symbol in its 3 × 3 block. */
function GateBody({ kind }: { kind: SheetKind }) {
  const w = SIZE * CELL;
  const top = 12;
  const bottom = w - 12;
  const middle = w / 2;
  const inverted = kind === 'NAND' || kind === 'NOR' || kind === 'NOT';
  const tip = inverted ? w - 14 : w - 8;
  const body =
    kind === 'NOT'
      ? `M14 ${top + 6}L${tip} ${middle}L14 ${bottom - 6}Z`
      : kind === 'AND' || kind === 'NAND'
        ? `M12 ${top}H${middle - 2}A${(bottom - top) / 2} ${(bottom - top) / 2} 0 0 1 ${middle - 2} ${bottom}H12Z`
        : `M12 ${top}Q${middle + 8} ${top} ${tip} ${middle}Q${middle + 8} ${bottom} 12 ${bottom}Q24 ${middle} 12 ${top}Z`;
  return (
    <g stroke="currentColor" strokeWidth={1.6}>
      {kind === 'XOR' && <path d={`M6 ${top}Q18 ${middle} 6 ${bottom}`} fill="none" />}
      <path d={body} fill="var(--color-surface)" />
      {inverted && <circle cx={tip + 3.5} cy={middle} r={3.5} fill="var(--color-surface)" />}
    </g>
  );
}

function ElementBody({
  element,
  state,
  label,
}: {
  element: SheetElement;
  state: SheetState;
  label: string;
}) {
  const w = SIZE * CELL;
  const level = (port: string) => state.levels[`${element.id}.${port}`] === true;
  const text = { fontSize: 11, fontWeight: 700, textAnchor: 'middle' as const, stroke: 'none' };
  switch (element.kind) {
    case 'input':
      return (
        <g>
          <rect
            x={10}
            y={14}
            width={w - 26}
            height={w - 28}
            rx={8}
            fill={level('q') ? HIGH : 'var(--color-surface)'}
            stroke="currentColor"
            strokeWidth={1.6}
          />
          <text x={w / 2 - 3} y={w / 2 + 4} {...text} fill="currentColor">
            {level('q') ? '1' : '0'}
          </text>
        </g>
      );
    case 'output':
      return (
        <g>
          <circle
            cx={w / 2 + 4}
            cy={w / 2}
            r={16}
            fill={level('a') ? HIGH : 'var(--color-surface)'}
            stroke="currentColor"
            strokeWidth={1.6}
          />
          <path
            d={`M${w / 2 - 7} ${w / 2 - 11}L${w / 2 + 15} ${w / 2 + 11}M${w / 2 + 15} ${w / 2 - 11}L${w / 2 - 7} ${w / 2 + 11}`}
            stroke="currentColor"
            strokeWidth={1.2}
            opacity={0.5}
          />
        </g>
      );
    case 'clock':
      return (
        <g>
          <rect
            x={8}
            y={14}
            width={w - 22}
            height={w - 28}
            rx={4}
            fill="var(--color-surface)"
            stroke="currentColor"
            strokeWidth={1.6}
          />
          <path
            d={`M16 ${w / 2 + 8}H24V${w / 2 - 8}H34V${w / 2 + 8}H44V${w / 2 - 8}H50`}
            fill="none"
            stroke={level('q') ? HIGH : 'currentColor'}
            strokeWidth={2}
          />
          <text x={w / 2 - 3} y={w - 3} {...text} fontSize={9} fill="var(--color-ink-soft)">
            {element.hz ?? 1} Hz
          </text>
        </g>
      );
    case 'MUX':
    case 'FA':
    case 'JKFF':
    case 'TFF': {
      const ports = sheetPorts(element);
      const name = { MUX: 'MUX', FA: 'Σ', JKFF: 'JK', TFF: 'T' }[element.kind];
      const pinName: Record<string, string> = {
        a: 'A',
        b: 'B',
        sel: 'S',
        cin: 'Ci',
        s: 'S',
        cout: 'Co',
        j: 'J',
        k: 'K',
        t: 'T',
        q: 'Q',
        nq: 'Q̅',
        y: 'Y',
        clk: '',
      };
      const at = (index: number, count: number) => (w * (index + 1)) / (count + 1);
      return (
        <g>
          {element.kind === 'MUX' ? (
            <path
              d={`M8 4L${w - 8} 16V${w - 16}L8 ${w - 4}Z`}
              fill="var(--color-surface)"
              stroke="currentColor"
              strokeWidth={1.6}
            />
          ) : (
            <rect
              x={8}
              y={6}
              width={w - 16}
              height={w - 12}
              rx={3}
              fill="var(--color-surface)"
              stroke="currentColor"
              strokeWidth={1.6}
            />
          )}
          <text x={w / 2} y={w / 2 + 4} {...text} fontSize={10} fill="var(--color-ink-soft)">
            {name}
          </text>
          {ports.inputs.map((port, i) =>
            port === 'clk' ? (
              <path
                key={port}
                d={`M8 ${at(i, ports.inputs.length) - 6}L15 ${at(i, ports.inputs.length)}L8 ${at(i, ports.inputs.length) + 6}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.4}
              />
            ) : (
              <text
                key={port}
                x={13}
                y={at(i, ports.inputs.length) + 3.5}
                fontSize={9}
                fill="currentColor"
                stroke="none"
              >
                {pinName[port]}
              </text>
            ),
          )}
          {ports.outputs.map((port, i) => (
            <text
              key={port}
              x={w - 12}
              y={at(i, ports.outputs.length) + 3.5}
              fontSize={9}
              fill="currentColor"
              stroke="none"
              textAnchor="end"
            >
              {pinName[port]}
            </text>
          ))}
        </g>
      );
    }
    case 'HEX': {
      const value = [0, 1, 2, 3].reduce((sum, bit) => sum + (level(`d${bit}`) ? 1 << bit : 0), 0);
      return (
        <g data-value={value}>
          <rect
            x={8}
            y={4}
            width={w - 14}
            height={w - 8}
            rx={4}
            fill="#1b1d1f"
            stroke="currentColor"
            strokeWidth={1.6}
          />
          <text
            x={w / 2 + 2}
            y={w / 2 + 14}
            textAnchor="middle"
            fontSize={36}
            fontWeight={700}
            fill="#ff4433"
            stroke="none"
            fontFamily="monospace"
          >
            {value.toString(16).toUpperCase()}
          </text>
        </g>
      );
    }
    case 'DFF':
      return (
        <g>
          <rect
            x={8}
            y={6}
            width={w - 16}
            height={w - 12}
            rx={3}
            fill="var(--color-surface)"
            stroke="currentColor"
            strokeWidth={1.6}
          />
          {/* The clock input's triangle, and the pins named. */}
          <path
            d={`M8 ${2 * CELL - 6}L15 ${2 * CELL}L8 ${2 * CELL + 6}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
          />
          <text x={18} y={CELL + 4} fontSize={10} fill="currentColor" stroke="none">
            D
          </text>
          <text
            x={w - 14}
            y={CELL + 4}
            fontSize={10}
            fill="currentColor"
            stroke="none"
            textAnchor="end"
          >
            Q
          </text>
          <text
            x={w - 14}
            y={2 * CELL + 4}
            fontSize={10}
            fill="currentColor"
            stroke="none"
            textAnchor="end"
          >
            Q̅
          </text>
        </g>
      );
    default:
      return (
        <g>
          <GateBody kind={element.kind} />
          <text x={w / 2} y={w - 1} {...text} fontSize={9} fill="var(--color-ink-soft)">
            {label}
          </text>
        </g>
      );
  }
}

/**
 * The logic sheet: switches, lamps, clocks, gates and flip-flops drawn as
 * symbols and joined port to port. It works out as pure logic while it is open.
 */
export function SheetView() {
  const sheet = useLab((s) => s.sheet);
  const { editSheet, undoSheet, redoSheet } = useLab.getState();
  const canUndo = useLab((s) => s.sheetPast.length > 0);
  const canRedo = useLab((s) => s.sheetFuture.length > 0);
  const { t } = useT();
  const state = useSheetState(sheet);
  const [tool, setTool] = useState<SheetTool>('select');
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [problem, setProblem] = useState<SheetError | null>(null);
  /** The table made, or 'none' when the button was pressed and the sheet has none. */
  const [table, setTable] = useState<SheetTruthTable | 'none' | null>(null);
  const [drag, setDrag] = useState<{
    id: string;
    dx: number;
    dy: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  // A table made earlier no longer fits a changed sheet.
  useEffect(() => setTable(null), [sheet]);

  const apply = (edit: (s: LogicSheet) => ReturnType<typeof addSheetElement>) => {
    const result = editSheet(edit);
    setProblem(result.ok ? null : result.error);
    return result;
  };
  /** The grid step under the pointer. */
  const gridAt = (event: PointerEvent) => {
    const box = svg.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * SHEET_WIDTH,
      y: ((event.clientY - box.top) / box.height) * SHEET_HEIGHT,
    };
  };

  const onBackground = (event: PointerEvent) => {
    setPending(null);
    if (tool === 'select') {
      setSelected(null);
      return;
    }
    const at = gridAt(event);
    const result = apply((s) =>
      addSheetElement(s, tool, Math.floor(at.x - 1), Math.floor(at.y - 1)),
    );
    if (result.ok) setSelected(result.id ?? null);
  };
  const onPort = (port: string) => {
    if (pending && pending !== port) {
      apply((s) => connectSheet(s, pending, port));
      setPending(null);
    } else setPending(port === pending ? null : port);
  };

  const selectedElement = sheet.elements.find((e) => e.id === selected);
  const floating = state.floating.filter((port) => !port.startsWith('OUT'));
  const kindName = (kind: SheetKind) =>
    (SHEET_GATES as readonly string[]).includes(kind)
      ? kind
      : t(`sheet.kind.${kind}` as MessageKey);
  const isWideGate = (kind?: SheetKind) =>
    kind !== undefined && kind !== 'NOT' && (SHEET_GATES as readonly string[]).includes(kind);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="sheet">
      <div
        className="flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-line bg-surface px-3 py-2"
        role="toolbar"
        aria-label={t('lab.viewSheet')}
      >
        {TOOL_GROUPS.map((group) => (
          <div
            key={group.id}
            role="group"
            aria-label={
              group.id === 'select' ? undefined : t(`sheet.group.${group.id}` as MessageKey)
            }
          >
            {group.id !== 'select' && (
              <span className="mb-0.5 block px-1 text-xs font-semibold text-ink-faint">
                {t(`sheet.group.${group.id}` as MessageKey)}
              </span>
            )}
            <div className="flex gap-0.5 rounded-xl bg-paper p-1">
              {group.items.map((id) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`sheet-tool-${id}`}
                  aria-pressed={tool === id}
                  title={id === 'select' ? t('sheet.tool.select') : kindName(id)}
                  onClick={() => {
                    setTool(id);
                    setPending(null);
                  }}
                  className={`flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium ${
                    tool === id
                      ? 'bg-surface text-ink shadow-sm ring-2 ring-amber'
                      : 'text-ink-soft hover:bg-surface/60 hover:text-ink'
                  }`}
                >
                  <ToolGlyph id={id} />
                  <span
                    className={
                      (SHEET_GATES as readonly string[]).includes(id) ? 'font-mono text-xs' : ''
                    }
                  >
                    {id === 'select' ? t('sheet.tool.select') : kindName(id)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="border-b border-line bg-paper px-4 py-1.5 text-sm text-ink-soft">
        {pending
          ? t('sheet.hint.wire')
          : tool === 'select'
            ? t('sheet.hint.select')
            : t('sheet.hint.place')}
      </p>
      <div className="min-h-0 flex-1 overflow-auto bg-paper p-3">
        <svg
          ref={svg}
          data-testid="sheet-canvas"
          viewBox={`0 0 ${SHEET_WIDTH * CELL} ${SHEET_HEIGHT * CELL}`}
          className="block w-full max-w-[60rem] touch-none rounded-xl bg-surface text-ink"
          onPointerDown={(event) => event.target === event.currentTarget && onBackground(event)}
          onPointerMove={(event) => {
            if (!drag) return;
            const at = gridAt(event);
            const x = Math.round(at.x - drag.dx);
            const y = Math.round(at.y - drag.dy);
            if (x !== drag.x || y !== drag.y) setDrag({ ...drag, x, y, moved: true });
          }}
          onPointerUp={() => {
            if (!drag) return;
            if (drag.moved) apply((s) => moveSheetElement(s, drag.id, drag.x, drag.y));
            else {
              const element = sheet.elements.find((e) => e.id === drag.id);
              // A tap on a switch turns it over.
              if (element?.kind === 'input')
                apply((s) => setSheetElement(s, element.id, { on: !element.on }));
            }
            setDrag(null);
          }}
        >
          <defs>
            <pattern id="sheet-grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
              <circle cx={0} cy={0} r={1.1} fill="var(--color-line)" />
            </pattern>
          </defs>
          <rect
            width={SHEET_WIDTH * CELL}
            height={SHEET_HEIGHT * CELL}
            fill="url(#sheet-grid)"
            pointerEvents="none"
          />
          {sheet.wires.map((wire) => {
            const [fromId, fromPort] = wire.from.split('.');
            const [toId, toPort] = wire.to.split('.');
            const from = sheet.elements.find((e) => e.id === fromId);
            const to = sheet.elements.find((e) => e.id === toId);
            if (!from || !to) return null;
            const place = (e: SheetElement) =>
              drag?.id === e.id ? { ...e, x: drag.x, y: drag.y } : e;
            const a = portPoint(place(from), fromPort!);
            const b = portPoint(place(to), toPort!);
            const middle = b.x > a.x ? (a.x + b.x) / 2 : a.x + 1;
            const d =
              b.x > a.x
                ? `M${a.x * CELL} ${a.y * CELL}H${middle * CELL}V${b.y * CELL}H${b.x * CELL}`
                : `M${a.x * CELL} ${a.y * CELL}H${(a.x + 1) * CELL}V${(Math.max(a.y, b.y) + 2) * CELL}H${(b.x - 1) * CELL}V${b.y * CELL}H${b.x * CELL}`;
            const high = state.levels[wire.from] === true;
            return (
              <g key={wire.id} data-wire={wire.id} data-high={high ? 'true' : 'false'}>
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={12}
                  onPointerDown={() => setSelected(wire.id)}
                />
                <path
                  d={d}
                  fill="none"
                  stroke={selected === wire.id ? 'var(--color-ink)' : high ? HIGH : LOW}
                  strokeWidth={selected === wire.id ? 3.5 : 2.5}
                  pointerEvents="none"
                />
              </g>
            );
          })}
          {sheet.elements.map((element) => {
            const at = drag?.id === element.id ? { x: drag.x, y: drag.y } : element;
            const ports = sheetPorts(element);
            return (
              <g
                key={element.id}
                data-element={element.id}
                data-kind={element.kind}
                data-high={
                  element.kind === 'output'
                    ? String(state.levels[`${element.id}.a`] === true)
                    : element.kind === 'DFF'
                      ? String(state.memory[element.id] === true)
                      : undefined
                }
                transform={`translate(${at.x * CELL} ${at.y * CELL})`}
              >
                <rect
                  width={SIZE * CELL}
                  height={SIZE * CELL}
                  rx={6}
                  fill={selected === element.id ? 'var(--color-amber-soft)' : 'transparent'}
                  className="cursor-grab"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelected(element.id);
                    setPending(null);
                    const grid = gridAt(event);
                    setDrag({
                      id: element.id,
                      dx: grid.x - element.x,
                      dy: grid.y - element.y,
                      x: element.x,
                      y: element.y,
                      moved: false,
                    });
                  }}
                />
                <g pointerEvents="none">
                  <ElementBody element={element} state={state} label={element.id} />
                  <text
                    x={SIZE * CELL - 3}
                    y={9}
                    fontSize={8}
                    textAnchor="end"
                    fill="var(--color-ink-soft)"
                  >
                    {element.kind === 'input' ||
                    element.kind === 'output' ||
                    element.kind === 'clock' ||
                    element.kind === 'DFF'
                      ? element.id
                      : ''}
                  </text>
                </g>
                {[...ports.inputs, ...ports.outputs].map((port) => {
                  const point = portPoint({ ...element, x: 0, y: 0 }, port);
                  const name = `${element.id}.${port}`;
                  const isInput = ports.inputs.includes(port);
                  return (
                    <g key={port}>
                      <path
                        d={`M${point.x * CELL} ${point.y * CELL}H${point.x * CELL + (isInput ? 12 : -10)}`}
                        stroke={state.levels[name] ? HIGH : 'currentColor'}
                        strokeWidth={1.6}
                        pointerEvents="none"
                      />
                      <circle
                        data-port={name}
                        cx={point.x * CELL}
                        cy={point.y * CELL}
                        r={pending === name ? 7 : 5}
                        fill={
                          pending === name
                            ? HIGH
                            : state.floating.includes(name)
                              ? 'var(--color-danger)'
                              : 'var(--color-surface)'
                        }
                        stroke="currentColor"
                        strokeWidth={1.4}
                        className="cursor-crosshair"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          onPort(name);
                        }}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        <div className="mt-3 max-w-[60rem] space-y-2 text-sm">
          {problem && (
            <p role="alert" className="font-medium text-danger" data-testid="sheet-problem">
              {t(`sheet.error.${problem}` as MessageKey)}
            </p>
          )}
          {state.unsettled && <p className="font-medium text-danger">{t('sheet.unsettled')}</p>}
          {floating.length > 0 && (
            <p className="text-ink-soft" data-testid="sheet-floating">
              {t('sheet.floating', { count: floating.length })}
            </p>
          )}
          {sheet.elements.length === 0 && <p className="text-ink-soft">{t('sheet.empty')}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {selected && (
              <button
                type="button"
                data-testid="sheet-delete"
                onClick={() => {
                  apply((s) => removeFromSheet(s, selected));
                  setSelected(null);
                }}
                className="min-h-11 rounded-lg border-2 border-line px-3 font-medium hover:border-danger hover:text-danger"
              >
                {t('sheet.delete', { id: selected })}
              </button>
            )}
            {isWideGate(selectedElement?.kind) && (
              <fieldset className="flex items-center gap-1.5" data-testid="sheet-inputs">
                <legend className="sr-only">{t('sheet.inputs')}</legend>
                <span className="text-sm text-ink-soft">{t('sheet.inputs')}</span>
                {[2, 3, 4].map((count) => (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={(selectedElement!.inputs ?? 2) === count}
                    onClick={() =>
                      apply((s) => setSheetElement(s, selectedElement!.id, { inputs: count }))
                    }
                    className={`min-h-11 min-w-11 rounded-lg border-2 font-semibold ${
                      (selectedElement!.inputs ?? 2) === count
                        ? 'border-amber bg-amber-soft'
                        : 'border-line'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </fieldset>
            )}
            {selectedElement?.kind === 'clock' && (
              <label className="flex items-center gap-2">
                {t('sheet.hz', { count: selectedElement.hz ?? 1 })}
                <input
                  type="range"
                  data-testid="sheet-hz"
                  min={0.2}
                  max={10}
                  step={0.2}
                  value={selectedElement.hz ?? 1}
                  onChange={(event) =>
                    apply((s) =>
                      setSheetElement(s, selectedElement.id, {
                        hz: Math.round(Number(event.target.value) * 10) / 10,
                      }),
                    )
                  }
                  className="h-11 w-40 accent-amber"
                />
              </label>
            )}
            <button
              type="button"
              data-testid="sheet-undo"
              disabled={!canUndo}
              onClick={() => undoSheet()}
              className="min-h-11 rounded-lg border-2 border-line px-3 font-medium hover:border-ink-soft disabled:opacity-40"
            >
              {t('sheet.undo')}
            </button>
            <button
              type="button"
              data-testid="sheet-redo"
              disabled={!canRedo}
              onClick={() => redoSheet()}
              className="min-h-11 rounded-lg border-2 border-line px-3 font-medium hover:border-ink-soft disabled:opacity-40"
            >
              {t('sheet.redo')}
            </button>
            <button
              type="button"
              data-testid="sheet-table"
              onClick={() => setTable(sheetTruthTable(sheet) ?? 'none')}
              className="min-h-11 rounded-lg border-2 border-line px-3 font-medium hover:border-ink-soft"
            >
              {t('table.make')}
            </button>
          </div>
          {table && table !== 'none' && (
            <table className="tabular-nums" data-testid="sheet-truth-table">
              <thead>
                <tr>
                  {[...table.inputs, ...table.outputs].map((id) => (
                    <th key={id} className="px-3 py-1 text-left font-semibold">
                      {id}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-t border-line" data-testid="sheet-row">
                    {[...row.inputs, ...row.outputs].map((level, j) => (
                      <td
                        key={j}
                        className={`px-3 py-1 ${j >= row.inputs.length ? 'font-semibold' : ''}`}
                      >
                        {level ? 1 : 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {table && table !== 'none' && (
            <div className="space-y-1" data-testid="sheet-expressions">
              <p className="text-sm text-ink-soft">
                {t('sheet.letters', {
                  list: table.inputs.map((id, i) => `${'ABCD'[i]} = ${id}`).join(', '),
                })}
              </p>
              {table.outputs.map((id, o) => (
                <p key={id} className="font-mono text-lg" data-testid="sheet-expression">
                  {id} ={' '}
                  {simplestSum(
                    table.inputs.length,
                    table.rows.map((row) => row.outputs[o]!),
                  )}
                </p>
              ))}
            </div>
          )}
          {table === 'none' && (
            <p className="text-ink-soft" data-testid="sheet-no-table">
              {t('sheet.noTable')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
