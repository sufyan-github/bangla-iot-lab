/**
 * Progress drawn as a row of LEDs (D-103): lit for what is done, a ring for
 * the one in hand, dark for what is still to come. The row is one picture to a
 * screen reader, with `label` saying the same thing in words.
 */
export type Led = 'on' | 'now' | 'off';

/** The LEDs for `done` of `total` in order: the next one is in hand until all are done. */
export function ledsFor(done: number, total: number): Led[] {
  return Array.from({ length: total }, (_, i) => (i < done ? 'on' : i === done ? 'now' : 'off'));
}

export function LedRow({
  leds,
  label,
  className = '',
}: {
  leds: Led[];
  label: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      data-testid="led-row"
      className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}
    >
      {leds.map((led, i) => (
        <span key={i} className="led" data-led={led} />
      ))}
    </span>
  );
}
