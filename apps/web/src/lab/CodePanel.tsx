import { useMutation, useQuery } from '@tanstack/react-query';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { isProgrammable, type ProgrammableType } from '@banglalab/shared';
import { compileSketch, hasChipEmulator } from '../api';
import { useT } from '../i18n';
import { useOnline } from '../shell/useOnline';
import { matchingStarter, starterIds, starterLabel, starterProgram } from './starters';
import { programText, type SketchTab } from '../storage/projects';
import { SerialPlot } from './SerialPlot';
import { useLab } from './store';

/** The main file's name, as the Arduino IDE shows a sketch's first tab. */
const MAIN_TAB = 'sketch.ino';
/** Names a new tab may have: a plain name and .ino, .h, .c or .cpp, as the compile server accepts. */
const TAB_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,39}\.(ino|h|hpp|c|cpp)$/;
const MAX_TABS = 16;

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
  const { setSource, setFiles, uploadProgram, setEngine, clearSerial } = useLab.getState();
  const { t, number } = useT();
  const online = useOnline();
  const source = program?.source ?? '';
  const files: SketchTab[] = program?.files ?? [];
  /** The tab being edited: the main file, or one of the others by name. */
  const [tab, setTab] = useState(MAIN_TAB);
  const open = files.find((file) => file.name === tab);
  const [newName, setNewName] = useState('');
  const nameError =
    newName === ''
      ? null
      : !TAB_NAME.test(newName) || /^(sketch|firmware)\./.test(newName)
        ? 'code.tabNameBad'
        : files.some((file) => file.name.toLowerCase() === newName.toLowerCase())
          ? 'code.tabNameTaken'
          : null;
  const addTab = () => {
    if (newName === '' || nameError || files.length >= MAX_TABS) return;
    setFiles(boardId, [...files, { name: newName, source: '' }]);
    setTab(newName);
    setNewName('');
  };
  const removeTab = (name: string) => {
    setFiles(
      boardId,
      files.filter((file) => file.name !== name),
    );
    setTab(MAIN_TAB);
  };
  const editTab = (next: string) => {
    if (!open) setSource(boardId, next);
    else
      setFiles(
        boardId,
        files.map((file) => (file.name === open.name ? { ...file, source: next } : file)),
      );
  };

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
    mutationFn: (sketch: { source: string; files: SketchTab[] }) =>
      compileSketch(sketch.source, board, engine, sketch.files),
    onSuccess: (result, compiled) => {
      if (result.ok)
        uploadProgram(boardId, {
          source: compiled.source,
          ...(compiled.files.length ? { files: compiled.files } : {}),
          hex: result.hex,
          hexSource: programText(compiled),
          ...(engine ? { engine } : {}),
        });
    },
  });
  const result = build.data;
  const upToDate =
    typeof program?.hex === 'string' &&
    program.hexSource === programText({ source, files }) &&
    (engine === undefined || builtFor === engine);

  /** The serial monitor as text, or its numbers drawn as lines. */
  const [serialMode, setSerialMode] = useState<'text' | 'plot'>('text');
  const serialBox = useRef<HTMLPreElement>(null);
  useEffect(() => {
    serialBox.current?.scrollTo({ top: serialBox.current.scrollHeight });
  }, [serial]);

  const chooseStarter = async (id: string) => {
    if (id === 'custom') return;
    build.reset();
    const starter = await starterProgram(id, board);
    setTab(MAIN_TAB);
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
          <Link to="/esp32" className="font-medium text-accent underline" data-testid="esp32-more">
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
                  engine === choice ? 'border-accent bg-paper' : 'border-line bg-surface'
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
          value={(files.length === 0 && matchingStarter(source, board)) || 'custom'}
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
        {/* The sketch's files, as tabs: the main one first, then the others. */}
        <div role="tablist" aria-label={t('code.files')} className="mb-2 flex flex-wrap gap-1.5">
          {[MAIN_TAB, ...files.map((file) => file.name)].map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              data-testid={`code-tab-${name}`}
              aria-selected={name === (open ? open.name : MAIN_TAB)}
              onClick={() => setTab(name)}
              className={`min-h-10 rounded-lg border-2 px-3 font-mono text-sm ${
                name === (open ? open.name : MAIN_TAB)
                  ? 'border-amber bg-amber-soft text-ink'
                  : 'border-line text-ink-soft hover:border-ink-soft'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <Suspense fallback={<div className="h-56 rounded-xl border-2 border-line bg-paper" />}>
          <CodeEditor
            key={open ? open.name : MAIN_TAB}
            value={open ? open.source : source}
            label={`${t('code.editor')}: ${open ? open.name : MAIN_TAB}`}
            onChange={editTab}
          />
        </Suspense>
        <div className="mt-2 flex flex-wrap items-start gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">{t('code.newTab')}</span>
            <input
              data-testid="new-tab-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value.trim())}
              onKeyDown={(event) => event.key === 'Enter' && addTab()}
              placeholder={t('code.newTabPlaceholder')}
              className="min-h-11 w-full rounded-lg border-2 border-line bg-surface px-3 font-mono text-sm"
            />
          </label>
          <button
            type="button"
            data-testid="add-tab"
            disabled={newName === '' || nameError !== null || files.length >= MAX_TABS}
            onClick={addTab}
            className="min-h-11 rounded-lg border-2 border-line px-3 text-sm font-medium hover:border-ink-soft disabled:opacity-50"
          >
            {t('code.newTab')}
          </button>
          {open && (
            <button
              type="button"
              data-testid="remove-tab"
              onClick={() => removeTab(open.name)}
              className="min-h-11 rounded-lg border-2 border-danger/40 px-3 text-sm font-medium text-danger hover:bg-danger-soft"
            >
              {t('code.removeTab', { name: open.name })}
            </button>
          )}
        </div>
        {nameError && (
          <p className="mt-1 text-sm text-danger" data-testid="tab-name-error">
            {t(nameError)}
          </p>
        )}
      </div>

      <div>
        <button
          type="button"
          data-testid="upload"
          disabled={!online || build.isPending || upToDate}
          onClick={() => build.mutate({ source, files })}
          className="min-h-12 w-full rounded-xl bg-amber px-4 text-lg font-semibold text-graphite hover:brightness-105 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft"
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
                        {d.file && (
                          <span dir="ltr" className="font-mono">
                            {d.file}:{' '}
                          </span>
                        )}
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
        <div className="mb-1.5 flex items-center gap-2">
          <h2 className="mr-auto text-base font-semibold">{t('code.serial')}</h2>
          <div
            role="group"
            aria-label={t('code.serialView')}
            className="flex gap-0.5 rounded-lg bg-paper p-0.5"
          >
            {(['text', 'plot'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                data-testid={`serial-${mode}`}
                aria-pressed={serialMode === mode}
                onClick={() => setSerialMode(mode)}
                className={`min-h-9 rounded-md px-2.5 text-sm font-medium ${serialMode === mode ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'}`}
              >
                {t(mode === 'text' ? 'code.serialText' : 'code.plot')}
              </button>
            ))}
          </div>
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
        {serialMode === 'plot' && <SerialPlot text={serial} />}
        <pre
          hidden={serialMode === 'plot'}
          ref={serialBox}
          data-testid="serial"
          className="h-36 overflow-auto rounded-xl bg-graphite p-3 font-mono text-sm whitespace-pre-wrap text-chalk"
        >
          {serial || <span className="text-chalk/60">{t('code.serialEmpty')}</span>}
        </pre>
      </div>
    </div>
  );
}
