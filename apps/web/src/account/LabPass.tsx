import { useState } from 'react';
import { useT } from '../i18n';

/**
 * A class learner's sign-in key as a card they keep, like a library card: an
 * ivory card with the mat's green band, the nickname, the class and the key in
 * large type. It is a thing on the bench, so it looks the same in light and
 * dark mode. It can be copied, or saved as a picture to the phone.
 */
const CARD = {
  paper: '#fffdf4',
  band: '#1d5a4e',
  ink: '#13231f',
  soft: '#4b5d57',
  chalk: '#f4f7f5',
};

export function LabPass({
  nickname,
  className,
  passKey,
}: {
  nickname: string;
  className?: string;
  passKey: string;
}) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(passKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard here: the key stays on screen to write down.
    }
  };

  /** Draws the card on a canvas and offers it as a PNG file. */
  const save = async () => {
    await document.fonts.ready;
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = 640 * scale;
    canvas.height = 380 * scale;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.scale(scale, scale);
    g.fillStyle = CARD.paper;
    g.beginPath();
    g.roundRect(0, 0, 640, 380, 24);
    g.fill();
    g.fillStyle = CARD.band;
    g.beginPath();
    g.roundRect(0, 0, 640, 64, [24, 24, 0, 0]);
    g.fill();
    const font = '"Anek Bangla Variable", "Noto Sans Bengali", sans-serif';
    g.fillStyle = CARD.chalk;
    g.font = `600 22px ${font}`;
    g.fillText(`${t('app.name')} · ${t('pass.title')}`, 32, 42);
    g.fillStyle = CARD.ink;
    g.font = `700 40px ${font}`;
    g.fillText(nickname, 32, 132);
    if (className) {
      g.fillStyle = CARD.soft;
      g.font = `500 22px ${font}`;
      g.fillText(className, 32, 170);
    }
    g.fillStyle = CARD.ink;
    g.font = '700 52px ui-monospace, "Cascadia Mono", Menlo, monospace';
    g.fillText(passKey, 32, 262);
    g.fillStyle = CARD.soft;
    g.font = `400 18px ${font}`;
    wrap(g, t('pass.note'), 32, 306, 576, 24);
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lab-pass.png';
    link.click();
  };

  return (
    <div className="flex flex-col items-start gap-3">
      <figure
        data-testid="lab-pass"
        aria-label={t('pass.title')}
        className="m-0 w-full max-w-md overflow-hidden rounded-[var(--radius-sheet)] shadow-[var(--shadow-raised)]"
        style={{ background: CARD.paper, color: CARD.ink }}
      >
        <div
          className="px-5 py-3 text-sm font-semibold"
          style={{ background: CARD.band, color: CARD.chalk }}
        >
          {t('app.name')} · {t('pass.title')}
        </div>
        <div className="space-y-1 px-5 pt-4 pb-5">
          <p className="text-2xl font-bold">{nickname}</p>
          {className && (
            <p className="text-sm" style={{ color: CARD.soft }}>
              {className}
            </p>
          )}
          <p
            data-testid="learner-key"
            className="pt-3 font-mono text-2xl font-bold tracking-[0.06em] whitespace-nowrap sm:text-4xl sm:tracking-[0.12em]"
          >
            {passKey}
          </p>
          <p className="pt-2 text-sm leading-relaxed" style={{ color: CARD.soft }}>
            {t('pass.note')}
          </p>
        </div>
      </figure>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
          {copied ? t('pass.copied') : t('pass.copy')}
        </button>
        <button
          type="button"
          data-testid="lab-pass-save"
          className="btn btn-secondary"
          onClick={() => void save()}
        >
          {t('pass.save')}
        </button>
      </div>
    </div>
  );
}

/** Writes text across lines no wider than `width`. */
function wrap(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
) {
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > width && line) {
      g.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) g.fillText(line, x, y);
}
