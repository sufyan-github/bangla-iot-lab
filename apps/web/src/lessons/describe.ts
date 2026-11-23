import type { Check, Place } from '@banglalab/lessons';
import type { MessageKey } from '@banglalab/i18n';
import { PART_DEFINITIONS } from '@banglalab/parts';
import type { Translate } from '../i18n';

/**
 * What a lesson check asks, in the student's language, for the list under
 * each step. A check that carries its own wording uses that.
 */
export interface Describer {
  t: Translate;
  locale: 'bn' | 'en';
  number(value: number): string;
}

/** A pin's name as printed on the board or the part. */
function placeName(place: Place, { t }: Describer): string {
  if ('board' in place) {
    const pin = place.board === 'gnd' ? 'GND' : place.board.toUpperCase();
    // In a lesson with two boards, the second board's pins are named after it.
    return place.unit === 2 ? `ESP2 ${pin}` : pin;
  }
  if ('battery' in place) return `${t('part.battery')} (${place.battery === 'pos' ? '+' : '−'})`;
  const name = t(`part.${place.part}` as MessageKey);
  if (place.pin === '*') return name;
  const definition = PART_DEFINITIONS.find((d) => d.simulates === place.part);
  const label =
    definition?.pins.find((pin) => pin.id === place.pin)?.label ?? place.pin.toUpperCase();
  return `${name} (${label})`;
}

const PROP_LABELS: Record<string, MessageKey> = {
  resistance: 'inspector.resistance',
  celsius: 'inspector.temperature',
  humidity: 'inspector.humidity',
  light: 'inspector.light',
  wetness: 'inspector.wetness',
  moisture: 'inspector.moisture',
  gas: 'inspector.gas',
  distance: 'inspector.distance',
  enaJumper: 'inspector.jumper.ena',
  enbJumper: 'inspector.jumper.enb',
  hold: 'inspector.hold',
};

/** A setting's value as the inspector shows it. */
function propValue(prop: string, value: string | number | boolean, describer: Describer): string {
  const { t, number } = describer;
  if (typeof value === 'boolean') return t(value ? 'inspector.jumper.on' : 'inspector.jumper.off');
  if (typeof value === 'string') return value;
  if (prop === 'resistance')
    return value >= 1000 ? `${number(value / 1000)} kΩ` : `${number(value)} Ω`;
  if (prop === 'celsius') return `${number(value)} °C`;
  if (prop === 'distance') return `${number(value)} cm`;
  if (prop === 'humidity') return `${number(value)}%`;
  if (prop === 'hold') return t('inspector.seconds', { count: number(value) });
  // The sliders that run from 0 to 1 are shown as percentages.
  return `${number(Math.round(value * 100))}%`;
}

function comparison(
  check: { equals?: string | number | boolean; above?: number; below?: number },
  show: (value: string | number | boolean) => string,
  { t }: Describer,
): string {
  const parts: string[] = [];
  if (check.equals !== undefined) parts.push(t('lesson.check.is', { value: show(check.equals) }));
  if (check.above !== undefined) parts.push(t('lesson.check.above', { value: show(check.above) }));
  if (check.below !== undefined) parts.push(t('lesson.check.below', { value: show(check.below) }));
  return parts.join(', ');
}

export function describeCheck(check: Check, describer: Describer): string {
  const { t, locale, number } = describer;
  if (check.label) return check.label[locale];
  const part = (type: string) => t(`part.${type}` as MessageKey);
  switch (check.kind) {
    case 'part':
      return t('lesson.check.part', { part: part(check.type) });
    case 'connected': {
      const params = { a: placeName(check.from, describer), b: placeName(check.to, describer) };
      if (check.through !== 'resistor') return t('lesson.check.connected', params);
      return t('lesson.check.through', params);
    }
    case 'prop': {
      const label = PROP_LABELS[check.prop];
      return t('lesson.check.prop', {
        part: part(check.part),
        prop: label ? t(label) : check.prop,
        value: comparison(check, (value) => propValue(check.prop, value, describer), describer),
      });
    }
    case 'program':
      return t('lesson.check.program');
    case 'running':
      return t('lesson.check.running');
    case 'no-errors':
      return t('lesson.check.safe');
    case 'serial':
      return t('lesson.check.serial', { text: check.matches });
    case 'diagnostic':
      return t('lesson.check.diagnostic');
    case 'reading': {
      const name = part(check.part);
      if (check.path === 'led.state') {
        return t(check.equals === 'on' ? 'lesson.check.lit' : 'lesson.check.dark', { part: name });
      }
      if (check.path === 'oled.lit') return t('lesson.check.screen', { part: name });
      if (check.path.startsWith('rgb.')) {
        const colour = { r: 'color.red', g: 'color.green', b: 'color.blue' }[check.path.slice(4)];
        return t('lesson.check.colour', { colour: colour ? t(colour as MessageKey) : check.path });
      }
      if (check.path === 'angle') {
        return t('lesson.check.angle', {
          part: name,
          value: comparison(check, (value) => `${number(Number(value))}°`, describer),
        });
      }
      if (check.path === 'current') {
        const milliamps = (value: string | number | boolean) =>
          `${number(Number(value) * 1000)} mA`;
        return t('lesson.check.current', {
          part: name,
          value: comparison(check, milliamps, describer),
        });
      }
      if (check.path === 'activity') {
        if (check.above !== undefined && check.above > 0)
          return t('lesson.check.forward', { part: name });
        if (check.below !== undefined && check.below < 0)
          return t('lesson.check.backward', { part: name });
        if (check.equals === 1) return t('lesson.check.active', { part: name });
        if (check.equals === 0) return t('lesson.check.idle', { part: name });
      }
      return `${name}: ${check.path}`;
    }
  }
}
