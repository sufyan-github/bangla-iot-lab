import type { MessageKey } from '@banglalab/i18n';
import { BREADBOARD_SPECS, type WireStyle } from '@banglalab/shared';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { useLab, type Tool } from './store';

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
} as const;
const lead = <path d="M2 12h4M18 12h4" {...stroke} />;

type PaletteItem =
  Tool | 'breadboard' | 'battery' | 'supply' | 'generator' | 'uno' | 'esp32' | 'l298n';

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
  breadboard: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" {...stroke} />
      <path d="M2.5 12h19" {...stroke} strokeWidth={1.4} />
      {[6, 9.5, 13, 16.5].flatMap((x) => [
        <circle key={`${x}a`} cx={x} cy="8.6" r="1" fill="currentColor" />,
        <circle key={`${x}b`} cx={x} cy="15.4" r="1" fill="currentColor" />,
      ])}
    </>
  ),
  supply: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" {...stroke} />
      <path d="M6 9h7" {...stroke} strokeWidth={1.6} />
      <circle cx="16.5" cy="15" r="1.6" {...stroke} />
      <circle cx="7.5" cy="15" r="1.6" {...stroke} />
    </>
  ),
  generator: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" {...stroke} />
      <path d="M6 12q2-5 4 0t4 0 4 0" {...stroke} strokeWidth={1.6} />
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
  buzzermodule: (
    <>
      <rect x="3" y="4" width="13" height="16" rx="1.5" {...stroke} />
      <circle cx="9.5" cy="10.5" r="3.5" fill="currentColor" />
      <path d="M6 20v2M9.5 20v2M13 20v2M19 8.5a5 5 0 0 1 0 6" {...stroke} strokeWidth={1.6} />
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
  clock: (
    <>
      <path d="M3 16h4V8h5v8h5V8h4" {...stroke} />
      <path d="M3 20h18" {...stroke} strokeWidth={1.6} />
    </>
  ),
  logic16: (
    <>
      <rect x="5" y="4" width="14" height="16" rx="1.5" {...stroke} />
      <path
        d="M2 7h3M2 10h3M2 13h3M2 16h3M19 7h3M19 10h3M19 13h3M19 16h3"
        {...stroke}
        strokeWidth={1.4}
      />
      <path d="M10 9h4v6h-4z" {...stroke} strokeWidth={1.4} />
    </>
  ),
  sevenseg: (
    <>
      <rect x="5" y="2.5" width="14" height="19" rx="1.5" {...stroke} />
      <path
        d="M9.5 6.5h5M15 7.5v3.5M14.5 12h-5M15 13v3.5M14.5 17.5h-5M9 13v3.5M9 7.5v3.5"
        {...stroke}
        strokeWidth={1.6}
      />
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
  logic: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="1.5" {...stroke} />
      <path d="M2 8h3M2 12h3M2 16h3M19 8h3M19 12h3M19 16h3" {...stroke} strokeWidth={1.6} />
      <path d="M12 5a2 2 0 0 0 0 4" {...stroke} strokeWidth={1.6} />
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
  ledring: (
    <>
      <circle cx="12" cy="12" r="7.5" {...stroke} />
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <circle
          key={angle}
          cx={12 + 7.5 * Math.cos((angle * Math.PI) / 180)}
          cy={12 + 7.5 * Math.sin((angle * Math.PI) / 180)}
          r="1.7"
          fill="currentColor"
        />
      ))}
    </>
  ),
  lora: (
    <>
      <rect x="5" y="9" width="11" height="11" rx="1.5" {...stroke} />
      <path
        d="M16 9l2-5M14 6a5 5 0 0 1 7 0M12.5 3.5a8 8 0 0 1 10 0"
        {...stroke}
        strokeWidth={1.4}
      />
    </>
  ),
  tft: (
    <>
      <rect x="3.5" y="2.5" width="17" height="17" rx="2" {...stroke} />
      <rect x="6.5" y="5.5" width="5" height="5" fill="currentColor" />
      <rect x="12.5" y="5.5" width="5" height="5" fill="currentColor" opacity={0.6} />
      <rect x="6.5" y="11.5" width="11" height="5" fill="currentColor" opacity={0.35} />
      <path d="M6 22v-2M10 22v-2M14 22v-2M18 22v-2" {...stroke} strokeWidth={1.4} />
    </>
  ),
  bme280: (
    <>
      <path d="M8 14V5a2 2 0 0 1 4 0v9a3.5 3.5 0 1 1-4 0z" {...stroke} />
      <path d="M15 7h5M15 11h5M15 15h3" {...stroke} strokeWidth={1.6} />
    </>
  ),
  ina219: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" {...stroke} />
      <text x="12" y="14.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor">
        mA
      </text>
    </>
  ),
  bluetooth: <path d="M7 7l10 10-5 4V3l5 4L7 17" {...stroke} />,
  mp3: (
    <>
      <path d="M9 18V6l10-2v12" {...stroke} />
      <circle cx="7" cy="18" r="2.2" {...stroke} />
      <circle cx="17" cy="16" r="2.2" {...stroke} />
    </>
  ),
  gsm: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" {...stroke} />
      <path d="M10 7h4M10 10h4M10 13h2" {...stroke} strokeWidth={1.6} />
    </>
  ),
  gps: (
    <>
      <path d="M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11z" {...stroke} />
      <circle cx="12" cy="10" r="2.2" {...stroke} />
    </>
  ),
  pms5003: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" {...stroke} />
      <circle cx="9" cy="12" r="3.5" {...stroke} />
      <path d="M15 9h3M15 12h3M15 15h3" {...stroke} strokeWidth={1.6} />
    </>
  ),
  ds18b20: (
    <>
      <path d="M10 3h4v10l1.5 2v3a3.5 3.5 0 0 1-7 0v-3L10 13z" {...stroke} />
      <path d="M12 16v2" {...stroke} strokeWidth={2} />
    </>
  ),
  jsnsr04t: (
    <>
      <circle cx="12" cy="12" r="6" {...stroke} />
      <path d="M12 18v4M5 8q-2 4 0 8M19 8q2 4 0 8" {...stroke} strokeWidth={1.6} />
    </>
  ),
  linesensor: (
    <>
      <rect x="2" y="9" width="20" height="6" rx="1.5" {...stroke} />
      <path
        d="M5 12h.01M8.5 12h.01M12 12h.01M15.5 12h.01M19 12h.01"
        {...stroke}
        strokeWidth={2.4}
      />
      <path d="M11 3v4M13 3v4M11 17v4M13 17v4" {...stroke} strokeWidth={1.6} />
    </>
  ),
  siren: (
    <>
      <path d="M5 18L9 7h6l4 11z" {...stroke} />
      <path d="M3 21h18M12 3v2M19 7l1.5-1.5M5 7L3.5 5.5" {...stroke} strokeWidth={1.6} />
    </>
  ),
  cell: (
    <>
      <rect x="3" y="8" width="16" height="8" rx="3" {...stroke} />
      <path d="M19 10.5h2v3h-2M8 12h3M9.5 10.5v3" {...stroke} strokeWidth={1.6} />
    </>
  ),
  tp4056: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" {...stroke} />
      <path d="M13 7.5l-3 4.5h4l-3 4.5" {...stroke} strokeWidth={1.6} />
    </>
  ),
  lm2596: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" {...stroke} />
      <path d="M6 9h4M6 12h6M6 15h8M16 9v6M14 13l2 2 2-2" {...stroke} strokeWidth={1.6} />
    </>
  ),
  solar: (
    <>
      <rect x="4" y="9" width="16" height="11" rx="1" {...stroke} />
      <path
        d="M9.3 9v11M14.7 9v11M4 14.5h16M12 2.5v2.5M7 4l1.2 1.8M17 4l-1.2 1.8"
        {...stroke}
        strokeWidth={1.4}
      />
    </>
  ),
  voltagesensor: (
    <>
      <path d="M12 3v4M12 17v4" {...stroke} />
      <path d="M12 7l3 1-6 2 6 2-6 2 3 1v2" {...stroke} strokeWidth={1.6} />
      <path d="M17 6.5l2.5 5-2.5 5" {...stroke} strokeWidth={1.6} />
    </>
  ),
  acs712: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" {...stroke} />
      <path d="M2 12h4M18 12h4" {...stroke} />
      <path d="M9 12h6M12.5 9.5l2.5 2.5-2.5 2.5" {...stroke} strokeWidth={1.6} />
    </>
  ),
  mq7: (
    <>
      <circle cx="12" cy="12" r="8.5" {...stroke} />
      <text x="12" y="15" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor">
        CO
      </text>
    </>
  ),
  ph: (
    <>
      <path d="M10 2.5h4v13a2 2 0 0 1-4 0z" {...stroke} />
      <path d="M10 10h4" {...stroke} strokeWidth={1.6} />
      <path d="M5 20.5h14" {...stroke} strokeWidth={1.6} />
    </>
  ),
  tds: (
    <>
      <path
        d="M12 3c3.5 4.5 5.5 7.5 5.5 10.5a5.5 5.5 0 0 1-11 0C6.5 10.5 8.5 7.5 12 3z"
        {...stroke}
      />
      <path d="M9.5 15h1M13.5 13h1M11.5 17.5h1" {...stroke} strokeWidth={2} />
    </>
  ),
  turbidity: (
    <>
      <path d="M6 4h12l-1.5 16h-9z" {...stroke} />
      <path d="M7 11h10" {...stroke} strokeWidth={1.6} />
      <path d="M8.5 14.5h1M12 16h1M14.5 13.5h1" {...stroke} strokeWidth={2} />
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
/** The drawing tools, always at hand. */
export const TOOLS = ['select', 'wire', 'probe'] as const;

/**
 * The parts, in compartments as a parts organiser box keeps them. Each part is
 * in one compartment; the order within one is roughly how often it is used.
 */
const BINS: { id: string; items: PaletteItem[] }[] = [
  { id: 'boards', items: ['breadboard', 'esp32', 'uno'] },
  {
    id: 'basic',
    items: [
      'resistor',
      'led',
      'button',
      'switch',
      'potentiometer',
      'capacitor',
      'diode',
      'transistor',
    ],
  },
  {
    id: 'outputs',
    items: [
      'buzzer',
      'buzzermodule',
      'siren',
      'rgbled',
      'motor',
      'servo',
      'l298n',
      'relay',
      'relaymodule',
      'mp3',
    ],
  },
  { id: 'displays', items: ['lcd', 'oled', 'tft', 'ledring', 'sevenseg'] },
  {
    id: 'sensors',
    items: [
      'ldr',
      'ldrmodule',
      'temperature',
      'dht11',
      'ds18b20',
      'bme280',
      'soil',
      'rain',
      'pir',
      'ir',
      'ultrasonic',
      'jsnsr04t',
      'linesensor',
      'mq135',
      'mq7',
      'pms5003',
      'gps',
    ],
  },
  { id: 'measure', items: ['voltagesensor', 'acs712', 'ina219', 'ph', 'tds', 'turbidity'] },
  { id: 'logic', items: ['logic', 'logic16', 'clock'] },
  { id: 'power', items: ['battery', 'supply', 'generator', 'cell', 'tp4056', 'lm2596', 'solar'] },
  { id: 'radio', items: ['bluetooth', 'gsm', 'lora'] },
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

/** The breadboard's sizes, smallest first, as the list offers them. */
const BOARD_SIZES = ['mini', 'half', 'full'] as const;

/** The parts that stand beside the breadboards: picked up from the list, then put down on the mat. */
const BESIDE = ['battery', 'supply', 'generator', 'uno', 'esp32', 'l298n'] as const;
type Beside = (typeof BESIDE)[number];
const standsBeside = (item: PaletteItem): item is Beside =>
  (BESIDE as readonly string[]).includes(item);

/**
 * What a tap on a palette item does: picks a tool, or picks up a part that
 * stands beside the breadboards (D-108). The breadboard is not chosen here: it
 * asks for its size first.
 */
function useChoose() {
  const { setTool, pickUp } = useLab.getState();
  return (item: Exclude<PaletteItem, 'breadboard'>) =>
    standsBeside(item) ? pickUp({ type: item }) : setTool(item);
}

/** The two ways a wire is drawn (D-109): slack like a jumper wire, or square. */
export function WireStyleIcon({ style, size = 20 }: { style: WireStyle; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path
        d={style === 'square' ? 'M5 18H12V6H19' : 'M5 17C8 6 16 18 19 7'}
        {...stroke}
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <circle cx="5" cy={style === 'square' ? 18 : 17} r="2.2" fill="currentColor" />
      <circle cx="19" cy={style === 'square' ? 6 : 7} r="2.2" fill="currentColor" />
    </svg>
  );
}

const Icon = ({ item, size = 24 }: { item: PaletteItem; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
    {ICONS[item]}
  </svg>
);

/**
 * The drawer's small drawing of a part, for use outside the lab: by the type a
 * part definition simulates. Anything without a drawing of its own gets the chip.
 */
export function PartIcon({ type, size = 26 }: { type: string; size?: number }) {
  return <Icon item={(type in ICONS ? type : 'logic') as PaletteItem} size={size} />;
}

/** Select, wire and probe: the three ways of working on the board. */
export function ToolPicker({ compact = false }: { compact?: boolean }) {
  const tool = useLab((s) => s.tool);
  const wireStyle = useLab((s) => s.wireStyle);
  const choose = useChoose();
  const { t } = useT();
  const other = wireStyle === 'square' ? 'jumper' : 'square';
  return (
    <div
      role="toolbar"
      aria-label={t('tool.select')}
      className="flex gap-1 rounded-xl bg-paper p-1"
    >
      {TOOLS.map((item) => (
        <button
          key={item}
          type="button"
          data-testid={`tool-${item}`}
          aria-pressed={tool === item}
          onClick={() => choose(item)}
          className={`flex flex-1 items-center justify-center rounded-lg px-1.5 font-medium ${
            compact ? 'min-h-11 min-w-11' : 'min-h-12 flex-col gap-0.5 text-xs'
          } ${tool === item ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}
        >
          <Icon item={item} size={20} />
          {!compact && t(`tool.${item}`)}
        </button>
      ))}
      {/* With the wire tool in hand: how a new wire is drawn, one press to change it (D-109). */}
      {compact && tool === 'wire' && (
        <button
          type="button"
          data-testid="wire-style-toggle"
          data-style={wireStyle}
          aria-label={t(other === 'square' ? 'tool.wireSquare' : 'tool.wireJumper')}
          title={t(other === 'square' ? 'tool.wireSquare' : 'tool.wireJumper')}
          onClick={() => useLab.getState().setWireStyle(other)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-amber-soft text-ink ring-2 ring-amber"
        >
          <WireStyleIcon style={wireStyle} />
        </button>
      )}
    </div>
  );
}

/**
 * The parts list (D-106): one column, so it can stand as a narrow rail beside
 * the board. Folded, a row is the part's drawing alone; open, its name is
 * beside it, and nothing moves up or down, so a part stays where the pointer
 * found it. A tap picks a part to place (or adds a board or source beside the
 * breadboard). `withTools` puts select, wire and probe at the head of the list.
 */
export function PartsDrawer({
  open = true,
  withTools = false,
  icon = 'w-16',
  header,
  onChosen,
}: {
  open?: boolean;
  withTools?: boolean;
  /** The width of the column of drawings: the rail's own width. */
  icon?: string;
  /** Something for the end of the search row while the list is open. */
  header?: ReactNode;
  onChosen?: () => void;
}) {
  const tool = useLab((s) => s.tool);
  const placing = useLab((s) => s.placing);
  const wireStyle = useLab((s) => s.wireStyle);
  const choose = useChoose();
  const { t, number } = useT();
  const [query, setQuery] = useState('');
  /** The breadboard asks which size before it is picked up. */
  const [sizes, setSizes] = useState(false);
  const chosen = (item: PaletteItem) => (placing ? placing.type === item : tool === item);
  const wanted = query.trim().toLowerCase();
  const matches = (item: PaletteItem) =>
    !wanted || item.includes(wanted) || t(`tool.${item}`).toLowerCase().includes(wanted);
  const bins = BINS.map((bin) => ({ ...bin, items: bin.items.filter(matches) })).filter(
    (bin) => bin.items.length > 0,
  );
  // The list has no scrollbar; a fading edge with an arrow says there is more that way.
  const listRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ up: false, down: false });
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const up = list.scrollTop > 4;
      const down = list.scrollTop + list.clientHeight < list.scrollHeight - 4;
      setMore((was) => (was.up === up && was.down === down ? was : { up, down }));
    };
    measure();
    list.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => {
      list.removeEventListener('scroll', measure);
      observer.disconnect();
    };
    // Measured again when the search or the fold changes what the list holds.
  }, [wanted, open]);
  const page = (direction: 1 | -1) =>
    listRef.current?.scrollBy({ top: direction * listRef.current.clientHeight * 0.7 });
  /** One line of the list: a drawing, and its name beside it while the list is open. */
  const line = (entry: {
    key: string;
    testid: string;
    label: string;
    item: PaletteItem;
    pressed: boolean;
    /** Set for a line that opens more lines under it, in place of being chosen. */
    expanded?: boolean;
    /** A line under another: drawn smaller. */
    under?: boolean;
    onClick(): void;
  }) => (
    <li key={entry.key}>
      <button
        type="button"
        data-testid={entry.testid}
        aria-pressed={entry.expanded === undefined ? entry.pressed : undefined}
        aria-expanded={entry.expanded}
        aria-label={entry.label}
        title={entry.label}
        onClick={entry.onClick}
        className={`flex min-h-11 w-full items-center text-left text-sm font-medium ${
          entry.pressed ? 'text-ink' : 'text-ink-soft hover:bg-paper hover:text-ink'
        }`}
      >
        <span className={`grid shrink-0 place-items-center ${icon}`}>
          <span
            className={`grid place-items-center rounded-[var(--radius-control)] ${
              entry.under ? 'h-8 w-8' : 'h-10 w-10'
            } ${entry.pressed ? 'bg-amber-soft text-ink ring-2 ring-amber' : ''}`}
          >
            <Icon item={entry.item} size={entry.under ? 18 : 24} />
          </span>
        </span>
        <span aria-hidden className={`min-w-0 truncate pr-3 ${open ? '' : 'invisible'}`}>
          {entry.label}
        </span>
      </button>
    </li>
  );
  const row = (item: PaletteItem) => {
    if (item !== 'breadboard') {
      return line({
        key: item,
        testid: `tool-${item}`,
        label: t(`tool.${item}`),
        item,
        pressed: chosen(item),
        onClick: () => {
          choose(item);
          onChosen?.();
        },
      });
    }
    // A breadboard is picked by its size (D-108): the line opens the three sizes under it.
    const inHand = placing?.type === 'breadboard' ? placing.size : null;
    return (
      <Fragment key="breadboard">
        {line({
          key: 'breadboard',
          testid: 'tool-breadboard',
          label: t('tool.breadboard'),
          item,
          pressed: inHand !== null,
          expanded: sizes,
          onClick: () => setSizes(!sizes),
        })}
        {sizes &&
          BOARD_SIZES.map((size) =>
            line({
              key: `breadboard-${size}`,
              testid: `tool-breadboard-${size}`,
              label: t(`inspector.boardSize.${size}`, {
                holes: number(BREADBOARD_SPECS[size].holes),
              }),
              item,
              under: true,
              pressed: inHand === size,
              onClick: () => {
                useLab.getState().pickUp({ type: 'breadboard', size });
                onChosen?.();
              },
            }),
          )}
      </Fragment>
    );
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col whitespace-nowrap"
      data-testid="parts-drawer"
      data-open={open}
    >
      {/* The search row keeps its height folded, so the list below never moves. */}
      <div className="flex h-14 shrink-0 items-center">
        {open ? (
          <>
            <label className="relative ml-2 block min-w-0 flex-1">
              <span className="sr-only">{t('drawer.search')}</span>
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" />
              <input
                type="search"
                data-testid="parts-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('drawer.search')}
                className="field pl-9 text-sm"
              />
            </label>
            <span className="shrink-0 px-1">{header}</span>
          </>
        ) : (
          <span className={`grid shrink-0 place-items-center text-ink-faint ${icon}`}>
            <SearchIcon />
          </span>
        )}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <MoreParts way="up" shown={more.up} label={t('drawer.moreUp')} onClick={() => page(-1)} />
        <MoreParts
          way="down"
          shown={more.down}
          label={t('drawer.moreDown')}
          onClick={() => page(1)}
        />
        <div
          ref={listRef}
          data-testid="parts-list"
          className="no-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-4"
        >
          {withTools && !wanted && (
            <ul role="toolbar" aria-label={t('tool.select')} className="border-b border-line pb-1">
              {TOOLS.map(row)}
              {/* How a new wire is drawn: a choice made here, kept on the device (D-109). */}
              {(['jumper', 'square'] as const).map((style) => (
                <li key={style}>
                  <button
                    type="button"
                    data-testid={`wire-style-${style}`}
                    aria-pressed={wireStyle === style}
                    aria-label={t(style === 'square' ? 'tool.wireSquare' : 'tool.wireJumper')}
                    title={t(style === 'square' ? 'tool.wireSquare' : 'tool.wireJumper')}
                    onClick={() => {
                      useLab.getState().setWireStyle(style);
                      onChosen?.();
                    }}
                    className={`flex min-h-10 w-full items-center text-left text-sm font-medium ${
                      tool === 'wire' && wireStyle === style
                        ? 'text-ink'
                        : 'text-ink-soft hover:bg-paper hover:text-ink'
                    }`}
                  >
                    <span className={`grid shrink-0 place-items-center ${icon}`}>
                      <span
                        className={`grid h-8 w-8 place-items-center rounded-[var(--radius-control)] ${
                          wireStyle === style
                            ? tool === 'wire'
                              ? 'bg-amber-soft text-ink ring-2 ring-amber'
                              : 'ring-2 ring-line-strong'
                            : ''
                        }`}
                      >
                        <WireStyleIcon style={style} size={18} />
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={`min-w-0 truncate pr-3 ${open ? '' : 'invisible'}`}
                    >
                      {t(style === 'square' ? 'tool.wireSquare' : 'tool.wireJumper')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {bins.length === 0 && (
            <p className="px-3 pt-3 text-sm text-ink-soft">{t('drawer.none')}</p>
          )}
          {bins.map((bin) => (
            <section key={bin.id} aria-label={t(`drawer.bin.${bin.id}` as MessageKey)}>
              {/* The compartment's label; folded, a short line marks where one begins. */}
              <h3 className="flex h-8 items-end pb-1 text-xs font-bold text-accent">
                {open ? (
                  <span className="truncate px-3">{t(`drawer.bin.${bin.id}` as MessageKey)}</span>
                ) : (
                  <span aria-hidden className={`grid place-items-center pb-1.5 ${icon}`}>
                    <span className="h-0.5 w-5 rounded-full bg-line-strong" />
                  </span>
                )}
              </h3>
              <ul>{bin.items.map(row)}</ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The fading edge of the parts list: there is more this way, and a press goes there. */
function MoreParts(props: { way: 'up' | 'down'; shown: boolean; label: string; onClick(): void }) {
  if (!props.shown) return null;
  const up = props.way === 'up';
  return (
    <button
      type="button"
      tabIndex={-1}
      data-testid={`parts-more-${props.way}`}
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className={`absolute inset-x-0 z-10 grid h-9 place-items-center text-ink-soft hover:text-ink ${
        up
          ? 'top-0 bg-gradient-to-b from-surface via-surface/85 to-transparent pb-2'
          : 'bottom-0 bg-gradient-to-t from-surface via-surface/85 to-transparent pt-2'
      }`}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" aria-hidden>
        <path
          d={up ? 'M6 14.5l6-6 6 6' : 'M6 9.5l6 6 6-6'}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" strokeLinecap="round" />
    </svg>
  );
}

/** What to do next with the tool in hand: a small note on the board, read out when it changes. */
export function CanvasHint() {
  const tool = useLab((s) => s.tool);
  const wireStart = useLab((s) => s.wireStart);
  const running = useLab((s) => s.running);
  const wireSelected = useLab((s) => s.circuit.wires.some((wire) => wire.id === s.selectedId));
  const { t } = useT();
  const placing = useLab((s) => s.placing !== null);
  const hint: MessageKey = placing
    ? 'hint.placing'
    : tool === 'wire' && wireStart
      ? 'hint.wire.end'
      : tool === 'select' && wireSelected
        ? 'hint.wireSelected'
        : tool === 'select' && running
          ? 'hint.running'
          : (HINTS[tool] ?? 'hint.place');
  return (
    <p
      aria-live="polite"
      data-testid="canvas-hint"
      className="pointer-events-none max-w-md rounded-[var(--radius-control)] bg-surface/95 px-3 py-1.5 text-sm text-ink-soft shadow-[var(--shadow-raised)]"
    >
      {t(hint)}
    </p>
  );
}
