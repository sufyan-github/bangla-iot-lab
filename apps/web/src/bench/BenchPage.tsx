import blinkSource from '@banglalab/board-emulators/fixtures/blink.c?raw';
import blinkHex from '@banglalab/board-emulators/fixtures/blink.hex?raw';
import { useMutation } from '@tanstack/react-query';
import { proxy, wrap, type Remote } from 'comlink';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { useOnline } from '../shell/useOnline';
import type { BenchApi, BenchUpdate } from './uno.worker';

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type CompileResult =
  | { ok: true; hex: string; flashBytes: number }
  | {
      ok: false;
      reason: 'compile-error' | 'timeout' | 'program-too-large';
      diagnostics: { line: number; severity: string; message: string }[];
    };

async function compile(source: string): Promise<CompileResult> {
  const response = await fetch(`${API_URL}/v1/compile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ board: 'uno', language: 'c', source }),
  });
  if (!response.ok) throw new Error(`compile request failed: ${response.status}`);
  return response.json();
}

/**
 * Phase 0 proof that programs run on the emulated UNO: a ready-made firmware
 * works offline, and edited C source is compiled by the server's sandboxed worker.
 */
export function BenchPage() {
  const { t, number } = useT();
  const online = useOnline();
  const [source, setSource] = useState(blinkSource);
  const [board, setBoard] = useState<BenchUpdate | null>(null);
  const [serial, setSerial] = useState('');
  const worker = useRef<{ api: Remote<BenchApi>; raw: Worker } | null>(null);

  useEffect(() => () => worker.current?.raw.terminate(), []);

  const run = async (hex: string) => {
    if (!worker.current) {
      const raw = new Worker(new URL('./uno.worker.ts', import.meta.url), {
        type: 'module',
        name: 'uno',
      });
      worker.current = { raw, api: wrap<BenchApi>(raw) };
    }
    setSerial('');
    await worker.current.api.start(
      hex,
      proxy((update: BenchUpdate) => {
        setBoard(update);
        if (update.serial) setSerial((text) => (text + update.serial).slice(-4000));
      }),
    );
  };
  const stop = () => {
    void worker.current?.api.stop();
    setBoard(null);
  };

  const build = useMutation({
    mutationFn: compile,
    onSuccess: (result) => {
      if (result.ok) void run(result.hex);
    },
  });
  const result = build.data;
  const running = board !== null;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <h1 className="text-3xl font-semibold">{t('bench.title')}</h1>
      <p className="mt-1 max-w-2xl text-ink-soft">{t('bench.intro')}</p>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_20rem]">
        <section>
          <label className="block">
            <span className="mb-1 block font-semibold">{t('bench.code')}</span>
            <textarea
              data-testid="source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              spellCheck={false}
              rows={18}
              className="w-full rounded-xl border-2 border-line bg-surface p-3 font-mono text-sm leading-relaxed"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="run-built-in"
              onClick={() => {
                build.reset();
                void run(blinkHex);
              }}
              className="min-h-12 rounded-xl bg-amber px-4 text-lg font-semibold hover:brightness-105"
            >
              ▶ {t('bench.runBuiltIn')}
            </button>
            <button
              type="button"
              data-testid="compile-run"
              disabled={!online || build.isPending}
              onClick={() => build.mutate(source)}
              className="min-h-12 rounded-xl border-2 border-ink px-4 text-lg font-semibold hover:bg-surface disabled:cursor-not-allowed disabled:border-line disabled:text-ink-soft"
            >
              {t(build.isPending ? 'bench.compiling' : 'bench.compileRun')}
            </button>
            {running && (
              <button
                type="button"
                onClick={stop}
                className="min-h-12 rounded-xl px-4 text-lg font-medium text-ink-soft hover:bg-surface"
              >
                ■ {t('bench.stop')}
              </button>
            )}
          </div>
          <p className="mt-2 text-sm text-ink-soft">{t('bench.needsInternet')}</p>

          <div className="mt-3 text-sm" aria-live="polite" data-testid="compile-status">
            {build.isError && (
              <p className="rounded-lg border-l-4 border-danger bg-danger-soft px-3 py-2">
                {t('bench.compilerDown')}
              </p>
            )}
            {result?.ok && (
              <p className="rounded-lg border-l-4 border-ok bg-ok-soft px-3 py-2">
                {t('bench.compiled', { bytes: number(result.flashBytes, 6) })}
              </p>
            )}
            {result && !result.ok && (
              <div className="rounded-lg border-l-4 border-danger bg-danger-soft px-3 py-2">
                {result.reason === 'program-too-large' && t('bench.tooLarge')}
                {result.reason === 'timeout' && t('bench.timeout')}
                {result.reason === 'compile-error' && (
                  <>
                    <p className="font-semibold">{t('bench.compileError')}</p>
                    <ul className="mt-1 list-disc pl-5">
                      {result.diagnostics
                        .filter((d) => d.severity === 'error')
                        .map((d, i) => (
                          <li key={i}>
                            {t('bench.line', { line: number(d.line), message: '' })}
                            <span dir="ltr" lang="en" className="font-mono">
                              {d.message}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-xl bg-mat p-4 text-paper">
            <h2 className="font-semibold">{t('bench.board')}</h2>
            <svg viewBox="0 0 260 170" className="mt-2 w-full" aria-hidden>
              <rect
                x="4"
                y="10"
                width="252"
                height="150"
                rx="10"
                fill="#0f7a86"
                stroke="#0a5a63"
                strokeWidth="2"
              />
              <rect x="-2" y="34" width="46" height="40" rx="3" fill="#b9c0c4" />
              <rect x="0" y="104" width="34" height="34" rx="3" fill="#22282b" />
              <rect x="112" y="92" width="116" height="30" rx="3" fill="#1b1f21" />
              <rect x="86" y="16" width="160" height="12" rx="2" fill="#15191b" />
              <rect x="118" y="142" width="128" height="12" rx="2" fill="#15191b" />
              <text x="176" y="111" textAnchor="middle" fontSize="9" fill="#8b979c">
                ATmega328P
              </text>
              <text x="100" y="42" fontSize="9" fill="#d7f0f2">
                13
              </text>
              {board?.led && <circle cx="104" cy="58" r="20" fill="#ffb52e" opacity="0.45" />}
              <rect
                x="98"
                y="54"
                width="12"
                height="8"
                rx="2"
                fill={board?.led ? '#ffd45e' : '#6a5a2c'}
                data-testid="pin13"
                data-on={board?.led ?? false}
              />
              <text x="116" y="62" fontSize="9" fill="#d7f0f2">
                L
              </text>
              <text x="60" y="150" fontSize="13" fontWeight="700" fill="#d7f0f2">
                UNO
              </text>
            </svg>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 text-sm">
              <dt className="text-paper/75">{t('bench.pin13')}</dt>
              <dd className="font-semibold">{t(board?.led ? 'bench.on' : 'bench.off')}</dd>
              <dt className="text-paper/75">{t('bench.time')}</dt>
              <dd className="font-semibold tabular-nums" data-testid="board-time">
                {number((board?.timeMs ?? 0) / 1000, 4)} s
              </dd>
            </dl>
          </div>
          <div>
            <h2 className="font-semibold">{t('bench.serial')}</h2>
            <pre
              data-testid="serial"
              className="mt-1 min-h-20 overflow-auto rounded-xl bg-ink p-3 font-mono text-sm whitespace-pre-wrap text-paper"
            >
              {serial || <span className="text-paper/60">{t('bench.serialEmpty')}</span>}
            </pre>
          </div>
          <p className="text-sm text-ink-soft">{t('bench.limit')}</p>
        </section>
      </div>
    </main>
  );
}
