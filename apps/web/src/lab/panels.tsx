import type { MessageKey } from '@banglalab/i18n';
import {
  LED_COLORS,
  ACS712_RANGES,
  LOGIC_CHIPS,
  LOGIC_CHIP_GATES,
  type CircuitComponent,
  type LedColor,
} from '@banglalab/shared';
import {
  BATTERY_VOLTAGES,
  CAPACITOR_VALUES,
  POTENTIOMETER_VALUES,
  RESISTOR_VALUES,
  LAB_PHONE_NUMBER,
  type Diagnostic,
  type Reading,
} from '@banglalab/simulation';
import { useState, type ReactNode } from 'react';
import { simulation } from '../sim/client';
import { useT } from '../i18n';
import { oledImage } from './oled-image';
import { parseSettings } from './settings';
import { LED_PAINT } from './parts';
import { useLab } from './store';
import { tableParts, truthTable, type TruthTable } from './truth-table';

function Panel(props: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="border-b border-line px-4 py-4" data-testid={props.testId}>
      <h2 className="mb-2 text-base font-semibold text-ink">{props.title}</h2>
      {props.children}
    </section>
  );
}

function Choice(props: {
  selected: boolean;
  onClick(): void;
  children: ReactNode;
  label?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={props.testId}
      aria-pressed={props.selected}
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className={`min-h-11 min-w-11 rounded-lg border-2 px-3 text-sm font-medium ${
        props.selected
          ? 'border-amber bg-amber-soft'
          : 'border-line bg-surface hover:border-ink-soft'
      }`}
    >
      {props.children}
    </button>
  );
}

/**
 * The phone on the other side of a Bluetooth or GSM module: its conversation
 * with the board, and a box to type into while the circuit runs.
 */
