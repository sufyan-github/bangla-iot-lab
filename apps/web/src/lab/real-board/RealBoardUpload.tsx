import type { MessageKey } from '@banglalab/i18n';
import { useState } from 'react';
import { useT } from '../../i18n';
import {
  OLD_BOOTLOADER_BAUD,
  UNO_BAUD,
  UploadError,
  uploadToUno,
  type UploadStage,
} from './stk500';
import { openBootloaderPort, webSerial } from './web-serial';

type Status =
  | { kind: 'idle' }
  | { kind: 'working'; stage: UploadStage; fraction: number }
  | { kind: 'done'; bytes: number }
  | { kind: 'failed'; problem: string; detail?: string };

/**
 * Puts the program the lab built onto a real UNO-compatible board plugged in
 * by USB (D-117). Shown once the program on the lab's board is up to date.
 */
export function RealBoardUpload({ hex }: { hex: string }) {
  const { t, number } = useT();
  const [oldBootloader, setOldBootloader] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const serial = webSerial();
  const working = status.kind === 'working';

  const upload = async () => {
    if (!serial) return;
    let chosen;
    try {
      chosen = await serial.requestPort();
    } catch {
      // The student closed the browser's list without choosing.
      return;
    }
    setStatus({ kind: 'working', stage: 'connecting', fraction: 0 });
    let port;
    try {
      port = await openBootloaderPort(chosen, oldBootloader ? OLD_BOOTLOADER_BAUD : UNO_BAUD);
    } catch {
      setStatus({ kind: 'failed', problem: 'busy' });
      return;
    }
    try {
      const result = await uploadToUno(port, hex, (stage, fraction) =>
        setStatus({ kind: 'working', stage, fraction }),
      );
      setStatus({ kind: 'done', bytes: result.bytes });
    } catch (error) {
      setStatus(
        error instanceof UploadError
          ? { kind: 'failed', problem: error.problem, detail: error.detail }
          : { kind: 'failed', problem: 'lost' },
      );
    } finally {
      await port.close();
    }
  };

  return (
    <section data-testid="real-board" className="rounded-xl border-2 border-line p-3">
      <h2 className="text-base font-semibold">{t('realBoard.title')}</h2>
      {!serial ? (
        <p data-testid="real-board-unsupported" className="mt-1 text-sm text-ink-soft">
          {t('realBoard.unsupported')}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-soft">{t('realBoard.intro')}</p>
          <fieldset className="mt-2" disabled={working}>
            <legend className="mb-1 text-sm text-ink-soft">{t('realBoard.kind')}</legend>
            <div className="flex flex-wrap gap-1.5" data-testid="real-board-kind">
              {[false, true].map((old) => (
                <button
                  key={String(old)}
                  type="button"
                  aria-pressed={oldBootloader === old}
                  onClick={() => setOldBootloader(old)}
                  className="chip min-h-11 px-3 text-sm"
                >
                  {t(old ? 'realBoard.kind.old' : 'realBoard.kind.uno')}
                </button>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            data-testid="real-board-upload"
            disabled={working}
            onClick={() => void upload()}
            className="btn btn-secondary mt-3 min-h-11 w-full"
          >
            {t('realBoard.upload')}
          </button>
          <div
            aria-live="polite"
            className="mt-2 text-sm"
            data-testid="real-board-status"
            data-status={status.kind === 'failed' ? status.problem : status.kind}
          >
            {status.kind === 'working' &&
              (status.stage === 'connecting' ? (
                <p>{t('realBoard.connecting')}</p>
              ) : (
                <div>
                  <p>
                    {t(status.stage === 'checking' ? 'realBoard.checking' : 'realBoard.writing', {
                      percent: number(Math.round(status.fraction * 100)),
                    })}
                  </p>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full bg-amber transition-[width]"
                      style={{ width: `${Math.round(status.fraction * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            {status.kind === 'done' && (
              <p className="rounded-lg border-l-4 border-ok bg-ok-soft px-3 py-2">
                {t('realBoard.done', { bytes: number(status.bytes) })}
              </p>
            )}
            {status.kind === 'failed' && (
              <p className="rounded-lg border-l-4 border-danger bg-danger-soft px-3 py-2">
                {t(`realBoard.${status.problem}` as MessageKey, { detail: status.detail ?? '' })}
              </p>
            )}
          </div>
          <p className="mt-2 text-xs text-ink-faint">{t('realBoard.note')}</p>
        </>
      )}
    </section>
  );
}
