import { readFileSync } from 'node:fs';
import {
  CIRCUIT_SCHEMA_VERSION,
  updateProps,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { Peripherals } from './peripherals';
import { SimulationSession } from './session';
import { Neo6m, Pms5003, byteMs, gpsBurst, nmea, pmsFrame } from './uart-devices';

/**
 * Serial modules: the GPS's sentences and the particle sensor's frames, then
 * each read by its ready-made program over the ESP32's second UART. Nothing
 * here has been compared with the real modules.
 */

const starter = (name: string) =>
  readFileSync(
    new URL(`../../board-emulators/fixtures/esp32-starters/${name}.wasm.base64`, import.meta.url),
    'utf8',
  );
function circuit(components: CircuitComponent[], wires: [string, string][]): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components,
    wires: wires.map(([from, to], i): Wire => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
  };
}
const esp32: CircuitComponent = { id: 'ESP1', type: 'esp32', props: {} };
function printed(session: SimulationSession, milliseconds: number): string {
  let text = '';
  for (let t = 0; t < milliseconds; t += 50) {
    session.advance(50);
    text += session.frame().boards.ESP1!.serial;
  }
  return text;
}

describe('GPS sentences', () => {
  it('carries the NMEA checksum: the XOR of everything between $ and *', () => {
    // A sentence often quoted as an example of the format.
    expect(nmea('GPGLL,4916.45,N,12311.12,W,225444,A')).toBe(
      '$GPGLL,4916.45,N,12311.12,W,225444,A*31\r\n',
    );
  });

  it('writes the position in degrees and minutes, and leaves it out without a fix', () => {
    const fixed = gpsBurst({ fix: true, lat: 23.7465, lng: 90.3763, satellites: 8 }, 1);
    // 23.7465° is 23° 44.79', and 90.3763° is 90° 22.578'.
    expect(fixed).toContain(',2344.79000,N,09022.57800,E,');
    expect(fixed).toMatch(/\$GPGGA,060001\.00,2344\.79000,N,09022\.57800,E,1,08,/);
    const lost = gpsBurst({ fix: false, lat: 23.7465, lng: 90.3763, satellites: 8 }, 1);
    expect(lost).toMatch(/\$GPRMC,060001\.00,V,,,,,/);
    expect(lost).toMatch(/\$GPGGA,060001\.00,,,,,0,03,/);
  });

  it('sends one burst a second, at 9600 baud', () => {
    const gps = new Neo6m({ fix: true, lat: 1, lng: 1, satellites: 6 });
    expect(gps.transmit(999)).toEqual([]);
    // Just after the first second only the first few bytes have arrived.
    const early = gps.transmit(1000 + 5 * byteMs(9600));
    expect(String.fromCharCode(...early)).toBe('$GPRM');
    const rest = gps.transmit(1900);
    expect(String.fromCharCode(...early, ...rest)).toBe(
      gpsBurst({ fix: true, lat: 1, lng: 1, satellites: 6 }, 1),
    );
  });
});

describe('PMS5003 frames', () => {
  it('are 32 bytes: 42h 4Dh, length 28, thirteen words and their sum', () => {
    const frame = pmsFrame(35);
    expect(frame.length).toBe(32);
    expect([frame[0], frame[1], frame[2], frame[3]]).toEqual([0x42, 0x4d, 0x00, 0x1c]);
    // PM2.5 in the atmosphere is the fifth word.
    expect((frame[12]! << 8) | frame[13]!).toBe(35);
    const sum = [...frame.subarray(0, 30)].reduce((a, b) => a + b, 0);
    expect((frame[30]! << 8) | frame[31]!).toBe(sum);
  });

  it('in passive mode sends a frame only when asked, and nothing while asleep', () => {
    const sensor = new Pms5003(20);
    const command = (code: number, value: number) => {
      const bytes = [0x42, 0x4d, code, 0x00, value];
      const sum = bytes.reduce((a, b) => a + b, 0);
      return Uint8Array.from([...bytes, sum >> 8, sum & 0xff]);
    };
    sensor.receive(command(0xe1, 0), 9600, 0); // passive
    expect(sensor.transmit(3000)).toEqual([]);
    sensor.receive(command(0xe2, 0), 9600, 3000); // read
    expect(sensor.transmit(3100)).toEqual([...pmsFrame(20)]);
    sensor.receive(command(0xe4, 0), 9600, 3100); // sleep
    sensor.receive(command(0xe2, 0), 9600, 3200);
    expect(sensor.transmit(4000)).toEqual([]);
  });
});

