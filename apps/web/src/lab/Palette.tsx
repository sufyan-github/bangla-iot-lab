import type { MessageKey } from '@banglalab/i18n';
import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { useLab, type Tool } from './store';

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
} as const;

const ICONS: Record<Tool | 'battery' | 'uno', ReactNode> = {
  select: <path d="M7 4l11 9-5 .8 3 6-2.4 1.2-3-6L7 18z" fill="currentColor" />,
  wire: (
    <>
      <path d="M5 17C8 6 16 18 19 7" {...stroke} strokeWidth={2.6} />
      <circle cx="5" cy="17" r="2.2" fill="currentColor" />
      <circle cx="19" cy="7" r="2.2" fill="currentColor" />
    </>
  ),
  battery: (
    <>
      <rect x="6" y="6" width="12" height="15" rx="2" {...stroke} />
      <path d="M10 3.5h4M12 10v5M9.5 12.5h5" {...stroke} />
    </>
  ),
  resistor: (
    <>
      <path d="M2 12h4M18 12h4" {...stroke} />
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
  uno: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" {...stroke} />
      <path d="M7 6V3.5M10 6V3.5M13 6V3.5M16 6V3.5M9 19v2.5M12 19v2.5M15 19v2.5" {...stroke} />
      <rect x="10" y="10.5" width="7" height="4" fill="currentColor" />
    </>
  ),
};

const HINTS: Record<Tool, MessageKey> = {
  select: 'hint.select',
  wire: 'hint.wire.start',
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
  const { setTool, addBattery, addUno } = useLab.getState();
  const { t } = useT();

  const hint = tool === 'wire' && wireStart ? 'hint.wire.end' : HINTS[tool];
  const tools: Tool[] = [
    'select',
    'wire',
    'resistor',
    'led',
    'button',
    'potentiometer',
    'capacitor',
  ];

  return (
    <div className="border-b border-line bg-surface">
      <div
        className="flex items-stretch gap-1.5 overflow-x-auto px-3 py-2"
        role="toolbar"
        aria-label={t('tool.select')}
      >
        {tools.slice(0, 2).map((item) => (
          <ToolButton
            key={item}
            icon={ICONS[item]}
            label={t(`tool.${item}`)}
            active={tool === item}
            onClick={() => setTool(item)}
            testId={`tool-${item}`}
          />
        ))}
        <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
        <ToolButton
          icon={ICONS.battery}
          label={t('tool.battery')}
          active={false}
          onClick={addBattery}
          testId="tool-battery"
        />
        <ToolButton
          icon={ICONS.uno}
          label={t('tool.uno')}
          active={false}
          onClick={addUno}
          testId="tool-uno"
        />
        {tools.slice(2).map((item) => (
          <ToolButton
            key={item}
            icon={ICONS[item]}
            label={t(`tool.${item}`)}
            active={tool === item}
            onClick={() => setTool(item)}
            testId={`tool-${item}`}
          />
        ))}
      </div>
      <p
        className="border-t border-line bg-paper px-4 py-1.5 text-sm text-ink-soft"
        aria-live="polite"
      >
        {t(hint)}
      </p>
    </div>
  );
}

function ToolButton(props: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick(): void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={props.testId}
      aria-pressed={props.active}
      onClick={props.onClick}
      className={`flex min-h-14 min-w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-2 text-sm font-medium transition-colors ${
        props.active
          ? 'border-amber bg-amber-soft text-ink'
          : 'border-transparent text-ink-soft hover:bg-paper hover:text-ink'
      }`}
    >
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
        {props.icon}
      </svg>
      {props.label}
    </button>
  );
}
