import { boardPinNumber, isProgrammable, parseTerminal } from '@banglalab/shared';
import type { Probe } from '@banglalab/simulation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { signalStats, signals, type SignalStats } from './signals';
import { useLab } from './store';

const SPANS_MS = [20, 100, 1000, 5000] as const;
const CHANNEL_COLORS = ['#e8a21a', '#4fb3ff'];
const PLOT_HEIGHT = 190;
const ROW_HEIGHT = 26;
const LABEL_WIDTH = 46;

/** Rounds a voltage range up to a tidy full-scale value. */
function fullScale(volts: number): number {
  return [1, 2, 5, 10, 15, 20, 30].find((scale) => volts <= scale) ?? 30;
}

function socketName(probe: Probe): string {
  const pin = parseTerminal(probe.slice('socket:'.length))?.pin ?? '';
  return pin.startsWith('d') ? pin.slice(1) : pin.toUpperCase();
}

/**
 * Oscilloscope (two voltage channels) and logic analyser (every wired board
 * pin), drawn from the signals the simulation records.
 */
export function SignalsPanel() {
  const circuit = useLab((s) => s.circuit);
  const running = useLab((s) => s.running);
  const { setProbes } = useLab.getState();
  const { t, quantity, number } = useT();

  const parts = circuit.components.filter((c) => !isProgrammable(c));
  /** The pin number behind a wire end that sits in a board's socket, or null. */
  const pinOf = useCallback(
    (end: string): number | null => {
      const terminal = parseTerminal(end);
      const owner = circuit.components.find((c) => c.id === terminal?.componentId);
      return terminal && owner && isProgrammable(owner)
        ? boardPinNumber(owner.type, terminal.pin)
        : null;
    },
    [circuit.components],
  );
  /** Board pins with a wire in them, in pin order. */
  const pinProbes = useMemo(() => {
    const sockets = new Set<string>();
    for (const wire of circuit.wires) {
      for (const end of [wire.from, wire.to]) {
        if (pinOf(end) !== null) sockets.add(end);
      }
    }
    return [...sockets]
      .sort((a, b) => pinOf(a)! - pinOf(b)!)
      .map((socket): Probe => `socket:${socket}`);
  }, [circuit.wires, pinOf]);

  const firstChoice =
    parts.find((c) => c.type === 'led') ?? parts.find((c) => c.type === 'capacitor') ?? parts[0];
  const [channels, setChannels] = useState<(Probe | null)[]>([
    firstChoice ? `part:${firstChoice.id}` : null,
    null,
  ]);
  const [spanMs, setSpanMs] = useState<number>(1000);
  const [stats, setStats] = useState<(SignalStats | null)[]>([null, null]);

  // Record the chosen channels plus every wired pin while this panel is open.
  const probeKey = [...channels, ...pinProbes].join();
  useEffect(() => {
    const chosen = channels.filter((probe): probe is Probe => probe !== null);
    setProbes([...new Set([...chosen, ...pinProbes])]);
    // `probeKey` stands for the contents of both lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probeKey]);
  useEffect(() => () => setProbes([]), [setProbes]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let drawn = -1;
    let lastStats = 0;
    let frame = 0;

    const draw = (timestamp: number) => {
      frame = requestAnimationFrame(draw);
      if (signals.version === drawn && canvas.width > 0) return;
      drawn = signals.version;

      const width = canvas.clientWidth;
      const height = PLOT_HEIGHT + pinProbes.length * ROW_HEIGHT;
      const ratio = window.devicePixelRatio || 1;
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;
      }
      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = '#13231f';
      context.fillRect(0, 0, width, height);

      const plotWidth = width - LABEL_WIDTH;
      const x = (time: number, from: number) => LABEL_WIDTH + ((time - from) / spanMs) * plotWidth;
      const views = channels.map((probe) => (probe ? signals.window(probe, spanMs) : null));
      const measured = views.map((view) => (view ? signalStats(view) : null));
      const peak = Math.max(
        1,
        ...measured.flatMap((m) => (m ? [Math.abs(m.max), Math.abs(m.min)] : [])),
      );
      const scale = fullScale(peak);
      const negative = measured.some((m) => m !== null && m.min < -0.05);
      const top = 12;
      const bottom = PLOT_HEIGHT - 14;
      const zero = negative ? (top + bottom) / 2 : bottom;
      const y = (volts: number) => zero - (volts / scale) * (zero - top);

      // Grid: voltage lines with labels, and ten time divisions.
      context.font = '11px sans-serif';
      context.lineWidth = 1;
      for (const fraction of negative ? [-1, -0.5, 0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]) {
        const level = y(fraction * scale);
        context.strokeStyle = fraction === 0 ? '#5d7a72' : '#2a4a42';
        context.beginPath();
        context.moveTo(LABEL_WIDTH, level);
        context.lineTo(width, level);
        context.stroke();
        context.fillStyle = '#b9c9c4';
        context.fillText(`${fraction * scale} V`, 4, level + 4);
      }
      context.strokeStyle = '#2a4a42';
      for (let division = 1; division < 10; division++) {
        const column = LABEL_WIDTH + (plotWidth * division) / 10;
        context.beginPath();
        context.moveTo(column, top);
        context.lineTo(column, bottom);
        context.stroke();
      }

      /** Draws a signal as steps: each value holds until the next sample. */
      const trace = (
        view: NonNullable<(typeof views)[number]>,
        toY: (value: number) => number,
        color: string,
      ) => {
        context.strokeStyle = color;
        context.lineWidth = 2;
        context.beginPath();
        let started = false;
        for (let i = 0; i < view.times.length; i++) {
          const column = x(Math.max(view.times[i]!, view.from), view.from);
          const level = toY(view.values[i]!);
          if (started) context.lineTo(column, level);
          else context.moveTo(column, level);
          started = true;
          context.lineTo(x(Math.min(view.times[i + 1] ?? view.to, view.to), view.from), level);
        }
        context.stroke();
      };
      views.forEach((view, channel) => view && trace(view, y, CHANNEL_COLORS[channel]!));

      // Logic analyser rows: above 2.5 V counts as HIGH.
      pinProbes.forEach((probe, row) => {
        const rowTop = PLOT_HEIGHT + row * ROW_HEIGHT;
        context.fillStyle = row % 2 === 0 ? '#1a302b' : '#13231f';
        context.fillRect(0, rowTop, width, ROW_HEIGHT);
        context.fillStyle = '#b9c9c4';
        context.fillText(socketName(probe), 6, rowTop + 17);
        const view = signals.window(probe, spanMs);
        if (view) trace(view, (volts) => rowTop + (volts > 2.5 ? 6 : ROW_HEIGHT - 6), '#7dff9b');
      });

      // Numbers change far less often than the picture.
      if (timestamp - lastStats > 250) {
        lastStats = timestamp;
        setStats(measured);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [channels, pinProbes, spanMs]);

  const probeLabel = (probe: Probe) =>
    probe.startsWith('part:') ? probe.slice(5) : t('scope.socket', { pin: socketName(probe) });
  const options: Probe[] = [...parts.map((c): Probe => `part:${c.id}`), ...pinProbes];

  return (
    <div className="space-y-4 px-4 py-4" data-testid="signals-panel">
      <section>
        <h2 className="text-base font-semibold">{t('scope.title')}</h2>
        <p className="text-sm text-ink-soft">{t('scope.about')}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {channels.map((probe, channel) => (
            <label key={channel} className="block">
              <span className="mb-1 flex items-center gap-1.5 text-sm text-ink-soft">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: CHANNEL_COLORS[channel] }}
                />
                {t('scope.channel', { n: channel + 1 })}
              </span>
              <select
                data-testid={`channel-${channel + 1}`}
                value={probe ?? ''}
                onChange={(event) =>
                  setChannels(
                    channels.map((old, i) =>
                      i === channel ? (event.target.value as Probe) || null : old,
                    ),
                  )
                }
                className="min-h-11 w-full rounded-lg border-2 border-line bg-surface px-2"
              >
                <option value="">{t('scope.none')}</option>
                {options.map((option) => (
                  <option key={option} value={option}>
                    {probeLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <fieldset className="mt-2">
          <legend className="mb-1 text-sm text-ink-soft">{t('scope.span')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {SPANS_MS.map((span) => (
              <button
                key={span}
                type="button"
                data-testid={`span-${span}`}
                aria-pressed={spanMs === span}
                onClick={() => setSpanMs(span)}
                className={`min-h-11 rounded-lg border-2 px-3 text-sm font-medium ${
                  spanMs === span
                    ? 'border-amber bg-amber-soft'
                    : 'border-line hover:border-ink-soft'
                }`}
              >
                {number(span / 1000)} s
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      <div>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={t('scope.title')}
          className="block w-full rounded-xl"
          style={{ height: PLOT_HEIGHT + pinProbes.length * ROW_HEIGHT }}
        />
        {!running && signals.times.length === 0 && (
          <p className="mt-2 text-sm text-ink-soft">{t('scope.idle')}</p>
        )}
      </div>

      <table className="w-full text-sm tabular-nums">
        <thead className="text-left text-ink-soft">
          <tr>
            <th className="py-1 font-medium" />
            <th className="py-1 text-right font-medium">{t('scope.min')}</th>
            <th className="py-1 text-right font-medium">{t('scope.max')}</th>
            <th className="py-1 text-right font-medium">{t('scope.average')}</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((probe, channel) => {
            const measured = stats[channel];
            if (!probe || !measured) return null;
            return (
              <tr
                key={channel}
                className="border-t border-line"
                data-testid={`stats-${channel + 1}`}
                data-min={measured.min.toFixed(3)}
                data-max={measured.max.toFixed(3)}
                data-average={measured.average.toFixed(3)}
              >
                <td className="py-1.5">{probeLabel(probe)}</td>
                <td className="py-1.5 text-right">{quantity(measured.min, 'V')}</td>
                <td className="py-1.5 text-right">{quantity(measured.max, 'V')}</td>
                <td className="py-1.5 text-right">{quantity(measured.average, 'V')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section>
        <h2 className="text-base font-semibold">{t('scope.logic')}</h2>
        <p className="text-sm text-ink-soft">
          {t(pinProbes.length > 0 ? 'scope.logicAbout' : 'scope.logicEmpty')}
        </p>
      </section>
    </div>
  );
}
