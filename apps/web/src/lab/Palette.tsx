import type { MessageKey } from '@banglalab/i18n';
import { Fragment, type ReactNode } from 'react';
import { useT } from '../i18n';
import { useLab, type Tool } from './store';

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
} as const;
const lead = <path d="M2 12h4M18 12h4" {...stroke} />;

type PaletteItem = Tool | 'battery' | 'uno' | 'esp32' | 'l298n';

const ICONS: Record<PaletteItem, ReactNode> = {
  select: <path d="M7 4l11 9-5 .8 3 6-2.4 1.2-3-6L7 18z" fill="currentColor" />,
  wire: (
    <>
      <path d="M5 17C8 6 16 18 19 7" {...stroke} strokeWidth={2.6} />
      <circle cx="5" cy="17" r="2.2" fill="currentColor" />
      <circle cx="19" cy="7" r="2.2" fill="currentColor" />
    </>
  ),
  probe: (
    <>
      <path d="M4 20l7-9" {...stroke} strokeWidth={1.6} />
      <path d="M11 11l6-8" {...stroke} strokeWidth={4.4} />
      <circle cx="4" cy="20" r="1.6" fill="currentColor" />
    </>
  ),
  battery: (
    <>
      <rect x="6" y="6" width="12" height="15" rx="2" {...stroke} />
      <path d="M10 3.5h4M12 10v5M9.5 12.5h5" {...stroke} />
    </>
  ),
  uno: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" {...stroke} />
      <path d="M7 6V3.5M10 6V3.5M13 6V3.5M16 6V3.5M9 19v2.5M12 19v2.5M15 19v2.5" {...stroke} />
      <rect x="10" y="10.5" width="7" height="4" fill="currentColor" />
    </>
  ),
  esp32: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="1.5" {...stroke} />
      <path
        d="M6 6V3.5M9 6V3.5M12 6V3.5M15 6V3.5M18 6V3.5M6 18v2.5M9 18v2.5M12 18v2.5M15 18v2.5M18 18v2.5"
        {...stroke}
      />
      <rect x="11" y="8.5" width="8" height="7" fill="currentColor" />
    </>
  ),
  l298n: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" {...stroke} />
      <rect x="8" y="7" width="8" height="5" fill="currentColor" />
      <path
        d="M3 9H1M3 14H1M21 9h2M21 14h2M7 20v2M10.5 20v2M14 20v2M17.5 20v2"
        {...stroke}
        strokeWidth={1.6}
      />
    </>
  ),
  resistor: (
    <>
      {lead}
      <rect x="6" y="8.5" width="12" height="7" rx="3" {...stroke} />
      <path d="M10 8.5v7M14 8.5v7" {...stroke} strokeWidth={1.6} />
    </>
  ),
  led: <path d="M8 14V9a4 4 0 0 1 8 0v5zM6.5 14h11M10 14v7M14 14v5" {...stroke} />,
  button: (
    <>
      <rect x="5" y="7" width="14" height="12" rx="2" {...stroke} />
      <circle cx="12" cy="13" r="3" fill="currentColor" />
      <path d="M12 3v4" {...stroke} />
    </>
  ),
  switch: (
    <>
      <path d="M2 14h5M17 14h5M7 14l9-6" {...stroke} />
      <circle cx="7" cy="14" r="1.8" fill="currentColor" />
      <circle cx="17" cy="14" r="1.8" fill="currentColor" />
    </>
  ),
  potentiometer: (
    <>
      <circle cx="12" cy="11" r="7" {...stroke} />
      <path d="M12 11l4-4M7 18v3M12 18v3M17 18v3" {...stroke} />
    </>
  ),
  capacitor: (
    <>
      <path d="M2 12h7M15 12h7" {...stroke} />
      <path d="M9 5.5v13M15 5.5v13" {...stroke} strokeWidth={2.6} />
    </>
  ),
  diode: (
    <>
      <path d="M2 12h6M16 12h6M16 6v12" {...stroke} />
      <path d="M8 6v12l8-6z" fill="currentColor" />
    </>
  ),
  transistor: (
    <>
      <circle cx="13" cy="12" r="8" {...stroke} />
      <path d="M3 12h7M10 7v10M10 10l6-4M10 14l6 4" {...stroke} />
    </>
  ),
  buzzer: (
    <>
      <circle cx="9" cy="13" r="6" {...stroke} />
      <circle cx="9" cy="13" r="1.6" fill="currentColor" />
      <path d="M17 8a7 7 0 0 1 0 10M20 5.5a11 11 0 0 1 0 15" {...stroke} />
    </>
  ),
  motor: (
    <>
      <circle cx="12" cy="12" r="8" {...stroke} />
      <path d="M8.5 15.5v-7l3.5 4 3.5-4v7" {...stroke} />
    </>
  ),
  ldr: (
    <>
      {lead}
      <rect x="6" y="9" width="12" height="6" rx="1" {...stroke} />
      <path d="M8 2l3 4M9 6l2 0 0-2M14 2l3 4M15 6l2 0 0-2" {...stroke} strokeWidth={1.6} />
    </>
  ),
  temperature: (
    <>
      <path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" {...stroke} />
      <circle cx="12" cy="18" r="1.8" fill="currentColor" />
    </>
  ),
  dht11: (
    <>
      <rect x="5" y="3" width="14" height="13" rx="2" {...stroke} />
      <path d="M9 6.5v6M12 6.5v6M15 6.5v6M8 16v5M12 16v5M16 16v5" {...stroke} />
    </>
  ),
  soil: (
    <>
      <path d="M12 3c3.5 4.5 5 7 5 9.5a5 5 0 0 1-10 0C7 10 8.5 7.5 12 3z" {...stroke} />
      <path d="M3 21h18" {...stroke} />
    </>
  ),
  servo: (
    <>
      <rect x="4" y="9" width="16" height="11" rx="2" {...stroke} />
      <circle cx="12" cy="9" r="2.2" fill="currentColor" />
      <path d="M12 9l5-6" {...stroke} strokeWidth={2.6} />
    </>
  ),
  ultrasonic: (
    <>
      <rect x="2" y="7" width="20" height="10" rx="2" {...stroke} />
      <circle cx="8" cy="12" r="2.8" {...stroke} />
      <circle cx="16" cy="12" r="2.8" {...stroke} />
    </>
  ),
  lcd: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" {...stroke} />
      <path d="M6 10h9M6 14h6" {...stroke} />
    </>
  ),
  relay: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" {...stroke} />
      <path d="M6 15v-3q1.5-2 3 0v3M14 15h2M18 15v-3l-4-2" {...stroke} strokeWidth={1.6} />
    </>
  ),
  ldrmodule: (
    <>
      <rect x="3" y="9" width="18" height="12" rx="2" {...stroke} />
      <circle cx="12" cy="15" r="3" {...stroke} />
      <path d="M7 2l2 3.5M12 1.5v4M17 2l-2 3.5" {...stroke} strokeWidth={1.6} />
    </>
  ),
  rain: (
    <>
      <path
        d="M6.5 13.5a4.5 4.5 0 0 1 .8-8.9 5.5 5.5 0 0 1 10.4 1.5 3.8 3.8 0 0 1-.7 7.4z"
        {...stroke}
      />
      <path d="M8 17l-1 3M12.5 17l-1 3M17 17l-1 3" {...stroke} />
    </>
  ),
  mq135: (
    <>
      <circle cx="12" cy="12" r="8.5" {...stroke} />
      <path d="M8 9.5h8M7 12.5h10M8.5 15.5h7" {...stroke} strokeWidth={1.6} />
    </>
  ),
  pir: (
    <>
      <path d="M5 16a7 7 0 0 1 14 0z" {...stroke} />
      <path d="M3 20h18M12 9v7M8.5 10.5l1.5 5.5M15.5 10.5L14 16" {...stroke} strokeWidth={1.6} />
      <path d="M4 6.5q-1.5 2 0 4M20 6.5q1.5 2 0 4" {...stroke} strokeWidth={1.6} />
    </>
  ),
  rgbled: (
    <>
      <path d="M7 13V9a5 5 0 0 1 10 0v4z" {...stroke} />
      <path d="M5.5 13h13M8 13v8M10.7 13v6M13.3 13v8M16 13v6" {...stroke} strokeWidth={1.6} />
    </>
  ),
  relaymodule: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" {...stroke} />
      <rect x="10" y="7.5" width="9" height="9" rx="1" fill="currentColor" />
      <path d="M5 9v6M7.5 9v6" {...stroke} strokeWidth={1.6} />
    </>
  ),
  oled: (
    <>
      <rect x="2.5" y="4" width="19" height="16" rx="2" {...stroke} />
      <rect x="5.5" y="7" width="13" height="8" fill="currentColor" />
      <path d="M8 20v2M11 20v2M14 20v2M17 20v2" {...stroke} strokeWidth={1.6} />
    </>
  ),
  ir: (
    <>
      <rect x="3" y="8" width="7" height="8" rx="1.5" {...stroke} />
      <path d="M13 12h3M13 8.5l2.5-1.5M13 15.5l2.5 1.5M20 5v14" {...stroke} />
    </>
  ),
};

