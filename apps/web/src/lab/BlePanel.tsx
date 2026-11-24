import type { BleCharacteristic } from '@banglalab/simulation';
import { useState } from 'react';
import { useT } from '../i18n';
import { simulation } from '../sim/client';
import { useLab } from './store';

/** The ESP32 library's property bits. */
const READ = 1;
const WRITE = 2;
const NOTIFY = 4;
const INDICATE = 16;
const WRITE_NR = 32;

/** A value as text when it reads as text, and always as bytes in hex. */
function shown(bytes: readonly number[]): { text: string | null; hex: string } {
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    // Control characters other than tabs and line breaks mean it is not meant as text.
    const control = [...text].some((c) => {
      const code = c.codePointAt(0)!;
      return code < 32 && code !== 9 && code !== 10 && code !== 13;
    });
    return { text: control ? null : text, hex };
  } catch {
    return { text: null, hex };
  }
}

function Characteristic({
  boardId,
  characteristic,
  connected,
}: {
  boardId: string;
  characteristic: BleCharacteristic;
  connected: boolean;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState('');
  const { properties: p } = characteristic;
  const value = shown(characteristic.value);
  const writable = (p & (WRITE | WRITE_NR)) !== 0;
  const tags = [
    p & READ ? t('ble.read') : null,
    writable ? t('ble.write') : null,
    p & (NOTIFY | INDICATE) ? t('ble.notify') : null,
  ].filter(Boolean);
  return (
    <li
      className="space-y-1.5 px-3 py-2.5"
      data-testid="ble-characteristic"
      data-handle={characteristic.handle}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-paper/70" title={characteristic.uuid}>
          {characteristic.uuid.slice(0, 8)}…
        </span>
        {tags.map((tag) => (
          <span key={tag} className="rounded-full bg-paper/10 px-2 py-0.5 text-xs text-paper/80">
            {tag}
          </span>
        ))}
      </div>
      {p & READ ? (
        <p className="font-mono text-paper" data-testid="ble-value">
          {value.text ?? value.hex}
          {value.text !== null && value.hex && (
            <span className="ml-2 text-xs text-paper/50">{value.hex}</span>
          )}
        </p>
      ) : null}
      {writable && (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void simulation().bleWrite(boardId, characteristic.handle, draft);
          }}
        >
          <input
            data-testid="ble-write-input"
            aria-label={t('ble.writeLabel')}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={200}
            disabled={!connected}
            className="field min-h-10 min-w-0 flex-1 bg-paper text-ink"
          />
          <button
            type="submit"
            data-testid="ble-write-send"
            disabled={!connected}
            className="btn btn-primary min-h-10"
          >
            {t('ble.send')}
          </button>
        </form>
      )}
    </li>
  );
}

/**
 * The lab's phone, as a BLE app: it finds the board by the name it
 * advertises, connects, reads and writes its characteristics, and shows the
 * notifications it sends. There is one phone, and it sees only the lab's boards.
 */
export function BlePanel({ boardId }: { boardId: string }) {
  const { t } = useT();
  const running = useLab((s) => s.running);
  const ble = useLab((s) => s.boards[boardId]?.ble);
  const notes = useLab((s) => s.bleNotes[boardId]) ?? [];
  const [refused, setRefused] = useState(false);

  if (!running) return <p className="px-4 py-4 text-sm text-ink-soft">{t('ble.idle')}</p>;
  const act = async (connect: boolean) => {
    setRefused(!(await simulation().bleConnect(boardId, connect)));
  };

  return (
    <div className="space-y-3 px-4 py-4" data-testid="ble-panel">
      <p className="text-sm text-ink-soft">{t('ble.about')}</p>
      {!ble ? (
        <p className="text-sm text-ink-soft" data-testid="ble-none">
          {t('ble.none')}
        </p>
      ) : (
        <section
          className="screen space-y-2 p-3"
          data-testid="ble-device"
          data-connected={ble.connected}
          data-advertising={ble.advertising}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 font-semibold text-paper">{ble.name || boardId}</span>
            <span className="text-xs text-paper/70">
              {ble.connected
                ? t('ble.connected')
                : ble.advertising
                  ? t('ble.advertising')
                  : t('ble.hidden')}
            </span>
            {ble.connected ? (
              <button
                type="button"
                data-testid="ble-disconnect"
                className="btn btn-secondary min-h-10"
                onClick={() => void act(false)}
              >
                {t('ble.disconnect')}
              </button>
            ) : (
              <button
                type="button"
                data-testid="ble-connect"
                disabled={!ble.advertising}
                className="btn btn-primary min-h-10"
                onClick={() => void act(true)}
              >
                {t('ble.connect')}
              </button>
            )}
          </div>
          {refused && <p className="text-sm text-amber">{t('ble.refused')}</p>}
          <ul className="divide-y divide-screen-line rounded-lg border border-screen-line">
            {ble.characteristics.map((characteristic) => (
              <Characteristic
                key={characteristic.handle}
                boardId={boardId}
                characteristic={characteristic}
                connected={ble.connected}
              />
            ))}
          </ul>
        </section>
      )}
      {notes.length > 0 && (
        <section className="space-y-1">
          <h3 className="section-title">{t('ble.notes')}</h3>
          <ol className="space-y-0.5 font-mono text-sm">
            {[...notes]
              .reverse()
              .slice(0, 12)
              .map((note, i) => {
                const value = shown(note.value);
                return (
                  <li key={`${note.timeMs}-${i}`} data-testid="ble-note" className="flex gap-3">
                    <span className="w-16 shrink-0 text-ink-soft tabular-nums">
                      {(note.timeMs / 1000).toFixed(1)} s
                    </span>
                    <span>{value.text ?? value.hex}</span>
                  </li>
                );
              })}
          </ol>
        </section>
      )}
    </div>
  );
}