describe('the serial line between board and module', () => {
  const gpsAt = (tx: string, rx: string): CircuitDocument =>
    circuit(
      [
        esp32,
        {
          id: 'GPS1',
          type: 'gps',
          pins: { vcc: 'c10', rx: 'c11', tx: 'c12', gnd: 'c13' },
          props: { fix: true, lat: 23.7465, lng: 90.3763, satellites: 8 },
        } as CircuitComponent,
      ],
      [
        ['ESP1.3v3', 'a10'],
        [rx, 'a11'],
        [tx, 'a12'],
        ['ESP1.gnd1', 'a13'],
      ],
    );

  it('at the wrong baud rate the board receives other bytes than were sent', () => {
    const peripherals = new Peripherals();
    peripherals.rewire(gpsAt('ESP1.rx2', 'ESP1.tx2'));
    peripherals.setPowered(() => true);
    const port = { port: 2, rx: 16, tx: 17, timeMs: 1900 };
    const right = peripherals.uartReceive('ESP1', { ...port, baud: 9600 });
    expect(String.fromCharCode(...right)).toMatch(/^\$GPRMC/);
    peripherals.rewire(gpsAt('ESP1.rx2', 'ESP1.tx2'));
    const wrong = peripherals.uartReceive('ESP1', { ...port, baud: 115200, timeMs: 2900 });
    expect(wrong.length).toBeGreaterThan(0);
    expect(String.fromCharCode(...wrong)).not.toContain('$GP');
  });

  it('the GPS program prints the position, crossed TX to RX', () => {
    const session = new SimulationSession(gpsAt('ESP1.rx2', 'ESP1.tx2'));
    session.loadFirmware('ESP1', starter('gps'));
    expect(printed(session, 4500)).toContain(
      'অক্ষাংশ: 23.746500, দ্রাঘিমাংশ: 90.376300, স্যাটেলাইট: 8',
    );
  });

  it('with TX wired to TX nothing arrives, and the program says so', () => {
    const session = new SimulationSession(gpsAt('ESP1.tx2', 'ESP1.rx2'));
    session.loadFirmware('ESP1', starter('gps'));
    expect(printed(session, 4500)).toContain('GPS থেকে কিছুই আসছে না');
  });

  it('without a fix the program waits, and finds the position once there is one', () => {
    let document = gpsAt('ESP1.rx2', 'ESP1.tx2');
    const lost = updateProps(document, 'GPS1', { fix: false });
    if (!lost.ok) throw new Error(lost.error);
    document = lost.circuit;
    const session = new SimulationSession(document);
    session.loadFirmware('ESP1', starter('gps'));
    expect(printed(session, 4500)).toContain('অবস্থান এখনো জানা নেই, স্যাটেলাইট: 3');
    const found = updateProps(document, 'GPS1', { fix: true });
    if (!found.ok) throw new Error(found.error);
    session.update(found.circuit);
    expect(printed(session, 4500)).toContain('অক্ষাংশ: 23.746500');
    // Losing the fix again: TinyGPSPlus keeps the old position valid, so the program checks its age.
    session.update(document);
    expect(printed(session, 6000)).toContain('অবস্থান এখনো জানা নেই');
  });

  it('the air program reads the PMS5003 through the PMS library, and lights the LED above 55', () => {
    const document = (pm25: number) =>
      circuit(
        [
          esp32,
          {
            id: 'PM1',
            type: 'pms5003',
            pins: { vcc: 'c10', gnd: 'c11', rx: 'c12', tx: 'c13' },
            props: { pm25 },
          } as CircuitComponent,
          { id: 'R1', type: 'resistor', pins: { a: 'f20', b: 'f24' }, props: { resistance: 220 } },
          {
            id: 'LED1',
            type: 'led',
            pins: { anode: 'g24', cathode: 'g25' },
            props: { color: 'red' },
          } as CircuitComponent,
        ],
        [
          ['ESP1.vin', 'a10'],
          ['ESP1.gnd1', 'a11'],
          ['ESP1.tx2', 'a12'],
          ['ESP1.rx2', 'a13'],
          ['ESP1.d2', 'j20'],
          ['ESP1.gnd2', 'j25'],
        ],
      );
    const session = new SimulationSession(document(35));
    session.loadFirmware('ESP1', starter('air'));
    expect(printed(session, 2500)).toContain('PM1.0: 25, PM2.5: 35, PM10: 46 µg/m³');
    session.update(document(80));
    expect(printed(session, 2500)).toContain('PM2.5: 80,');
    expect(session.frame().result.readings.LED1!.led?.state).toBe('on');
  });
});
