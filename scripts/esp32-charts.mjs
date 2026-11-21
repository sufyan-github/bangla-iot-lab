// Draws the three charts of docs/engineering/esp32-pin-model.md from the pin
// model itself, so a chart cannot disagree with the code.
//
//   pnpm esp32:charts
//
// Plain Node, no dependencies. Node loads the TypeScript module directly.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ESP32_ADC_EFFECTIVE_RANGE_MV,
  ESP32_ANALOG_WRITE_BITS,
  ESP32_ANALOG_WRITE_FREQUENCY,
  ESP32_IOL_TEST_VOLTAGE,
  ESP32_VDD,
  ESP32_VOH_MIN_FRACTION,
  ESP32_VOL_MAX_FRACTION,
  esp32AdcCount,
  esp32AdcDeadZoneVoltage,
  esp32AdcIdealCount,
  esp32AdcSaturationVoltage,
  esp32LedcMaxFrequency,
  esp32LedcMinFrequency,
  esp32OutputVoltage,
} from '../packages/simulation/src/esp32-pins.ts';

const OUT = new URL('../docs/engineering/', import.meta.url);

// Colours: the first categorical slots of a palette checked for colour-blind
// separation on this surface. The files are shown on white and on dark pages,
// so each carries its own light background.
const SURFACE = '#fcfcfb';
const INK = '#0b0b0b';
const MUTED = '#52514e';
const GRID = '#e3e2dd';
const AXIS = '#9b9a94';
const BLUE = '#2a78d6';
const ORANGE = '#eb6834';
const REFERENCE = '#7a7974';
const BAND = '#2a78d6';

const WIDTH = 760;
const HEIGHT = 440;
const PLOT = { left: 72, right: 28, top: 64, bottom: 58 };

const round = (value) => Math.round(value * 100) / 100;
const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** A chart frame: scales, grid, axes, title. `body` draws the data with the two scale functions. */
function chart({ title, subtitle, description, x, y, body }) {
  const plotWidth = WIDTH - PLOT.left - PLOT.right;
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
  const position = (axis, value, length) => {
    const t = axis.log
      ? (Math.log10(value) - Math.log10(axis.min)) / (Math.log10(axis.max) - Math.log10(axis.min))
      : (value - axis.min) / (axis.max - axis.min);
    return t * length;
  };
  const sx = (value) => round(PLOT.left + position(x, value, plotWidth));
  const sy = (value) => round(PLOT.top + plotHeight - position(y, value, plotHeight));
  const bottom = PLOT.top + plotHeight;
  const parts = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">`,
    `<title>${escape(title)}</title>`,
    `<desc>${escape(description)}</desc>`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${SURFACE}"/>`,
    `<text x="${PLOT.left}" y="26" font-size="16" font-weight="600" fill="${INK}">${escape(title)}</text>`,
    `<text x="${PLOT.left}" y="46" font-size="12" fill="${MUTED}">${escape(subtitle)}</text>`,
  );
  for (const tick of y.ticks) {
    parts.push(
      `<line x1="${PLOT.left}" x2="${PLOT.left + plotWidth}" y1="${sy(tick)}" y2="${sy(tick)}" stroke="${GRID}"/>`,
      `<text x="${PLOT.left - 8}" y="${sy(tick) + 4}" font-size="11" text-anchor="end" fill="${MUTED}">${escape(y.format(tick))}</text>`,
    );
  }
  for (const tick of x.ticks) {
    parts.push(
      `<line x1="${sx(tick)}" x2="${sx(tick)}" y1="${bottom}" y2="${bottom + 5}" stroke="${AXIS}"/>`,
      `<text x="${sx(tick)}" y="${bottom + 19}" font-size="11" text-anchor="middle" fill="${MUTED}">${escape(x.format(tick))}</text>`,
    );
  }
  parts.push(
    `<line x1="${PLOT.left}" x2="${PLOT.left + plotWidth}" y1="${bottom}" y2="${bottom}" stroke="${AXIS}"/>`,
    `<text x="${PLOT.left + plotWidth / 2}" y="${HEIGHT - 14}" font-size="12" text-anchor="middle" fill="${MUTED}">${escape(x.label)}</text>`,
    `<text transform="translate(18 ${PLOT.top + plotHeight / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="${MUTED}">${escape(y.label)}</text>`,
  );
  parts.push(...body({ sx, sy, bottom, right: PLOT.left + plotWidth }));
  parts.push('</svg>');
  return parts.join('\n') + '\n';
}

