import type { MessageKey } from '@banglalab/i18n';
import {
  MAX_LABEL,
  SHEET_GATES,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  addSheetElement,
  connectSheet,
  copyFromSheet,
  moveSheetElements,
  pasteIntoSheet,
  removeFromSheet,
  removeManyFromSheet,
  setSheetElement,
  sheetName,
  sheetPorts,
  sheetSize,
  type LogicSheet,
  type SheetElement,
  type SheetError,
  type SheetClip,
  type SheetKind,
} from '@banglalab/shared';
import {
  evaluateSheet,
  nextSheetClockChange,
  sheetTruthTable,
  simplestSum,
  simplestTerms,
  type SheetState,
  type SheetTruthTable,
} from '@banglalab/simulation';
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { useT } from '../i18n';
import { useLab } from './store';
import { KMap } from './KMap';
import { TimingDiagram } from './TimingDiagram';
import { TimingTrace, timingSignals } from './timing';

/** One grid step, in drawing units. Each element is three steps square. */
const CELL = 24;
const SIZE = 3;
const HIGH = '#e8a21a';
const LOW = 'var(--color-line)';

type SheetTool = 'select' | SheetKind;

/** What was copied last; it outlives the view, so it can be pasted into another project. */
let sheetClipboard: SheetClip | null = null;

/** Where a port sits, in grid steps: inputs on the left edge, outputs on the right. */
function portPoint(element: SheetElement, port: string): { x: number; y: number } {
  const { inputs, outputs } = sheetPorts(element);
  const side = inputs.includes(port) ? inputs : outputs;
  const index = side.indexOf(port);
  // Spread evenly down the side: one in the middle, two at the thirds, and so on.
  const { w, h } = sheetSize(element);
  const y = element.y + (h * (index + 1)) / (side.length + 1);
  return { x: inputs.includes(port) ? element.x : element.x + w, y };
}

/**
 * Works the sheet out as time passes, stopping at every clock change so no
 * edge is lost, and notes each moment's levels for the timing diagram.
 */
