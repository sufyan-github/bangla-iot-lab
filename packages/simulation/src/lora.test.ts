import { readFileSync } from 'node:fs';
import {
  CIRCUIT_SCHEMA_VERSION,
  FIRST_BREADBOARD,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import {
  LORA_IRQ,
  SX1278_REG,
  Sx1278,
  receivedDbm,
  sensitivityDbm,
  timeOnAirMs,
  type LoraSettings,
  type Packet,
} from './lora';
import { SimulationSession } from './session';
import { simulate } from './simulate';

/**
 * The Ra-02's SX1278 radio: its registers over SPI, the time a packet takes
 * on air, and two boards talking through two radios, driven by the LoRa
 * library in the ready-made programs. Nothing here has been compared with
 * real modules.
 */

const settings: LoraSettings = {
  frequencyHz: 433e6,
  spreadingFactor: 7,
  bandwidthHz: 125e3,
  codingRate: 1,
  implicitHeader: false,
  crc: true,
  preamble: 8,
  lowDataRateOptimize: false,
  syncWord: 0x34,
  txPowerDbm: 17,
};

describe('LoRa on air', () => {
  it('takes the time the datasheet’s formula gives', () => {
    // SF7, 125 kHz, 4/5, 8 preamble symbols, explicit header, CRC, 10 bytes:
    // 1.024 ms a symbol, 12.25 for the preamble and 28 for the rest.
    expect(timeOnAirMs(settings, 10)).toBeCloseTo(41.216, 3);
    // A spreading factor more doubles the symbol time: SF12 is far slower.
    const slow = { ...settings, spreadingFactor: 12, lowDataRateOptimize: true };
    expect(timeOnAirMs(slow, 10)).toBeGreaterThan(20 * timeOnAirMs(settings, 10));
  });

  it('reaches further at a higher spreading factor', () => {
    expect(sensitivityDbm(settings)).toBeCloseTo(-124.5, 0);
    expect(sensitivityDbm({ ...settings, spreadingFactor: 12 })).toBeCloseTo(-137, 0);
    expect(receivedDbm(17, 0.5)).toBeGreaterThan(receivedDbm(17, 5));
  });
});

describe('the SX1278 over SPI', () => {
  const exchange = (chip: Sx1278, bytes: number[], timeMs = 0) => {
    chip.select();
    const out = chip.exchange(Uint8Array.from(bytes), timeMs);
    chip.deselect();
    return [...out];
  };

  it('answers with its version, and keeps what is written', () => {
    const chip = new Sx1278(
      'R',
      () => {},
      () => {},
    );
    expect(exchange(chip, [SX1278_REG.version, 0])[1]).toBe(0x12);
    exchange(chip, [SX1278_REG.syncWord | 0x80, 0x34]);
    expect(exchange(chip, [SX1278_REG.syncWord, 0])[1]).toBe(0x34);
  });

  it('sends what is in its FIFO, and raises DIO0 when the packet has gone', () => {
    const sent: Packet[] = [];
    const dio0: boolean[] = [];
    const chip = new Sx1278(
      'R',
      (p) => sent.push(p),
      ({ level }) => dio0.push(level),
    );
    exchange(chip, [SX1278_REG.opMode | 0x80, 0x80]); // LoRa, asleep
    exchange(chip, [SX1278_REG.fifoAddrPtr | 0x80, 0x80]);
    exchange(chip, [SX1278_REG.fifo | 0x80, 0x68, 0x69]); // "hi"
    exchange(chip, [SX1278_REG.payloadLength | 0x80, 2]);
    exchange(chip, [SX1278_REG.dioMapping1 | 0x80, 0x40]); // DIO0 on TxDone
    exchange(chip, [SX1278_REG.opMode | 0x80, 0x83]); // send
    expect(sent).toHaveLength(1);
    expect(String.fromCharCode(...sent[0]!.payload)).toBe('hi');
    chip.advance(sent[0]!.end);
    expect(exchange(chip, [SX1278_REG.irqFlags, 0])[1]! & LORA_IRQ.txDone).toBeTruthy();
    expect(dio0).toEqual([true]);
    exchange(chip, [SX1278_REG.irqFlags | 0x80, LORA_IRQ.txDone]);
    expect(dio0).toEqual([true, false]);
  });
});

describe('two boards, two radios', () => {
  const starter = (name: string) =>
    readFileSync(
      new URL(`../../board-emulators/fixtures/esp32-starters/${name}.wasm.base64`, import.meta.url),
      'utf8',
    );
  const LEGS = ['gnd', 'vcc', 'rst', 'dio0', 'nss', 'mosi', 'miso', 'sck'] as const;
  const PINS = ['gnd1', '3v3', 'd14', 'd2', 'd5', 'd23', 'd19', 'd18'] as const;
  /** Two ESP32 boards, each with a Ra-02 on its SPI bus; the second radio `km` along the road. */
  function document(km: number, supply = '3v3'): CircuitDocument {
    const radio = (id: string, column: number, at: number): CircuitComponent => ({
      id,
      type: 'lora',
      pins: Object.fromEntries(LEGS.map((leg, i) => [leg, `BB1.c${column + i}`])) as never,
      props: { km: at },
    });
    const wires: [string, string][] = [];
    for (const [board, column] of [
      ['ESP1', 1],
      ['ESP2', 11],
    ] as const) {
      PINS.forEach((pin, i) =>
        wires.push([`${board}.${pin === '3v3' ? supply : pin}`, `BB1.a${column + i}`]),
      );
    }
    return {
      schemaVersion: CIRCUIT_SCHEMA_VERSION,
      components: [
        FIRST_BREADBOARD,
        { id: 'ESP1', type: 'esp32', props: {} },
        { id: 'ESP2', type: 'esp32', props: {} },
        radio('LORA1', 1, 0),
        radio('LORA2', 11, km),
      ],
      wires: wires.map(([from, to], i): Wire => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
    };
  }
  function run(circuit: CircuitDocument, milliseconds: number) {
    const session = new SimulationSession(circuit);
    session.loadFirmware('ESP1', starter('lora-send'));
    session.loadFirmware('ESP2', starter('lora-receive'));
    const printed: Record<string, string> = { ESP1: '', ESP2: '' };
    for (let t = 0; t < milliseconds; t += 50) {
      session.advance(50);
      for (const [id, board] of Object.entries(session.frame().boards)) printed[id] += board.serial;
    }
    return { printed, frame: session.frame() };
  }

  it('half a kilometre apart, every message arrives, with its signal strength', () => {
    const { printed, frame } = run(document(0.5), 4800);
    expect(printed.ESP1).toContain('পাঠানোর রেডিও চালু');
    expect(printed.ESP2).toContain('শোনার রেডিও চালু');
    expect(printed.ESP1).toContain('পাঠালাম: hello 2');
    // ESTIMATE: 17 dBm less the loss over 500 m.
    const expected = Math.round(receivedDbm(17, 0.5));
    // The first message goes out before the receiving program has started listening, as it
    // can with two real boards switched on together; the ones after it arrive.
    expect(printed.ESP2).not.toContain('hello 1');
    expect(printed.ESP2).toContain(`পেলাম: hello 2  RSSI: ${expected} dBm`);
    expect(printed.ESP2).toContain('পেলাম: hello 3');
    expect(frame.result.readings.LORA2!.radio).toMatchObject({
      received: 2,
      lastRssi: expected,
      distanceKm: 0.5,
    });
    expect(frame.result.readings.LORA1!.radio!.sent).toBeGreaterThanOrEqual(2);
  });

  it('too far apart, nothing arrives', () => {
    const { printed, frame } = run(document(15), 4800);
    expect(printed.ESP1).toContain('পাঠালাম: hello 2');
    expect(printed.ESP2).not.toContain('পেলাম');
    expect(frame.result.readings.LORA2!.radio!.received).toBe(0);
  });

  it('on 5 V the radio is shown as damaged', () => {
    const codes = simulate(document(0.5, 'vin')).diagnostics.map((d) => d.code);
    expect(codes).toContain('module-overvoltage');
  });
});
