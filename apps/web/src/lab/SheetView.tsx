import type { MessageKey } from '@banglalab/i18n';
import {
  SHEET_HEIGHT,
  SHEET_KINDS,
  SHEET_PORTS,
  SHEET_WIDTH,
  addSheetElement,
  connectSheet,
  moveSheetElement,
  removeFromSheet,
  setSheetElement,
  type LogicSheet,
  type SheetElement,
  type SheetError,
  type SheetKind,
} from '@banglalab/shared';
import {
  evaluateSheet,
  nextSheetClockChange,
  sheetTruthTable,
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
  const { inputs, outputs } = SHEET_PORTS[element.kind];
  const side = inputs.includes(port) ? inputs : outputs;
  const index = side.indexOf(port);
  const y = element.y + (side.length === 1 ? 1.5 : index === 0 ? 1 : 2);
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
  const { editSheet } = useLab.getState();
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
  const tools: SheetTool[] = ['select', ...SHEET_KINDS];
  const kindName = (kind: SheetKind) =>
    kind === 'input' || kind === 'output' || kind === 'clock' || kind === 'DFF'
      ? t(`sheet.kind.${kind}` as MessageKey)
      : kind;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="sheet">
      <div
        className="flex flex-wrap gap-1.5 border-b border-line bg-surface px-3 py-2"
        role="toolbar"
        aria-label={t('lab.viewSheet')}
      >
        {tools.map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`sheet-tool-${id}`}
            aria-pressed={tool === id}
            onClick={() => {
              setTool(id);
              setPending(null);
            }}
            className={`min-h-11 rounded-lg border-2 px-3 text-sm font-medium ${
              tool === id ? 'border-amber bg-amber-soft' : 'border-line hover:border-ink-soft'
            }`}
          >
            {id === 'select' ? t('sheet.tool.select') : kindName(id)}
          </button>
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
            const ports = SHEET_PORTS[element.kind];
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