function PhoneChat({ id, sms }: { id: string; sms: boolean }) {
  const phone = useLab((s) => s.result?.readings[id]?.phone);
  const running = useLab((s) => s.running);
  const [draft, setDraft] = useState('');
  const { t } = useT();
  const send = () => {
    const text = draft.trim();
    if (!text || !running) return;
    void simulation().phone(id, text);
    setDraft('');
  };
  const connected = running && phone?.connected;
  return (
    <div className="space-y-2" data-testid="phone">
      <p
        className="text-sm text-ink-soft"
        data-testid="phone-state"
        data-connected={String(!!connected)}
      >
        {!running
          ? t('inspector.phone.stopped')
          : connected
            ? t(sms ? 'inspector.phone.network' : 'inspector.phone.paired', {
                number: LAB_PHONE_NUMBER,
              })
            : t(sms ? 'inspector.phone.noNetwork' : 'inspector.phone.unpaired')}
      </p>
      <ol
        className="max-h-56 space-y-1.5 overflow-auto rounded-xl border border-line bg-paper p-2"
        data-testid="phone-messages"
        aria-live="polite"
      >
        {(phone?.messages ?? []).map((message, i) => (
          <li
            key={i}
            data-from={message.from}
            className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm break-words ${
              message.from === 'phone'
                ? 'ml-auto bg-amber-soft text-ink'
                : 'mr-auto border border-line bg-surface text-ink'
            }`}
          >
            {message.number && message.from === 'module' && (
              <span className="block text-xs text-ink-soft">
                {t('inspector.phone.to', { number: message.number })}
              </span>
            )}
            {message.text}
            {message.undelivered && (
              <span className="block text-xs text-ink-soft">
                {t('inspector.phone.undelivered')}
              </span>
            )}
          </li>
        ))}
      </ol>
      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <input
          type="text"
          data-testid="phone-input"
          value={draft}
          maxLength={160}
          disabled={!running}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={t(sms ? 'inspector.phone.smsLabel' : 'inspector.phone.label')}
          className="min-h-11 min-w-0 flex-1 rounded-lg border-2 border-line bg-surface px-3"
        />
        <button
          type="submit"
          data-testid="phone-send"
          disabled={!running || !draft.trim()}
          className="min-h-11 rounded-lg bg-ink px-4 font-medium text-paper disabled:opacity-40"
        >
          {t('inspector.phone.send')}
        </button>
      </form>
    </div>
  );
}

/** What an MP3 player is doing, while the circuit runs. */
function PlayerState({ id }: { id: string }) {
  const player = useLab((s) => s.result?.readings[id]?.player);
  const { t, number } = useT();
  return (
    <p
      className="text-sm text-ink"
      data-testid="player-state"
      data-track={player?.track ?? 0}
      data-playing={String(!!player?.playing)}
    >
      {!player?.ready
        ? t('inspector.player.off')
        : player.playing
          ? t('inspector.player.playing', {
              track: number(player.track),
              volume: number(player.volume),
            })
          : player.track > 0
            ? t('inspector.player.paused', { track: number(player.track) })
            : t('inspector.player.idle')}
    </p>
  );
}

/** An OLED display's picture at twice its size, where a phone can read it. */
function OledPreview({ id }: { id: string }) {
  const shown = useLab((s) => s.result?.readings[id]?.oled);
  const { t } = useT();
  if (!shown?.pixels) {
    return (
      <p className="text-sm text-ink-soft" data-testid="oled-preview" data-lit="false">
        {t('inspector.oled.dark')}
      </p>
    );
  }
  return (
    <img
      data-testid="oled-preview"
      data-lit="true"
      src={oledImage(shown.pixels, shown.brightness).url}
      alt={t('inspector.oled.picture')}
      width={256}
      height={128}
      className="block max-w-full rounded border-4 border-[#0b0e12]"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

/** What the ESP32's program has saved (Preferences), and a way to erase it. */
function SavedSettings({ boardId }: { boardId: string }) {
  const text = useLab((s) => s.settings[boardId] ?? '');
  const running = useLab((s) => s.running);
  const { t } = useT();
  const settings = parseSettings(text);
  return (
    <section data-testid="saved-settings" data-count={settings.length}>
      <p className="mb-1.5 text-sm font-semibold text-ink-soft">{t('settings.title')}</p>
      {settings.length === 0 ? (
        <p className="text-sm text-ink-soft">{t('settings.none')}</p>
      ) : (
        <ul className="space-y-1 font-mono text-sm">
          {settings.map((setting) => (
            <li key={`${setting.space}/${setting.key}`} data-testid="saved-setting">
              <span className="text-ink-soft">{setting.space} › </span>
              {setting.key} ={' '}
              {setting.bytes !== undefined
                ? t('settings.bytes', { count: String(setting.bytes) })
                : setting.value}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-xs text-ink-soft">{t('settings.about')}</p>
      {settings.length > 0 && (
        <>
          <button
            type="button"
            data-testid="erase-settings"
            disabled={running}
            onClick={() => useLab.getState().eraseSettings(boardId)}
            className="mt-2 min-h-11 rounded-lg border-2 border-danger/40 px-3 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
          >
            {t('settings.erase')}
          </button>
          {running && <p className="mt-1 text-xs text-ink-soft">{t('settings.eraseStopped')}</p>}
        </>
      )}
    </section>
  );
}

const CELL_CAPACITIES = [1500, 2000, 2600, 3000, 3500];

function CellSettings({ part }: { part: Extract<CircuitComponent, { type: 'cell' }> }) {
  const { setProps } = useLab.getState();
  const { t, quantity, number } = useT();
  const amps = useLab((s) => s.result?.readings[part.id]?.current ?? 0);
  const { charge, capacity } = part.props;
  // Hours to fill or empty it at the present current; the lab does not run that long.
  const amphours = capacity / 1000;
  const hours = amps > 0 ? (amphours * (1 - charge)) / amps : (amphours * charge) / -amps;
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1.5 flex justify-between text-sm text-ink-soft">
          {t('inspector.charge')}
          <span className="font-medium text-ink tabular-nums">
            {number(Math.round(charge * 100))}%
          </span>
        </span>
        <input
          type="range"
          data-testid="slider-charge"
          min={0}
          max={1}
          step={0.01}
          value={charge}
          onChange={(event) => setProps(part.id, { charge: Number(event.target.value) })}
          className="h-11 w-full accent-amber"
        />
      </label>
      <fieldset>
        <legend className="mb-1.5 text-sm text-ink-soft">{t('inspector.capacity')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {CELL_CAPACITIES.map((mah) => (
            <Choice
              key={mah}
              selected={capacity === mah}
              onClick={() => setProps(part.id, { capacity: mah })}
            >
              {number(mah)} mAh
            </Choice>
          ))}
        </div>
      </fieldset>
      {Math.abs(amps) > 0.001 && Number.isFinite(hours) && (
        <p data-testid="cell-time" className="text-sm text-ink-soft">
          {t(amps > 0 ? 'cell.charging' : 'cell.giving', {
            current: quantity(Math.abs(amps), 'A'),
            hours: number(Math.round(hours * 10) / 10),
          })}
        </p>
      )}
    </div>
  );
}

function PartSettings({ part }: { part: CircuitComponent }) {
  const { setProps } = useLab.getState();
  const { t, quantity, number } = useT();

  if (part.type === 'battery') {
    return (
      <fieldset>
        <legend className="mb-1.5 text-sm text-ink-soft">{t('inspector.voltage')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {BATTERY_VOLTAGES.map((volts) => (
            <Choice
              key={volts}
              selected={part.props.voltage === volts}
              onClick={() => setProps(part.id, { voltage: volts })}
            >
              {quantity(volts, 'V')}
            </Choice>
          ))}
        </div>
      </fieldset>
    );
  }
  if (part.type === 'resistor') {
    const values = RESISTOR_VALUES.includes(part.props.resistance as never)
      ? RESISTOR_VALUES
      : [...RESISTOR_VALUES, part.props.resistance].sort((a, b) => a - b);
    return (
      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-soft">{t('inspector.resistance')}</span>
        <select
          data-testid="resistance"
          value={part.props.resistance}
          onChange={(event) => setProps(part.id, { resistance: Number(event.target.value) })}
          className="min-h-11 w-full rounded-lg border-2 border-line bg-surface px-3"
        >
          {values.map((ohms) => (
            <option key={ohms} value={ohms}>
              {quantity(ohms, 'Ω')}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (part.type === 'switch' || part.type === 'ir') {
    const key = part.type === 'switch' ? 'closed' : 'detected';
    const value = part.type === 'switch' ? part.props.closed : part.props.detected;
    const labels =
      part.type === 'switch'
        ? (['inspector.off', 'inspector.on'] as const)
        : (['inspector.clear', 'inspector.obstacle'] as const);
    return (
      <div className="flex flex-wrap gap-1.5" data-testid="toggle">
        {[false, true].map((option) => (
          <Choice
            key={String(option)}
            selected={value === option}
            onClick={() => setProps(part.id, { [key]: option })}
          >
            {t(labels[Number(option)]!)}
          </Choice>
        ))}
      </div>
    );
  }
  if (part.type === 'oled') return <OledPreview id={part.id} />;
  if (part.type === 'logic') {
    // The six chips share a shape, so one can be swapped for another where it sits.
    return (
      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-soft">{t('inspector.chip')}</span>
        <select
          data-testid="logic-chip"
          value={part.props.chip}
          onChange={(event) => setProps(part.id, { chip: event.target.value })}
          className="min-h-11 w-full rounded-lg border-2 border-line bg-surface px-3"
        >
          {LOGIC_CHIPS.map((chip) => (
            <option key={chip} value={chip}>
              {chip} · {t(`gate.${LOGIC_CHIP_GATES[chip].kind}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (part.type === 'relaymodule') {
    return (
      <fieldset>
        <legend className="mb-1.5 text-sm text-ink-soft">{t('inspector.trigger')}</legend>
        <div className="flex flex-wrap gap-1.5" data-testid="relay-trigger">
          {(['high', 'low'] as const).map((trigger) => (
            <Choice
              key={trigger}
              selected={part.props.trigger === trigger}
              onClick={() => setProps(part.id, { trigger })}
            >
              {t(trigger === 'high' ? 'inspector.trigger.high' : 'inspector.trigger.low')}
            </Choice>
          ))}
        </div>
      </fieldset>
    );
  }
  if (part.type === 'l298n') {
    // The two small jumpers that keep each motor channel switched on.
    const jumpers = [
      { key: 'enaJumper', label: 'inspector.jumper.ena' },
      { key: 'enbJumper', label: 'inspector.jumper.enb' },
    ] as const;
    return (
      <div className="space-y-2">
        {jumpers.map((jumper) => (
          <fieldset key={jumper.key}>
            <legend className="mb-1.5 text-sm text-ink-soft">{t(jumper.label)}</legend>
            <div className="flex flex-wrap gap-1.5" data-testid={`jumper-${jumper.key}`}>
              {[true, false].map((option) => (
                <Choice
                  key={String(option)}
                  selected={part.props[jumper.key] === option}
                  onClick={() => setProps(part.id, { [jumper.key]: option })}
                >
                  {t(option ? 'inspector.jumper.on' : 'inspector.jumper.off')}
                </Choice>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    );
  }
  if (part.type === 'pir') {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5" data-testid="toggle">
          {[false, true].map((option) => (
            <Choice
              key={String(option)}
              selected={part.props.motion === option}
              onClick={() => setProps(part.id, { motion: option })}
            >
              {t(option ? 'inspector.moving' : 'inspector.still')}
            </Choice>
          ))}
        </div>
        <label className="block">
          <span className="mb-1.5 flex justify-between text-sm text-ink-soft">
            {t('inspector.hold')}
            <span className="font-medium text-ink tabular-nums">
              {t('inspector.seconds', { count: number(part.props.hold) })}
            </span>
          </span>
          <input
            type="range"
            data-testid="slider-hold"
            min={3}
            max={60}
            step={1}
            value={part.props.hold}
            onChange={(event) => setProps(part.id, { hold: Number(event.target.value) })}
            className="h-11 w-full accent-amber"
          />
        </label>
      </div>
    );
  }
  if (part.type === 'bluetooth') {
    return (
      <div className="space-y-3">
        <div className="flex gap-1.5">
          <Choice
            testId="bluetooth-paired"
            selected={part.props.paired}
            onClick={() => setProps(part.id, { paired: !part.props.paired })}
          >
            {t(part.props.paired ? 'inspector.bluetoothPaired' : 'inspector.bluetoothUnpaired')}
          </Choice>
        </div>
        <PhoneChat id={part.id} sms={false} />
      </div>
    );
  }
  if (part.type === 'mp3') {
    return (
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1.5 flex justify-between text-sm text-ink-soft">
            {t('inspector.tracks')}
            <span className="font-medium text-ink tabular-nums">{number(part.props.tracks)}</span>
          </span>
          <input
            type="range"
            data-testid="slider-tracks"
            min={1}
            max={30}
            step={1}
            value={part.props.tracks}
            onChange={(event) => setProps(part.id, { tracks: Number(event.target.value) })}
            className="h-11 w-full accent-amber"
          />
        </label>
        <PlayerState id={part.id} />
      </div>
    );
  }
  if (part.type === 'gsm') {
    return (
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1.5 flex justify-between text-sm text-ink-soft">
            {t('inspector.signal')}
            <span className="font-medium text-ink tabular-nums">{number(part.props.signal)}</span>
          </span>
          <input
            type="range"
            data-testid="slider-signal"
            min={0}
            max={31}
            step={1}
            value={part.props.signal}
            onChange={(event) => setProps(part.id, { signal: Number(event.target.value) })}
            className="h-11 w-full accent-amber"
          />
        </label>
        <PhoneChat id={part.id} sms />
      </div>
    );
  }
  if (part.type === 'gps') {
    // Whether it sees the sky, where it is, and how many satellites it hears.
    const place = (key: 'lat' | 'lng', label: MessageKey, min: number, max: number) => (
      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-soft">{t(label)}</span>
        <input
          type="number"
          data-testid={`gps-${key}`}
          min={min}
          max={max}
          step={0.0001}
          value={part.props[key]}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value) && value >= min && value <= max) {
              setProps(part.id, { [key]: value });
            }
          }}
          className="min-h-11 w-full rounded-lg border-2 border-line bg-surface px-3 tabular-nums"
        />
      </label>
    );
    return (
      <div className="space-y-2">
        <div className="flex gap-1.5">
          <Choice
            testId="gps-fix"
            selected={part.props.fix}
            onClick={() => setProps(part.id, { fix: !part.props.fix })}
          >
            {t(part.props.fix ? 'inspector.gpsFix' : 'inspector.gpsNoFix')}
          </Choice>
        </div>
        {place('lat', 'inspector.latitude', -90, 90)}
        {place('lng', 'inspector.longitude', -180, 180)}
        <label className="block">
          <span className="mb-1.5 flex justify-between text-sm text-ink-soft">
            {t('inspector.satellites')}
            <span className="font-medium text-ink tabular-nums">
              {number(part.props.satellites)}
            </span>
          </span>
          <input
            type="range"
            data-testid="slider-satellites"
            min={0}
            max={12}
            step={1}
            value={part.props.satellites}
            onChange={(event) => setProps(part.id, { satellites: Number(event.target.value) })}
            className="h-11 w-full accent-amber"
          />
        </label>
      </div>
    );
  }
  if (part.type === 'pms5003') {
    return (
      <label className="block">
        <span className="mb-1.5 flex justify-between text-sm text-ink-soft">
          {t('inspector.pm25')}
          <span className="font-medium text-ink tabular-nums">{number(part.props.pm25)} µg/m³</span>
        </span>
        <input
          type="range"
          data-testid="slider-pm25"
          min={0}
          max={500}
          step={1}
          value={part.props.pm25}
          onChange={(event) => setProps(part.id, { pm25: Number(event.target.value) })}
          className="h-11 w-full accent-amber"
        />
      </label>
    );
  }
  if (part.type === 'linesensor') {
    // Which of the five sensors are over the black line.
    return (
      <fieldset>
        <legend className="mb-1.5 text-sm text-ink-soft">{t('inspector.onLine')}</legend>
        <div className="flex gap-1.5">
          {part.props.black.map((black, i) => (
            <Choice
              key={i}
              testId={`line-channel-${i + 1}`}
              selected={black}
              onClick={() =>
                setProps(part.id, { black: part.props.black.map((b, j) => (j === i ? !b : b)) })
              }
            >
              {number(i + 1)}
            </Choice>
          ))}
        </div>
      </fieldset>
    );
  }
  if (part.type === 'bme280') {
    // The weather where it sits, and its address on the bus.
    const sliders = [
      { key: 'celsius', label: 'inspector.temperature', min: -40, max: 85, step: 0.5, unit: '°C' },
      { key: 'humidity', label: 'inspector.humidity', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'hpa', label: 'inspector.pressure', min: 300, max: 1100, step: 1, unit: ' hPa' },
    ] as const;
    return (
      <div className="space-y-2">
        {sliders.map((slider) => (
          <label key={slider.key} className="block">
            <span className="mb-1.5 flex justify-between text-sm text-ink-soft">
              {t(slider.label)}
              <span className="font-medium text-ink tabular-nums">
                {number(part.props[slider.key])}
                {slider.unit}
              </span>
            </span>
            <input
              type="range"
              data-testid={`slider-${slider.key}`}
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={part.props[slider.key]}
              onChange={(event) => setProps(part.id, { [slider.key]: Number(event.target.value) })}
              className="h-11 w-full accent-amber"
            />
          </label>
        ))}
        <fieldset>
          <legend className="mb-1.5 text-sm text-ink-soft">{t('inspector.address')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {[0x76, 0x77].map((address) => (
              <Choice
                key={address}
                selected={part.props.address === address}
                onClick={() => setProps(part.id, { address })}
              >
                0x{address.toString(16)}
              </Choice>
            ))}
          </div>
        </fieldset>
      </div>
    );
  }
  if (part.type === 'cell') {
    // How full it is, how big it is, and how long the present current would take.
    return <CellSettings part={part} />;
  }
  if (part.type === 'lm2596') {
    return (
      <label className="block">
        <span className="mb-1.5 flex justify-between text-sm text-ink-soft">
          {t('inspector.outputVolts')}
          <span className="font-medium text-ink tabular-nums">
            {quantity(part.props.volts, 'V')}
          </span>
        </span>
        <input
          type="range"
          data-testid="slider-volts"
          min={1.25}
          max={35}
          step={0.05}
          value={part.props.volts}
          onChange={(event) => setProps(part.id, { volts: Number(event.target.value) })}
          className="h-11 w-full accent-amber"
        />
      </label>
    );
  }
  if (part.type === 'solar') {
    return (
      <label className="block">
        <span className="mb-1.5 flex justify-between text-sm text-ink-soft">
          {t('inspector.sunlight')}
          <span className="font-medium text-ink tabular-nums">
            {number(Math.round(part.props.light * 100))}%
          </span>
        </span>
        <input
          type="range"
          data-testid="slider-light"
          min={0}
          max={1}
          step={0.01}
          value={part.props.light}
          onChange={(event) => setProps(part.id, { light: Number(event.target.value) })}
          className="h-11 w-full accent-amber"
        />
      </label>
    );
  }
  if (part.type === 'ph') {
    // The water's pH, and the trimmer: the point at which DO switches.
    return (
      <div className="space-y-2">
        <label className="block">
          <span className="mb-1.5 flex justify-between text-sm text-ink-soft">
            {t('inspector.ph')}
            <span className="font-medium text-ink tabular-nums">{number(part.props.ph)}</span>
          </span>
          <input
            type="range"
            data-testid="slider-ph"
            min={0}
            max={14}
            step={0.1}
            value={part.props.ph}
            onChange={(event) => setProps(part.id, { ph: Number(event.target.value) })}
            className="h-11 w-full accent-amber"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 flex justify-between text-sm text-ink-soft">
            {t('inspector.threshold')}
            <span className="font-medium text-ink tabular-nums">
              {number(Math.round(part.props.threshold * 100))}%
            </span>
          </span>
          <input
            type="range"
            data-testid="slider-threshold"
            min={0.05}
            max={0.95}
            step={0.01}
            value={part.props.threshold}
            onChange={(event) => setProps(part.id, { threshold: Number(event.target.value) })}
            className="h-11 w-full accent-amber"
          />
        </label>
      </div>
    );
  }
  if (part.type === 'acs712') {
    // The module is sold with one of three chips, which differ only in range.
    return (
      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-soft">{t('inspector.range')}</span>
        <select
          data-testid="acs712-range"
          value={part.props.range}
          onChange={(event) => setProps(part.id, { range: event.target.value })}
          className="min-h-11 w-full rounded-lg border-2 border-line bg-surface px-3"
        >
          {ACS712_RANGES.map((range) => (
            <option key={range} value={range}>
              ±{range}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (
    part.type === 'ldrmodule' ||
    part.type === 'rain' ||
    part.type === 'mq135' ||
    part.type === 'mq7'
  ) {
    // What the module is sensing, and its trimmer: the point at which DO switches.
    const sensed = {
      ldrmodule: { key: 'light', label: 'inspector.light' },
      rain: { key: 'wetness', label: 'inspector.wetness' },
      mq135: { key: 'gas', label: 'inspector.gas' },
      mq7: { key: 'co', label: 'inspector.co' },
    }[part.type];
    const sliders = [
      { ...sensed, min: 0, max: 1 },
      { key: 'threshold', label: 'inspector.threshold', min: 0.05, max: 0.95 },
    ] as const;
    const values = part.props as Record<string, number>;
    return (
      <div className="space-y-2">
        {sliders.map((slider) => (
          <label key={slider.key} className="block">
            <span className="mb-1.5 flex justify-between text-sm text-ink-soft">
              {t(slider.label as MessageKey)}
              <span className="font-medium text-ink tabular-nums">
                {number(Math.round(values[slider.key]! * 100))}%
              </span>
            </span>
            <input
              type="range"
              data-testid={`slider-${slider.key}`}
              min={slider.min}
              max={slider.max}
              step={0.01}
              value={values[slider.key]}
              onChange={(event) => setProps(part.id, { [slider.key]: Number(event.target.value) })}
              className="h-11 w-full accent-amber"
            />
          </label>
        ))}
      </div>
    );
  }
  if (part.type === 'dht11') {
    // Two things to set: what the air is like where the sensor sits.
    const sliders = [
      { key: 'celsius', label: 'inspector.temperature', min: 0, max: 50, unit: '°C' },
      { key: 'humidity', label: 'inspector.humidity', min: 20, max: 90, unit: '%' },
    ] as const;
    return (
      <div className="space-y-2">
        {sliders.map((slider) => (
          <label key={slider.key} className="block">
            <span className="mb-1.5 flex justify-between text-sm text-ink-soft">
              {t(slider.label)}
              <span className="font-medium text-ink tabular-nums">
                {number(part.props[slider.key])}
                {slider.unit}
              </span>
            </span>
            <input
              type="range"
              data-testid={`slider-${slider.key}`}
              min={slider.min}
              max={slider.max}
              step={1}
              value={part.props[slider.key]}
              onChange={(event) => setProps(part.id, { [slider.key]: Number(event.target.value) })}
              className="h-11 w-full accent-amber"
            />
          </label>
        ))}
      </div>
    );
  }
  if (
    part.type === 'ldr' ||
    part.type === 'soil' ||
    part.type === 'temperature' ||
    part.type === 'ultrasonic' ||
    part.type === 'jsnsr04t' ||
    part.type === 'ds18b20' ||
    part.type === 'tds' ||
    part.type === 'turbidity'
  ) {
    const slider = {
      tds: { key: 'ppm', label: 'inspector.ppm', min: 0, max: 1000, step: 10 },
      turbidity: { key: 'ntu', label: 'inspector.ntu', min: 0, max: 3000, step: 10 },
      ldr: { key: 'light', label: 'inspector.light', min: 0, max: 1, step: 0.01 },
      soil: { key: 'moisture', label: 'inspector.moisture', min: 0, max: 1, step: 0.01 },
      temperature: { key: 'celsius', label: 'inspector.temperature', min: 0, max: 100, step: 1 },
      ultrasonic: { key: 'distance', label: 'inspector.distance', min: 2, max: 400, step: 1 },
      jsnsr04t: { key: 'distance', label: 'inspector.distance', min: 2, max: 600, step: 1 },
      ds18b20: { key: 'celsius', label: 'inspector.temperature', min: -55, max: 125, step: 0.25 },
    }[part.type];
    const value = (part.props as Record<string, number>)[slider.key]!;
    const shown =
      part.type === 'temperature' || part.type === 'ds18b20'
        ? `${number(value)}°C`
        : part.type === 'ultrasonic' || part.type === 'jsnsr04t'
          ? `${number(value)} cm`
          : part.type === 'tds'
            ? `${number(value)} ppm`
            : part.type === 'turbidity'
              ? `${number(value)} NTU`
              : `${number(Math.round(value * 100))}%`;
    return (
      <label className="block">
        <span className="mb-1.5 flex justify-between text-sm text-ink-soft">
          {t(slider.label as MessageKey)}
          <span className="font-medium text-ink tabular-nums">{shown}</span>
        </span>
        <input
          type="range"
          data-testid="slider"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          value={value}
          onChange={(event) => setProps(part.id, { [slider.key]: Number(event.target.value) })}
          className="h-11 w-full accent-amber"
        />
      </label>
    );
  }
  if (part.type === 'capacitor') {
    return (
      <fieldset>
        <legend className="mb-1.5 text-sm text-ink-soft">{t('inspector.capacitance')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {CAPACITOR_VALUES.map((farads) => (
            <Choice
              key={farads}
              selected={part.props.capacitance === farads}
              onClick={() => setProps(part.id, { capacitance: farads })}
            >
              {quantity(farads, 'F')}
            </Choice>
          ))}
        </div>
      </fieldset>
    );
  }
  if (part.type === 'potentiometer') {
    return (
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink-soft">{t('inspector.position')}</span>
          <input
            type="range"
            data-testid="knob"
            min={0}
            max={1}
            step={0.01}
            value={part.props.position}
            onChange={(event) => setProps(part.id, { position: Number(event.target.value) })}
            className="h-11 w-full accent-amber"
          />
        </label>
        <fieldset>
          <legend className="mb-1.5 text-sm text-ink-soft">{t('inspector.resistance')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {POTENTIOMETER_VALUES.map((ohms) => (
              <Choice
                key={ohms}
                selected={part.props.resistance === ohms}
                onClick={() => setProps(part.id, { resistance: ohms })}
              >
                {quantity(ohms, 'Ω')}
              </Choice>
            ))}
          </div>
        </fieldset>
      </div>
    );
  }
  if (part.type === 'esp32') return <SavedSettings boardId={part.id} />;
  if (part.type !== 'led') return null;
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm text-ink-soft">{t('inspector.color')}</legend>
      <div className="flex flex-wrap gap-1.5">
        {LED_COLORS.map((color: LedColor) => (
          <Choice
            key={color}
            label={t(`color.${color}`)}
            selected={part.props.color === color}
            onClick={() => setProps(part.id, { color })}
          >
            <span
              className="block h-5 w-5 rounded-full border border-black/30"
              style={{ background: LED_PAINT[color].on }}
            />
          </Choice>
        ))}
      </div>
    </fieldset>
  );
}

/** Settings and explanation for whatever the student has selected. */
/**
 * The truth table of the circuit on the board: its switches as inputs and its
 * LEDs as outputs. Made on request, and put away when the circuit changes.
 */
export function TruthTablePanel() {
  const circuit = useLab((s) => s.circuit);
  const { t } = useT();
  const [table, setTable] = useState<{ of: typeof circuit; table: TruthTable } | null>(null);
  if (!tableParts(circuit)) return null;
  const shown = table?.of === circuit ? table.table : null;
  const bit = (on: boolean) => (on ? '1' : '0');
  return (
    <Panel title={t('table.title')} testId="truth-table">
      <p className="mb-2 text-sm text-ink-soft">{t('table.about')}</p>
      <button
        type="button"
        data-testid="make-table"
        onClick={() => {
          const made = truthTable(circuit);
          if (made) setTable({ of: circuit, table: made });
        }}
        className="min-h-11 rounded-lg border-2 border-line px-3 text-sm font-medium hover:border-ink-soft"
      >
        {t('table.make')}
      </button>
      {shown && (
        <>
          <table
            className="mt-3 w-full border-collapse text-center font-mono text-sm"
            data-testid="table-rows"
          >
            <thead>
              <tr>
                {shown.inputs.map((id) => (
                  <th key={id} className="border-b-2 border-line px-1 py-1">
                    {id}
                  </th>
                ))}
                {shown.outputs.map((id) => (
                  <th key={id} className="border-b-2 border-l-2 border-line px-1 py-1">
                    {id}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.rows.map((row, i) => (
                <tr
                  key={i}
                  data-testid="table-row"
                  data-row={[...row.inputs, ...row.outputs].map(bit).join('')}
                >
                  {row.inputs.map((on, j) => (
                    <td key={j} className="px-1 py-0.5">
                      {bit(on)}
                    </td>
                  ))}
                  {row.outputs.map((on, j) => (
                    <td
                      key={j}
                      className={`border-l-2 border-line px-1 py-0.5 font-bold ${on ? 'text-mat' : ''}`}
                    >
                      {bit(on)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-soft">{t('table.key')}</p>
          {shown.remembers && (
            <p
              role="status"
              className="mt-2 rounded-lg border-l-4 border-amber bg-amber-soft px-3 py-2 text-sm"
            >
              {t('table.remembers')}
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

export function Inspector() {
  const circuit = useLab((s) => s.circuit);
  const selectedId = useLab((s) => s.selectedId);
  const { flipSelected, removeSelected } = useLab.getState();
  const { t } = useT();

  const part = circuit.components.find((c) => c.id === selectedId);
  const isWire = circuit.wires.some((w) => w.id === selectedId);
  if (!part && !isWire) {
    return (
      <Panel title={t('inspector.title')}>
        <p className="text-sm text-ink-soft">{t('inspector.none')}</p>
      </Panel>
    );
  }
  const type = part?.type ?? 'wire';

  return (
    <Panel title={t('inspector.title')} testId="inspector">
      <p className="mb-3 flex items-baseline gap-2">
        <span className="text-lg font-semibold">{t(`part.${type}`)}</span>
        <span className="rounded bg-paper px-1.5 text-sm text-ink-soft">{selectedId}</span>
      </p>
      {part && <PartSettings part={part} />}
      <p className="mt-3 text-sm text-ink-soft">{t(`part.${type}.about`)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {part && 'pins' in part && part.type !== 'logic' && (
          <button
            type="button"
            data-testid="flip"
            onClick={flipSelected}
            className="min-h-11 rounded-lg border-2 border-line px-3 text-sm font-medium hover:border-ink-soft"
          >
            {t('inspector.flip')}
          </button>
        )}
        <button
          type="button"
          data-testid="remove"
          onClick={removeSelected}
          className="min-h-11 rounded-lg border-2 border-danger/40 px-3 text-sm font-medium text-danger hover:bg-danger-soft"
        >
          {t('inspector.remove')}
        </button>
      </div>
    </Panel>
  );
}

/** Voltage and current readouts, styled after a hand-held meter's display. */
export function Meter() {
  const circuit = useLab((s) => s.circuit);
  const result = useLab((s) => s.result);
  const selectedId = useLab((s) => s.selectedId);
  const { select } = useLab.getState();
  const { t, quantity } = useT();

  const parts = circuit.components;
  const shown =
    parts.find((c) => c.id === selectedId) ?? parts.find((c) => c.type === 'led') ?? parts[0];
  const reading: Reading | undefined = shown && result?.readings[shown.id];

  return (
    <Panel title={t('meter.title')} testId="meter">
      <div className="rounded-xl bg-lcd px-4 py-3 text-lcd-ink shadow-[inset_0_2px_6px_rgba(0,0,0,.25)]">
        {reading && shown ? (
          <>
            <p className="text-sm font-medium opacity-75">
              {t(`part.${shown.type}`)} {shown.id}
            </p>
            <p
              className="text-4xl leading-tight font-semibold tabular-nums"
              data-testid="meter-current"
            >
              {quantity(reading.current, 'A')}
            </p>
            <p className="text-xl font-medium tabular-nums" data-testid="meter-voltage">
              {quantity(reading.voltage, 'V')}
              <span className="ml-4 opacity-75">{quantity(Math.abs(reading.power), 'W')}</span>
            </p>
          </>
        ) : (
          <p className="py-3 text-sm">{t('meter.idle')}</p>
        )}
      </div>

      {result && parts.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-ink-soft">
            <tr>
              <th className="py-1 font-medium">{t('meter.part')}</th>
              <th className="py-1 text-right font-medium">{t('meter.voltage')}</th>
              <th className="py-1 text-right font-medium">{t('meter.current')}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {parts.map((part) => {
              const row = result.readings[part.id];
              if (!row) return null;
              return (
                <tr
                  key={part.id}
                  onClick={() => select(part.id)}
                  className={`cursor-pointer border-t border-line ${part.id === shown?.id ? 'bg-amber-soft' : 'hover:bg-paper'}`}
                >
                  <td className="py-1.5 pl-1">{part.id}</td>
                  <td className="py-1.5 text-right">{quantity(row.voltage, 'V')}</td>
                  <td className="py-1.5 pr-1 text-right">{quantity(row.current, 'A')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

const TONE = {
  ok: 'border-ok bg-ok-soft',
  info: 'border-ink-soft bg-paper',
  warning: 'border-amber bg-amber-soft',
  error: 'border-danger bg-danger-soft',
} as const;

/** Plain-language account of what the running circuit is doing and what to fix. */
export function Messages() {
  const result = useLab((s) => s.result);
  const running = useLab((s) => s.running);
  const programRunning = useLab((s) => Object.keys(s.boards).length > 0);
  // In steps of a tenth, so the message does not flicker with every frame.
  const speedTenths = useLab((s) => Math.round(s.speed * 10));
  const { select } = useLab.getState();
  const { t, quantity, number } = useT();

  let items: { key: string; tone: keyof typeof TONE; text: string; partId?: string }[] = [];
  if (result) {
    items = result.diagnostics.map((diagnostic: Diagnostic, index) => ({
      key: `${diagnostic.code}-${diagnostic.socket ?? diagnostic.componentId ?? index}`,
      tone: diagnostic.severity,
      partId: diagnostic.componentId,
      text: t(`diag.${diagnostic.code}` as MessageKey, {
        id: diagnostic.componentId ?? '',
        socket: diagnostic.socket?.toUpperCase() ?? '',
        volts: quantity(diagnostic.volts ?? 0, 'V'),
        limit: quantity(diagnostic.limit ?? 0, 'V'),
        current: quantity(
          diagnostic.socket
            ? (result.sockets[`${diagnostic.componentId}.${diagnostic.socket}`]?.current ?? 0)
            : (result.readings[diagnostic.componentId ?? '']?.current ?? 0),
          'A',
        ),
      }),
    }));
    const readings = Object.values(result.readings);
    const problem = result.diagnostics.some((d) => d.severity !== 'info');
    if (programRunning) {
      // A blinking LED would make "the LED is lit" flash on and off; say the steady fact instead.
      if (!problem)
        items.unshift({ key: 'program-running', tone: 'ok', text: t('diag.program-running') });
      // A board that cannot keep up with real time runs in slow motion, and says so.
      if (speedTenths < 9) {
        items.push({
          key: 'running-slow',
          tone: 'warning',
          text: t('diag.running-slow', { percent: number(Math.max(1, speedTenths) * 10) }),
        });
      }
    } else if (readings.some((r) => r.led?.state === 'on')) {
      items.unshift({ key: 'led-on', tone: 'ok', text: t('diag.led-on') });
    } else if (items.length === 0 && !problem && readings.length > 0) {
      items.push({ key: 'all-good', tone: 'ok', text: t('diag.all-good') });
    }
  }

  return (
    <Panel title={t('messages.title')} testId="messages">
      {!running && <p className="text-sm text-ink-soft">{t('messages.idle')}</p>}
      <ul className="space-y-2" aria-live="polite">
        {items.map((item) => (
          <li
            key={item.key}
            data-diag={item.key}
            onClick={() => item.partId && select(item.partId)}
            className={`rounded-lg border-l-4 px-3 py-2 text-sm ${TONE[item.tone]} ${item.partId ? 'cursor-pointer' : ''}`}
          >
            {item.text}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
