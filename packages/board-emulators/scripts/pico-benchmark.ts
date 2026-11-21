/**
 * How fast does the emulated Pico run? Prints simulated time, time the processor
 * was awake, and real time for three kinds of program. Run on the device you
 * care about: pnpm --filter @banglalab/board-emulators pico:benchmark
 */
import { createPicoFromVendor } from '../src/pico-fixtures';

const board = createPicoFromVendor();
const measure = (label: string, source: string, limitMs: number) => {
  const sim = board.timeMs;
  const awake = board.awakeMs;
  const wall = performance.now();
  const result = board.run(source, limitMs);
  const wallMs = performance.now() - wall;
  const simMs = board.timeMs - sim;
  const awakeMs = board.awakeMs - awake;
  console.log(
    `${label}: ${simMs.toFixed(0)} ms simulated, awake ${awakeMs.toFixed(0)} ms, ${wallMs.toFixed(0)} ms real ` +
      `=> ${(simMs / wallMs).toFixed(1)}x real time overall, ${(awakeMs / wallMs).toFixed(2)}x while awake` +
      (result.finished ? '' : '  (did not finish)'),
  );
};

const bootWall = performance.now();
if (!board.boot()) throw new Error('MicroPython did not reach its prompt');
console.log(
  `boot: ${board.timeMs.toFixed(0)} ms simulated, ${(performance.now() - bootWall).toFixed(0)} ms real`,
);

measure(
  'blink (mostly asleep)',
  'from machine import Pin\nimport time\nled = Pin(25, Pin.OUT)\nfor i in range(10):\n    led.toggle()\n    time.sleep_ms(500)',
  8000,
);
measure(
  'sensor loop (read, print, short sleep)',
  'from machine import ADC\nimport time\na = ADC(26)\nfor i in range(50):\n    print(a.read_u16())\n    time.sleep_ms(100)',
  8000,
);
measure(
  'arithmetic loop (never asleep)',
  's = 0\nfor i in range(20000):\n    s += i * i\nprint(s)',
  20000,
);