/** Tools in the order they are shown; each inner list is one group. */
const GROUPS: PaletteItem[][] = [
  ['select', 'wire', 'probe'],
  ['battery', 'uno', 'esp32'],
  ['resistor', 'led', 'button', 'switch', 'potentiometer', 'capacitor', 'diode', 'transistor'],
  ['buzzer', 'motor', 'l298n', 'relay', 'relaymodule', 'servo', 'rgbled', 'lcd', 'oled'],
  ['ldr', 'ldrmodule', 'temperature', 'dht11', 'soil', 'rain', 'mq135', 'ir', 'pir', 'ultrasonic'],
];

/** Parts with their own placement hint; the rest share a general one. */
const HINTS: Partial<Record<Tool, MessageKey>> = {
  select: 'hint.select',
  wire: 'hint.wire.start',
  probe: 'hint.probe',
  resistor: 'hint.resistor',
  led: 'hint.led',
  button: 'hint.button',
  potentiometer: 'hint.potentiometer',
  capacitor: 'hint.capacitor',
};

/** Tool and part picker. One tap picks a tool; the hint says what to do next. */
export function Palette() {
  const tool = useLab((s) => s.tool);
  const wireStart = useLab((s) => s.wireStart);
  const running = useLab((s) => s.running);
  const wireSelected = useLab((s) => s.circuit.wires.some((wire) => wire.id === s.selectedId));
  const { setTool, addBattery, addUno, addEsp32, addMotorDriver } = useLab.getState();
  const { t } = useT();

  const hint: MessageKey =
    tool === 'wire' && wireStart
      ? 'hint.wire.end'
      : tool === 'select' && wireSelected
        ? 'hint.wireSelected'
        : tool === 'select' && running
          ? 'hint.running'
          : (HINTS[tool] ?? 'hint.place');
  const choose = (item: PaletteItem) =>
    item === 'battery'
      ? addBattery()
      : item === 'uno'
        ? addUno()
        : item === 'esp32'
          ? addEsp32()
          : item === 'l298n'
            ? addMotorDriver()
            : setTool(item);

  return (
    <div className="border-b border-line bg-surface">
      <div
        className="flex items-stretch gap-1 overflow-x-auto px-3 py-2"
        role="toolbar"
        aria-label={t('tool.select')}
      >
        {GROUPS.map((group, index) => (
          <Fragment key={group[0]}>
            {index > 0 && <span className="mx-1 w-px shrink-0 self-stretch bg-line" aria-hidden />}
            {group.map((item) => (
              <button
                key={item}
                type="button"
                data-testid={`tool-${item}`}
                aria-pressed={tool === item}
                onClick={() => choose(item)}
                className={`flex min-h-14 min-w-[4.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-1.5 text-sm font-medium whitespace-nowrap transition active:scale-95 ${
                  tool === item
                    ? 'border-amber bg-amber-soft text-ink'
                    : 'border-transparent text-ink-soft hover:bg-paper hover:text-ink'
                }`}
              >
                <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
                  {ICONS[item]}
                </svg>
                {t(`tool.${item}`)}
              </button>
            ))}
          </Fragment>
        ))}
      </div>
      {/* Two lines of room on narrow screens, so the board does not jump when the hint changes. */}
      <p
        className="min-h-[3.55rem] border-t border-line bg-paper px-4 py-1.5 text-sm text-ink-soft sm:min-h-0"
        aria-live="polite"
      >
        {t(hint)}
      </p>
    </div>
  );
}