function useSheetState(sheet: LogicSheet, trace: TimingTrace, clock: () => number): SheetState {
  const last = useRef<SheetState | undefined>(undefined);
  const [state, setState] = useState<SheetState>(() => evaluateSheet(sheet, 0));
  useEffect(() => {
    const ports = timingSignals(sheet).map((signal) => signal.port);
    const work = (at: number, before: SheetState | undefined) => {
      const next = evaluateSheet(sheet, at, before);
      trace.record(at, next.levels, ports);
      return next;
    };
    let key = '';
    const publish = (next: SheetState) => {
      last.current = next;
      const nextKey = JSON.stringify([next.levels, next.memory, next.unsettled]);
      if (nextKey !== key) {
        key = nextKey;
        setState(next);
      }
    };
    let time = clock();
    publish(work(time, last.current));
    if (!sheet.elements.some((e) => e.kind === 'clock')) return;
    let frame = 0;
    const tick = () => {
      const now = clock();
      let current = last.current;
      for (let at = nextSheetClockChange(sheet, time); at <= now;) {
        current = work(at, current);
        at = nextSheetClockChange(sheet, at);
      }
      time = now;
      publish(work(now, current));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [sheet, trace, clock]);
  return state;
}

/** The toolbar's groups: what is placed on the sheet, by what it does. */
const TOOL_GROUPS: { id: string; items: SheetTool[] }[] = [
  { id: 'select', items: ['select'] },
  { id: 'io', items: ['input', 'output', 'clock'] },
  { id: 'gates', items: ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR'] },
  { id: 'blocks', items: ['MUX', 'DEC', 'FA', 'HEX'] },
  { id: 'memory', items: ['DFF', 'JKFF', 'TFF', 'CNT', 'REG', 'RAM'] },
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
    ) : id === 'DEC' || id === 'CNT' || id === 'REG' || id === 'RAM' ? (
      <>
        <rect x="5" y="3" width="14" height="18" rx="1.5" {...common} />
        <text
          x="12"
          y="14.5"
          textAnchor="middle"
          fontSize={id === 'RAM' ? 6 : 7}
          fontWeight={700}
          fill="currentColor"
          stroke="none"
        >
          {{ DEC: '2→4', CNT: '+1', REG: 'R', RAM: 'RAM' }[id]}
        </text>
      </>
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
    case 'DEC':
    case 'CNT':
    case 'REG':
    case 'RAM': {
      const { w: across, h: down } = sheetSize(element);
      const [width, height] = [across * CELL, down * CELL];
      const ports = sheetPorts(element);
      const at = (index: number, count: number) => (height * (index + 1)) / (count + 1);
      const words = state.store[element.id] ?? [0];
      const address = [0, 1, 2, 3].reduce((sum, bit) => sum + (level(`a${bit}`) ? 1 << bit : 0), 0);
      // What the block holds, shown inside it: the count, the value, or the word at the address.
      const shown =
        element.kind === 'DEC'
          ? '2→4'
          : element.kind === 'RAM'
            ? `[${address.toString(16).toUpperCase()}]=${words[address]!.toString(16).toUpperCase()}`
            : String(words[0]);
      return (
        <g
          data-value={
            element.kind === 'DEC' ? undefined : words[element.kind === 'RAM' ? address : 0]
          }
        >
          <rect
            x={8}
            y={4}
            width={width - 16}
            height={height - 8}
            rx={3}
            fill="var(--color-surface)"
            stroke="currentColor"
            strokeWidth={1.6}
          />
          <text x={width / 2} y={18} {...text} fontSize={10} fill="var(--color-ink-soft)">
            {element.kind === 'RAM' ? 'RAM 16×4' : element.kind}
          </text>
          <text
            x={width / 2}
            y={height / 2 + 5}
            {...text}
            fontSize={element.kind === 'RAM' ? 11 : 15}
            fill="currentColor"
            fontFamily="monospace"
          >
            {shown}
          </text>
          {ports.inputs.map((port, i) =>
            port === 'clk' ? (
              <path
                key={port}
                d={`M8 ${at(i, ports.inputs.length) - 5}L14 ${at(i, ports.inputs.length)}L8 ${at(i, ports.inputs.length) + 5}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.4}
              />
            ) : (
              <text
                key={port}
                x={15}
                y={at(i, ports.inputs.length) + 3}
                fontSize={8}
                fill="currentColor"
                stroke="none"
              >
                {port.toUpperCase()}
              </text>
            ),
          )}
          {ports.outputs.map((port, i) => (
            <text
              key={port}
              x={width - 14}
              y={at(i, ports.outputs.length) + 3}
              fontSize={8}
              fill="currentColor"
              stroke="none"
              textAnchor="end"
            >
              {port.toUpperCase()}
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
  // The sheet's own time, from when it was opened; the timing diagram counts in it.
  const start = useRef(performance.now());
  const clock = useCallback(() => performance.now() - start.current, []);
  const [trace] = useState(() => new TimingTrace());
  const state = useSheetState(sheet, trace, clock);
  const [timing, setTiming] = useState(false);
  const [tool, setTool] = useState<SheetTool>('select');
  /** The elements chosen, or one wire. */
  const [selection, setSelection] = useState<string[]>([]);
  const selected = selection.length === 1 ? selection[0]! : null;
  const [clip, setClip] = useState<SheetClip | null>(sheetClipboard);
  /** A box being dragged out over the background to choose what is inside it. */
  const [box, setBox] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    adding: boolean;
  } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [problem, setProblem] = useState<SheetError | null>(null);
  /** The table made, or 'none' when the button was pressed and the sheet has none. */
  const [table, setTable] = useState<SheetTruthTable | 'none' | null>(null);
  /** Elements being dragged: where the pointer started, and how far they have come. */
  const [drag, setDrag] = useState<{
    ids: string[];
    tapped: string;
    sx: number;
    sy: number;
    dx: number;
    dy: number;
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

  const isElement = (id: string) => sheet.elements.some((e) => e.id === id);
  const chosen = selection.filter(isElement);
  /** Where an element is drawn: moved along with a drag. */
  const place = (e: SheetElement) =>
    drag?.ids.includes(e.id) ? { ...e, x: e.x + drag.dx, y: e.y + drag.dy } : e;

  const onBackground = (event: PointerEvent) => {
    setPending(null);
    const at = gridAt(event);
    if (tool === 'select') {
      // Dragging over the background chooses what the box takes in.
      const adding = event.shiftKey || event.ctrlKey || event.metaKey;
      if (!adding) setSelection([]);
      setBox({ x0: at.x, y0: at.y, x1: at.x, y1: at.y, adding });
      return;
    }
    const result = apply((s) =>
      addSheetElement(s, tool, Math.floor(at.x - 1), Math.floor(at.y - 1)),
    );
    if (result.ok) setSelection(result.id ? [result.id] : []);
  };
  const removeSelection = () => {
    if (selected && !isElement(selected)) apply((s) => removeFromSheet(s, selected));
    else if (chosen.length > 0) apply((s) => removeManyFromSheet(s, chosen));
    setSelection([]);
  };
  const copySelection = () => {
    if (chosen.length === 0) return;
    sheetClipboard = copyFromSheet(sheet, chosen);
    setClip(sheetClipboard);
  };
  const paste = () => {
    if (!clip) return;
    const result = apply((s) => pasteIntoSheet(s, clip));
    if (result.ok) setSelection(result.ids ?? []);
  };
  // Keys, while the sheet is open: not while typing in a field.
  const keys = useRef<(event: KeyboardEvent) => void>(() => undefined);
  keys.current = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    const command = event.ctrlKey || event.metaKey;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selection.length === 0) return;
      event.preventDefault();
      removeSelection();
    } else if (command && event.key.toLowerCase() === 'c') {
      copySelection();
    } else if (command && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      paste();
    } else if (command && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      setSelection(sheet.elements.map((e) => e.id));
    } else if (event.key === 'Escape') {
      setSelection([]);
      setPending(null);
    }
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keys.current(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  const onPort = (port: string) => {
    if (pending && pending !== port) {
      apply((s) => connectSheet(s, pending, port));
      setPending(null);
    } else setPending(port === pending ? null : port);
  };

  const selectedElement = sheet.elements.find((e) => e.id === selected);
  const nameOf = (id: string) => {
    const element = sheet.elements.find((e) => e.id === id);
    return element ? sheetName(element) : id;
  };
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
            const at = gridAt(event);
            if (box) setBox({ ...box, x1: at.x, y1: at.y });
            if (!drag) return;
            const dx = Math.round(at.x - drag.sx);
            const dy = Math.round(at.y - drag.sy);
            if (dx !== drag.dx || dy !== drag.dy) setDrag({ ...drag, dx, dy, moved: true });
          }}
          onPointerUp={() => {
            if (box) {
              const [left, right] = [Math.min(box.x0, box.x1), Math.max(box.x0, box.x1)];
              const [top, bottom] = [Math.min(box.y0, box.y1), Math.max(box.y0, box.y1)];
              // A box takes in every element it touches; a tap with no drag takes in nothing.
              if (right - left > 0.3 || bottom - top > 0.3) {
                const inBox = sheet.elements
                  .filter(
                    (e) =>
                      e.x < right &&
                      e.x + sheetSize(e).w > left &&
                      e.y < bottom &&
                      e.y + sheetSize(e).h > top,
                  )
                  .map((e) => e.id);
                setSelection(box.adding ? [...new Set([...chosen, ...inBox])] : inBox);
              }
              setBox(null);
            }
            if (!drag) return;
            if (drag.moved) apply((s) => moveSheetElements(s, drag.ids, drag.dx, drag.dy));
            else {
              const element = sheet.elements.find((e) => e.id === drag.tapped);
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
                  onPointerDown={() => setSelection([wire.id])}
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
            const at = place(element);
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
                  width={sheetSize(element).w * CELL}
                  height={sheetSize(element).h * CELL}
                  rx={6}
                  data-selected={selection.includes(element.id) ? 'true' : undefined}
                  fill={selection.includes(element.id) ? 'var(--color-amber-soft)' : 'transparent'}
                  className="cursor-grab"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setPending(null);
                    // Shift (or Ctrl) adds to the elements chosen, or takes one out again.
                    const adding = event.shiftKey || event.ctrlKey || event.metaKey;
                    let ids: string[];
                    if (adding) {
                      ids = chosen.includes(element.id)
                        ? chosen.filter((id) => id !== element.id)
                        : [...chosen, element.id];
                      setSelection(ids);
                      if (!ids.includes(element.id)) return;
                    } else {
                      // Dragging one of several chosen moves them all.
                      ids = chosen.includes(element.id) ? chosen : [element.id];
                      setSelection(ids);
                    }
                    const grid = gridAt(event);
                    setDrag({
                      ids,
                      tapped: element.id,
                      sx: grid.x,
                      sy: grid.y,
                      dx: 0,
                      dy: 0,
                      moved: false,
                    });
                  }}
                />
                <g pointerEvents="none">
                  <ElementBody element={element} state={state} label={sheetName(element)} />
                  <text
                    x={sheetSize(element).w * CELL - 3}
                    y={9}
                    fontSize={8}
                    textAnchor="end"
                    fill="var(--color-ink-soft)"
                  >
                    {element.kind === 'input' ||
                    element.kind === 'output' ||
                    element.kind === 'clock' ||
                    element.kind === 'DFF' ||
                    (element.label && !(SHEET_GATES as readonly string[]).includes(element.kind))
                      ? sheetName(element)
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
          {box && (
            <rect
              x={Math.min(box.x0, box.x1) * CELL}
              y={Math.min(box.y0, box.y1) * CELL}
              width={Math.abs(box.x1 - box.x0) * CELL}
              height={Math.abs(box.y1 - box.y0) * CELL}
              fill="var(--color-amber-soft)"
              fillOpacity={0.4}
              stroke="var(--color-amber)"
              strokeDasharray="6 4"
              pointerEvents="none"
            />
          )}
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
            {selection.length > 0 && (
              <button
                type="button"
                data-testid="sheet-delete"
                onClick={removeSelection}
                className="min-h-11 rounded-lg border-2 border-line px-3 font-medium hover:border-danger hover:text-danger"
              >
                {selected
                  ? t('sheet.delete', { id: nameOf(selected) })
                  : t('sheet.deleteMany', { count: chosen.length })}
              </button>
            )}
            {chosen.length > 0 && (
              <button
                type="button"
                data-testid="sheet-copy"
                onClick={copySelection}
                className="min-h-11 rounded-lg border-2 border-line px-3 font-medium hover:border-ink-soft"
              >
                {t('sheet.copy')}
              </button>
            )}
            {clip && (
              <button
                type="button"
                data-testid="sheet-paste"
                onClick={paste}
                className="min-h-11 rounded-lg border-2 border-line px-3 font-medium hover:border-ink-soft"
              >
                {t('sheet.paste', { count: clip.elements.length })}
              </button>
            )}
            {selectedElement && (
              <label className="flex items-center gap-2">
                <span className="text-sm text-ink-soft">{t('sheet.label')}</span>
                <input
                  key={selectedElement.id}
                  data-testid="sheet-label"
                  defaultValue={selectedElement.label ?? ''}
                  placeholder={selectedElement.id}
                  maxLength={MAX_LABEL}
                  className="field min-h-11 w-32"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                  onBlur={(event) => {
                    if (event.target.value.trim() !== (selectedElement.label ?? '')) {
                      apply((s) =>
                        setSheetElement(s, selectedElement.id, { label: event.target.value }),
                      );
                    }
                  }}
                />
              </label>
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
            <button
              type="button"
              data-testid="sheet-timing"
              aria-pressed={timing}
              onClick={() => setTiming(!timing)}
              className={`min-h-11 rounded-lg border-2 px-3 font-medium hover:border-ink-soft ${
                timing ? 'border-amber bg-amber-soft' : 'border-line'
              }`}
            >
              {t('sheet.timing')}
            </button>
          </div>
          {timing && <TimingDiagram sheet={sheet} trace={trace} clock={clock} />}
          {table && table !== 'none' && (
            <table className="tabular-nums" data-testid="sheet-truth-table">
              <thead>
                <tr>
                  {[...table.inputs, ...table.outputs].map((id) => (
                    <th key={id} className="px-3 py-1 text-left font-semibold">
                      {nameOf(id)}
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
                  list: table.inputs.map((id, i) => `${'ABCD'[i]} = ${nameOf(id)}`).join(', '),
                })}
              </p>
              {table.outputs.map((id, o) => {
                const column = table.rows.map((row) => row.outputs[o]!);
                return (
                  <div key={id} className="space-y-2 pt-2">
                    <p className="font-mono text-lg" data-testid="sheet-expression">
                      {nameOf(id)} = {simplestSum(table.inputs.length, column)}
                    </p>
                    <KMap
                      inputs={table.inputs.length}
                      outputs={column}
                      terms={simplestTerms(table.inputs.length, column)}
                    />
                  </div>
                );
              })}
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