const line = (points, colour, extra = '') =>
  `<polyline points="${points.map(([px, py]) => `${px},${py}`).join(' ')}" fill="none" stroke="${colour}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
const dot = (px, py, colour) =>
  `<circle cx="${px}" cy="${py}" r="4.5" fill="${colour}" stroke="${SURFACE}" stroke-width="2"/>`;
const label = (px, py, text, { anchor = 'start', colour = INK, size = 11.5, weight = 400 } = {}) =>
  `<text x="${px}" y="${py}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${colour}">${escape(text)}</text>`;
const key = (px, py, colour, text, dashed = false) =>
  [
    `<line x1="${px}" x2="${px + 22}" y1="${py - 4}" y2="${py - 4}" stroke="${colour}" stroke-width="2" ${dashed ? 'stroke-dasharray="5 4"' : ''}/>`,
    label(px + 28, py, text, { colour: MUTED }),
  ].join('\n');
const range = (from, to, step) =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);

// 1. ADC transfer curve at 11 dB: a perfect converter against the model.
function adcChart() {
  const stated = ESP32_ADC_EFFECTIVE_RANGE_MV[11];
  const dead = esp32AdcDeadZoneVoltage(11);
  const top = esp32AdcSaturationVoltage(11);
  return chart({
    title: 'ADC transfer curve at 11 dB (the analogRead default)',
    subtitle: 'Count returned for an input voltage: a perfect 0 to 3.3 V converter, and the model.',
    description: `The modelled count is 0 below ${dead} V, runs in a straight line to about 2.46 V, parallel to a perfect converter and about 176 counts below it, then bends upward and reaches 4095 at ${top} V.`,
    x: {
      min: 0,
      max: 3.3,
      ticks: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.3],
      format: (v) => `${v}`,
      label: 'Input voltage (V)',
    },
    y: {
      min: 0,
      max: 4095,
      ticks: [0, 1000, 2000, 3000, 4095],
      format: (v) => `${v}`,
      label: 'Count (12 bits)',
    },
    body: ({ sx, sy, bottom }) => {
      const volts = range(0, 3300, 10).map((mv) => mv / 1000);
      const ideal = volts.map((v) => [sx(v), sy(esp32AdcIdealCount(v))]);
      const model = volts.map((v) => [sx(v), sy(esp32AdcCount(v))]);
      const from = sx(stated.min / 1000);
      const to = sx(stated.max / 1000);
      return [
        `<rect x="${from}" y="${sy(4095)}" width="${round(to - from)}" height="${round(bottom - sy(4095))}" fill="${BAND}" opacity="0.07"/>`,
        label(
          to - 8,
          bottom - 12,
          `accuracy stated only here: ${stated.min} to ${stated.max} mV, ±${stated.error} mV`,
          { anchor: 'end', colour: MUTED },
        ),
        line(ideal, REFERENCE, 'stroke-dasharray="5 4"'),
        line(model, BLUE),
        dot(sx(dead), sy(0), BLUE),
        label(sx(dead) + 10, sy(0) - 10, `reads 0 below ${dead} V`),
        dot(sx(1.65), sy(esp32AdcCount(1.65)), BLUE),
        label(
          sx(1.65) + 10,
          sy(esp32AdcCount(1.65)) + 16,
          `1.65 V reads ${esp32AdcCount(1.65)}, not ${esp32AdcIdealCount(1.65)}`,
        ),
        dot(sx(top), sy(4095), BLUE),
        label(sx(top) - 12, sy(4095) + 4, `stuck at 4095 above ${top} V`, { anchor: 'end' }),
        key(sx(0.12), sy(3700), BLUE, 'Model: Espressif’s curve run backwards'),
        key(sx(0.12), sy(3700) + 20, REFERENCE, 'Perfect converter, 0 to 3.3 V', true),
      ];
    },
  });
}

// 2. PWM: the highest and lowest frequency at each resolution, from the 80 MHz clock.
function ledcChart() {
  const bits = range(1, 20, 1);
  const hertz = (v) => (v >= 1e6 ? `${v / 1e6} MHz` : v >= 1000 ? `${v / 1000} kHz` : `${v} Hz`);
  return chart({
    title: 'PWM frequency against duty resolution (80 MHz clock)',
    subtitle: 'A frequency is possible at a resolution only between the two lines.',
    description:
      'Both limits halve with every extra bit of resolution. The highest frequency is 312.5 kHz at 8 bits, 78.125 kHz at 10, 19.53 kHz at 12 and 1.22 kHz at 16. The lowest is 1024 times smaller.',
    x: { min: 1, max: 20, ticks: bits, format: (v) => `${v}`, label: 'Duty resolution (bits)' },
    y: {
      min: 0.05,
      max: 1e8,
      log: true,
      ticks: [0.1, 1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7],
      format: hertz,
      label: 'PWM frequency',
    },
    body: ({ sx, sy }) => {
      const highest = bits.map((b) => [sx(b), sy(esp32LedcMaxFrequency(b))]);
      const lowest = bits.map((b) => [sx(b), sy(esp32LedcMinFrequency(b))]);
      const band = [...highest, ...lowest.toReversed()].map(([px, py]) => `${px},${py}`).join(' ');
      const marked = [8, 10, 12, 16];
      const text = (f) => (f >= 1000 ? `${round(f / 1000)} kHz` : `${round(f)} Hz`);
      return [
        `<polygon points="${band}" fill="${BAND}" opacity="0.07"/>`,
        line(highest, BLUE),
        line(lowest, ORANGE),
        ...marked.flatMap((b) => [
          dot(sx(b), sy(esp32LedcMaxFrequency(b)), BLUE),
          label(sx(b) + 8, sy(esp32LedcMaxFrequency(b)) - 8, text(esp32LedcMaxFrequency(b))),
          dot(sx(b), sy(esp32LedcMinFrequency(b)), ORANGE),
          label(sx(b) - 8, sy(esp32LedcMinFrequency(b)) + 16, text(esp32LedcMinFrequency(b)), {
            anchor: 'end',
          }),
        ]),
        `<rect x="${sx(ESP32_ANALOG_WRITE_BITS) - 5}" y="${sy(ESP32_ANALOG_WRITE_FREQUENCY) - 5}" width="10" height="10" fill="${INK}" stroke="${SURFACE}" stroke-width="2"/>`,
        label(
          sx(ESP32_ANALOG_WRITE_BITS) + 10,
          sy(ESP32_ANALOG_WRITE_FREQUENCY) + 4,
          'analogWrite default: 1 kHz, 8 bits',
        ),
        key(sx(13.2), sy(2e7), BLUE, 'Highest frequency (divider 1)'),
        key(sx(13.2), sy(2e7) + 20, ORANGE, 'Lowest frequency (divider 1023.996)'),
      ];
    },
  });
}

// 3. Output pin: voltage against load current, at the default and the highest drive strength.
function outputChart() {
  const voh = round(ESP32_VDD * ESP32_VOH_MIN_FRACTION);
  const vol = round(ESP32_VDD * ESP32_VOL_MAX_FRACTION);
  const amps = range(0, 40, 1).map((ma) => ma / 1000);
  return chart({
    title: 'Output pin voltage against load current',
    subtitle: 'Voltage source behind a resistor, fitted to the datasheet test points (dots).',
    description: `Driving HIGH, the pin falls from 3.3 V to ${voh} V at 20 mA at the default drive strength and at 40 mA at the highest. Driving LOW, it rises to ${ESP32_IOL_TEST_VOLTAGE} V at 14 mA at the default strength and at 28 mA at the highest.`,
    x: {
      min: 0,
      max: 40,
      ticks: [0, 5, 10, 15, 20, 25, 30, 35, 40],
      format: (v) => `${v}`,
      label: 'Load current (mA)',
    },
    y: {
      min: 0,
      max: 3.3,
      ticks: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.3],
      format: (v) => `${v}`,
      label: 'Pin voltage (V)',
    },
    body: ({ sx, sy, right }) => {
      const curve = (level, strength) =>
        amps.map((a) => [sx(a * 1000), sy(esp32OutputVoltage(level, a, strength))]);
      const limit = (volts, text, at, anchor) => [
        `<line x1="${sx(0)}" x2="${right}" y1="${sy(volts)}" y2="${sy(volts)}" stroke="${REFERENCE}" stroke-dasharray="5 4"/>`,
        label(sx(at), sy(volts) + 15, text, { anchor, colour: MUTED }),
      ];
      return [
        ...limit(voh, `V_OH minimum ${voh} V`, 27, 'start'),
        ...limit(vol, `V_OL maximum ${vol} V`, 39.7, 'end'),
        line(curve('high', 2), BLUE),
        line(curve('low', 2), BLUE),
        line(curve('high', 3), ORANGE),
        line(curve('low', 3), ORANGE),
        dot(sx(20), sy(voh), BLUE),
        dot(sx(40), sy(voh), ORANGE),
        dot(sx(28), sy(ESP32_IOL_TEST_VOLTAGE), ORANGE),
        label(sx(5), sy(2.72), 'driving HIGH', { weight: 600 }),
        label(sx(5), sy(0.62), 'driving LOW', { weight: 600 }),
        label(sx(33), sy(esp32OutputVoltage('high', 0.033, 2)) + 18, '33 Ω', { colour: MUTED }),
        label(sx(33), sy(esp32OutputVoltage('high', 0.033, 3)) - 8, '16.5 Ω', { colour: MUTED }),
        label(sx(33), sy(esp32OutputVoltage('low', 0.033, 2)) - 10, '35.4 Ω', { colour: MUTED }),
        label(sx(33), sy(esp32OutputVoltage('low', 0.033, 3)) + 18, '17.7 Ω', { colour: MUTED }),
        key(sx(1), sy(1.85), BLUE, 'Default drive strength (2, about 20 mA)'),
        key(sx(1), sy(1.85) + 20, ORANGE, 'Highest drive strength (3, about 40 mA)'),
      ];
    },
  });
}

const files = {
  'esp32-adc-transfer.svg': adcChart(),
  'esp32-ledc-frequency.svg': ledcChart(),
  'esp32-output-load.svg': outputChart(),
};
for (const [name, svg] of Object.entries(files)) {
  writeFileSync(new URL(name, OUT), svg);
  console.log(`wrote ${fileURLToPath(new URL(name, OUT))}`);
}
