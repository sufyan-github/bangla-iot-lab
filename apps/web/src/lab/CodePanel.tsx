import { useMutation, useQuery } from '@tanstack/react-query';
import { Suspense, lazy, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { isProgrammable, type ProgrammableType } from '@banglalab/shared';
import { compileSketch, hasChipEmulator } from '../api';
import { useT } from '../i18n';
import { useOnline } from '../shell/useOnline';
import { matchingStarter, starterIds, starterLabel, starterProgram } from './starters';
import { useLab } from './store';

// The editor is the heaviest part of the app, so it loads only when a board is used.
const CodeEditor = lazy(() => import('./CodeEditor'));

/** Program editor, upload button and serial monitor for one board. */
export function CodePanel({ boardId }: { boardId: string }) {
  const program = useLab((s) => s.programs[boardId]);
  const serial = useLab((s) => s.serial[boardId] ?? '');
  const boardType = useLab(
    (s) => s.circuit.components.find((c) => c.id === boardId && isProgrammable(c))?.type,
  ) as ProgrammableType | undefined;
  const board: ProgrammableType = boardType ?? 'uno';
  const { setSource, uploadProgram, setEngine, clearSerial } = useLab.getState();
  const { t, number } = useT();
  const online = useOnline();
  const source = program?.source ?? '';

  // The ESP32 has two ways of running a program, when this build carries the chip emulator.
  const emulatorBuilt = useQuery({
    queryKey: ['chip-emulator'],
    queryFn: hasChipEmulator,
    enabled: board === 'esp32',
    staleTime: Infinity,
  }).data;
  const engine = board === 'esp32' ? (program?.engine ?? 'library') : undefined;
  /** What the program now on the board was built for: real firmware is stored as JSON. */
  const builtFor = program?.hex?.trimStart().startsWith('{') ? 'emulator' : 'library';

  const build = useMutation({
    mutationFn: (code: string) => compileSketch(code, board, engine),
    onSuccess: (result, compiled) => {
      if (result.ok)
        uploadProgram(boardId, {
          source: compiled,
          hex: result.hex,
          hexSource: compiled,
          ...(engine ? { engine } : {}),
        });
    },
  });
  const result = build.data;
  const upToDate =
    typeof program?.hex === 'string' &&
    program.hexSource === source &&
    (engine === undefined || builtFor === engine);

  const serialBox = useRef<HTMLPreElement>(null);
  useEffect(() => {
    serialBox.current?.scrollTo({ top: serialBox.current.scrollHeight });
  }, [serial]);

  const chooseStarter = async (id: string) => {
    if (id === 'custom') return;
    build.reset();
    const starter = await starterProgram(id, board);
    // Ready-made programs ship built for the lab's own model of the board. For
    // the chip emulator only the sketch is taken: it is built when uploaded.
    if (engine === 'emulator') setSource(boardId, starter.source);
    else uploadProgram(boardId, starter);
  };
  const chooseEngine = (next: 'library' | 'emulator') => {
    build.reset();
    setEngine(boardId, next);
  };

  return (
    <div className="space-y-4 px-4 py-4" data-testid="code-panel" data-board={board}>
      {board === 'esp32' && (
        <p
          className="rounded-lg border-l-4 border-amber bg-amber-soft px-3 py-2 text-sm"
          data-testid="esp32-note"
        >
          {t(engine === 'emulator' ? 'code.esp32.emulatorNote' : 'code.esp32.note')}{' '}
          <Link to="/esp32" className="font-medium text-mat underline" data-testid="esp32-more">
            {t('code.esp32.more')}
          </Link>
        </p>
      )}
      {board === 'esp32' && emulatorBuilt && (
        <fieldset data-testid="engine">
          <legend className="mb-1.5 text-sm text-ink-soft">{t('code.engine')}</legend>
          <div className="grid gap-2">
            {(['library', 'emulator'] as const).map((choice) => (
              <label
                key={choice}
                className={`flex cursor-pointer gap-3 rounded-lg border-2 px-3 py-2 ${
                  engine === choice ? 'border-mat bg-paper' : 'border-line bg-surface'
                }`}
              >
                <input
                  type="radio"
                  name={`engine-${boardId}`}
                  data-testid={`engine-${choice}`}
                  className="mt-1.5"
                  checked={engine === choice}
                  onChange={() => chooseEngine(choice)}
                />
                <span>
                  <span className="block font-medium">{t(`code.engine.${choice}`)}</span>
                  <span className="block text-sm text-ink-soft">
                    {t(`code.engine.${choice}.about`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-soft">{t('code.starter')}</span>
        <select
          data-testid="starter"
          value={matchingStarter(source, board) ?? 'custom'}
          onChange={(event) => void chooseStarter(event.target.value)}
          className="min-h-11 w-full rounded-lg border-2 border-line bg-surface px-3"
        >
          {starterIds(board).map((id) => (
            <option key={id} value={id}>
              {t(starterLabel(board, id))}
            </option>
          ))}
          <option value="custom">{t('code.starter.custom')}</option>
        </select>
      </label>

      <div>
        <p className="mb-1.5 text-sm text-ink-soft">{t('code.editor')}</p>
        <Suspense fallback={<div className="h-56 rounded-xl border-2 border-line bg-paper" />}>
          <CodeEditor
            value={source}
            label={t('code.editor')}
            onChange={(next) => setSource(boardId, next)}
          />
        </Suspense>
      </div>

      <div>
        <button
          type="button"
          data-testid="upload"
          disabled={!online || build.isPending || upToDate}
          onClick={() => build.mutate(source)}
          className="min-h-12 w-full rounded-xl bg-amber px-4 text-lg font-semibold text-ink hover:brightness-105 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft"
        >
          {t(build.isPending ? 'code.uploading' : 'code.upload')}
        </button>
        <div className="mt-2 text-sm" aria-live="polite" data-testid="upload-status">
          {build.isError ? (
            <p className="rounded-lg border-l-4 border-danger bg-danger-soft px-3 py-2">
              {t('code.compilerDown')}
            </p>
          ) : result && !result.ok && !upToDate ? (
            <div className="rounded-lg border-l-4 border-danger bg-danger-soft px-3 py-2">
              {result.reason === 'program-too-large' && t('code.tooLarge')}
              {result.reason === 'timeout' && t('code.timeout')}
              {result.reason === 'compile-error' && (
                <>
                  <p className="font-semibold">{t('code.compileError')}</p>
                  <ul className="mt-1 list-disc pl-5">
                    {result.diagnostics.map((d, i) => (
                      <li key={i}>
                        {t('code.line', { line: number(d.line) })}
                        {/* Compiler messages are English; mark them so they render and read correctly. */}
                        <span dir="ltr" lang="en" className="font-mono">
                          {d.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : upToDate ? (
            <p
              className="rounded-lg border-l-4 border-ok bg-ok-soft px-3 py-2"
              data-uploaded="true"
            >
              {t('code.uploaded')}
            </p>
          ) : (
            <p className="rounded-lg border-l-4 border-amber bg-amber-soft px-3 py-2">
              {t('code.changed')} {!online && t('code.needsInternet')}
            </p>
          )}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t('code.serial')}</h2>
          {serial && (
            <button
              type="button"
              onClick={() => clearSerial(boardId)}
              className="rounded-lg px-2 py-1 text-sm text-ink-soft hover:bg-paper"
            >
              {t('code.clear')}
            </button>
          )}
        </div>
        <pre
          ref={serialBox}
          data-testid="serial"
          className="h-36 overflow-auto rounded-xl bg-ink p-3 font-mono text-sm whitespace-pre-wrap text-paper"
        >
          {serial || <span className="text-paper/60">{t('code.serialEmpty')}</span>}
        </pre>
      </div>
    </div>
  );
}
