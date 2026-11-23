import { readFileSync } from 'node:fs';
import {
  CIRCUIT_SCHEMA_VERSION,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { SimulationSession } from './session';
import { simulate } from './simulate';
import { byteMs } from './uart-devices';
import {
  GSM_REGISTER_MS,
  GSM_SMS_MS,
  Hc05,
  LAB_PHONE_NUMBER,
  MP3,
  MP3_START_MS,
  MP3_TRACK_MS,
  Mp3Player,
  Sim800l,
  mp3Message,
} from './uart-modules';

/**
 * The Bluetooth, MP3 and GSM modules on their own, byte by byte. Nothing here
 * has been compared with the real modules.
 */

const text = (bytes: number[]) => new TextDecoder().decode(Uint8Array.from(bytes));
const ascii = (value: string) => new TextEncoder().encode(value);

describe('HC-05', () => {
  it('passes the phone’s lines to the board at 9600 baud, and the board’s lines to the phone', () => {
    const bt = new Hc05(true);
    bt.fromPhone('1', 1000);
    expect(bt.transmit(1000 + byteMs(9600))).toEqual([0x31]);
    expect(bt.transmit(1010)).toEqual([0x0a]);
    bt.receive(ascii('বাতি জ্বলছে\r\nhal'), 9600);
    expect(bt.status().phone).toEqual({
      connected: true,
      messages: [
        { from: 'phone', text: '1' },
        { from: 'module', text: 'বাতি জ্বলছে' },
        { from: 'module', text: 'hal' },
      ],
    });
  });

  it('with no phone connected, nothing passes either way', () => {
    const bt = new Hc05(false);
    bt.fromPhone('1', 0);
    bt.receive(ascii('hello\n'), 9600);
    expect(bt.transmit(1000)).toEqual([]);
    expect(bt.status().phone?.messages).toEqual([]);
  });
});

describe('DFPlayer Mini', () => {
  /** Everything the player sends, split into its ten-byte messages. */
  const messages = (bytes: number[]) =>
    Array.from({ length: bytes.length / 10 }, (_, i) => bytes.slice(i * 10, i * 10 + 10));

  it('writes messages as DFRobot’s manual gives them, checksum included', () => {
    // The manual's example: play track 1.
    expect(mp3Message(0x03, 1)).toEqual([
      0x7e, 0xff, 0x06, 0x03, 0x00, 0x00, 0x01, 0xfe, 0xf7, 0xef,
    ]);
  });

  it('says its card is online after starting, plays a track, and says when it ends', () => {
    const player = new Mp3Player(5);
    expect(player.transmit(MP3_START_MS - 1)).toEqual([]);
    expect(messages(player.transmit(MP3_START_MS + 20))).toEqual([mp3Message(MP3.online, 2)]);
    player.receive(Uint8Array.from(mp3Message(MP3.track, 3)), 9600, 1500);
    expect(player.status(2000).player).toMatchObject({ track: 3, playing: true });
    expect(player.transmit(1500 + MP3_TRACK_MS - 1)).toEqual([]);
    expect(messages(player.transmit(1500 + MP3_TRACK_MS + 20))).toEqual([
      mp3Message(MP3.finished, 3),
    ]);
    expect(player.status(1500 + MP3_TRACK_MS + 20).player?.playing).toBe(false);
  });

  it('acknowledges when asked, answers queries, and refuses a track it has not got', () => {
    const player = new Mp3Player(5);
    player.transmit(1100);
    player.receive(Uint8Array.from(mp3Message(MP3.volume, 18, 1)), 9600, 1200);
    player.receive(Uint8Array.from(mp3Message(MP3.queryVolume)), 9600, 1300);
    player.receive(Uint8Array.from(mp3Message(MP3.track, 9)), 9600, 1400);
    expect(messages(player.transmit(1500))).toEqual([
      mp3Message(MP3.ack),
      mp3Message(MP3.queryVolume, 18),
      mp3Message(MP3.error, 5),
    ]);
  });

  it('pauses and resumes where it left off; next wraps round to the first track', () => {
    const player = new Mp3Player(2);
    player.transmit(1100);
    player.receive(Uint8Array.from(mp3Message(MP3.track, 2)), 9600, 1200);
    player.receive(Uint8Array.from(mp3Message(MP3.pause)), 9600, 3200);
    player.receive(Uint8Array.from(mp3Message(MP3.play)), 9600, 10_000);
    // 2 s played before the pause, so 6 s remain.
    expect(player.status(15_999).player?.playing).toBe(true);
    expect(player.status(16_001).player?.playing).toBe(false);
    player.receive(Uint8Array.from(mp3Message(MP3.next)), 9600, 17_000);
    expect(player.status(17_000).player?.track).toBe(1);
  });
});

describe('SIM800L', () => {
  const send = (gsm: Sim800l, line: string, at: number, baud = 9600) =>
    gsm.receive(ascii(line), baud, at);

  it('learns the baud rate from AT, echoes, and answers OK', () => {
    const gsm = new Sim800l(20);
    send(gsm, 'AT\r', 100, 19200);
    expect(gsm.baud).toBe(19200);
    expect(text(gsm.transmit(1000))).toBe('AT\r\r\nOK\r\n');
    send(gsm, 'AT+CSQ\r', 1000, 9600); // the wrong rate now: ignored
    expect(gsm.transmit(2000)).toEqual([]);
  });

  it('finds the network after a few seconds, and sends an SMS in text mode', () => {
    const gsm = new Sim800l(20);
    send(gsm, 'ATE0\r', 100);
    send(gsm, 'AT+CREG?\r', 200);
    expect(text(gsm.transmit(500))).toContain('+CREG: 0,2');
    send(gsm, 'AT+CMGS="+8801000000000"\r', GSM_REGISTER_MS);
    expect(text(gsm.transmit(GSM_REGISTER_MS + 100))).toContain('ERROR'); // still in PDU mode
    send(gsm, 'AT+CMGF=1\r', GSM_REGISTER_MS + 200);
    send(gsm, 'AT+CMGS="+8801000000000"\r', GSM_REGISTER_MS + 300);
    expect(text(gsm.transmit(GSM_REGISTER_MS + 400))).toMatch(/OK\r\n\r\n> $/);
    gsm.receive(Uint8Array.from([...ascii('Gas! গ্যাস'), 0x1a]), 9600, GSM_REGISTER_MS + 500);
    expect(text(gsm.transmit(GSM_REGISTER_MS + 600))).toBe('');
    expect(text(gsm.transmit(GSM_REGISTER_MS + 500 + GSM_SMS_MS + 50))).toBe(
      '\r\n+CMGS: 1\r\n\r\nOK\r\n',
    );
    // Bangla is not in the GSM alphabet.
    expect(gsm.status(9000).phone?.messages).toEqual([
      { from: 'module', text: 'Gas! ?????', number: '+8801000000000' },
    ]);
  });

  it('stores an SMS from the phone and says where; or hands it straight over with CNMI 2', () => {
    const gsm = new Sim800l(20);
    send(gsm, 'ATE0\r', 100);
    send(gsm, 'AT+CMGF=1\r', 200);
    gsm.fromPhone('ON', 4000);
    expect(text(gsm.transmit(4100))).toContain('+CMTI: "SM",1');
    send(gsm, 'AT+CMGR=1\r', 4200);
    expect(text(gsm.transmit(4300))).toMatch(
      new RegExp(`\\+CMGR: "REC UNREAD","\\${LAB_PHONE_NUMBER}",.*\\r\\nON\\r\\n`),
    );
    send(gsm, 'AT+CNMI=2,2,0,0,0\r', 4400);
    gsm.fromPhone('OFF', 5000);
    expect(text(gsm.transmit(5200))).toMatch(/\+CMT: "\+8801000000000",.*\r\nOFF\r\n$/);
  });

  it('without signal it never registers, and an SMS from the phone is not delivered', () => {
    const gsm = new Sim800l(0);
    send(gsm, 'AT\r', 100);
    gsm.fromPhone('ON', 9000);
    expect(gsm.status(9000).network).toEqual({ registered: false, signal: 0 });
    expect(gsm.status(9000).phone?.messages[0]).toMatchObject({ undelivered: true });
  });
});

describe(
  'the ready-made programs, with their modules on the ESP32’s second UART',
  { timeout: 30_000 },
  () => {
    const starter = (name: string) =>
      readFileSync(
        new URL(
          `../../board-emulators/fixtures/esp32-starters/${name}.wasm.base64`,
          import.meta.url,
        ),
        'utf8',
      );
    function circuit(components: CircuitComponent[], wires: [string, string][]): CircuitDocument {
      return {
        schemaVersion: CIRCUIT_SCHEMA_VERSION,
        components: [{ id: 'ESP1', type: 'esp32', props: {} }, ...components],
        wires: wires.map(([from, to], i): Wire => ({
          id: `W${i + 1}`,
          from,
          to,
          color: '#000000',
        })),
      };
    }
    const part = (
      id: string,
      type: string,
      pins: Record<string, string>,
      props: Record<string, unknown>,
    ) => ({ id, type, pins, props }) as unknown as CircuitComponent;
    /** The LED with its 220 Ω resistor, from D2. */
    const lamp = [
      part('R1', 'resistor', { a: 'f20', b: 'f24' }, { resistance: 220 }),
      part('LED1', 'led', { anode: 'g24', cathode: 'g25' }, { color: 'red' }),
    ];
    const lampWires: [string, string][] = [
      ['ESP1.d2', 'j20'],
      ['ESP1.gnd2', 'j25'],
    ];
    function run(session: SimulationSession, milliseconds: number): string {
      let printed = '';
      for (let t = 0; t < milliseconds; t += 50) {
        session.advance(50);
        printed += session.frame().boards.ESP1!.serial;
      }
      return printed;
    }
    const led = (session: SimulationSession) => session.frame().result.readings.LED1!.led?.state;

    it('bluetooth: the phone switches the LED, and the board answers the phone', () => {
      const session = new SimulationSession(
        circuit(
          [
            part(
              'BT1',
              'bluetooth',
              { vcc: 'c10', gnd: 'c11', tx: 'c12', rx: 'c13' },
              { paired: true },
            ),
            ...lamp,
          ],
          [
            ['ESP1.vin', 'a10'],
            ['ESP1.gnd1', 'a11'],
            ['ESP1.rx2', 'a12'],
            ['ESP1.tx2', 'a13'],
            ...lampWires,
          ],
        ),
      );
      session.loadFirmware('ESP1', starter('bluetooth'));
      run(session, 500);
      session.phone('BT1', '1');
      expect(run(session, 1500)).toContain('ফোন বলল: 1');
      expect(led(session)).toBe('on');
      const phone = session.frame().result.readings.BT1!.phone!;
      expect(phone.messages.map((m) => m.text)).toEqual([
        'হ্যালো! 1 পাঠালে বাতি জ্বলবে, 0 পাঠালে নিভবে',
        '1',
        'বাতি জ্বলছে',
      ]);
      session.phone('BT1', '0');
      run(session, 1500);
      expect(led(session)).toBe('off');
    });

    it('mp3: the player is found, plays track 1, and the button moves to the next', () => {
      const document = () =>
        circuit(
          [
            part('MP1', 'mp3', { vcc: 'c10', rx: 'c11', tx: 'c12', gnd: 'c13' }, { tracks: 5 }),
            part('SW1', 'button', { a: 'e20', b: 'e22' }, {}),
          ],
          [
            ['ESP1.vin', 'a10'],
            ['ESP1.tx2', 'a11'],
            ['ESP1.rx2', 'a12'],
            ['ESP1.gnd1', 'a13'],
            ['ESP1.d4', 'a20'],
            ['ESP1.gnd2', 'a22'],
          ],
        );
      const session = new SimulationSession(document());
      session.loadFirmware('ESP1', starter('mp3'));
      const started = run(session, 3000);
      expect(started).toContain('প্লেয়ার তৈরি, কার্ডে গান আছে: 5');
      expect(started).toContain('গান 1 বাজছে');
      expect(session.frame().result.readings.MP1!.player).toMatchObject({
        track: 1,
        playing: true,
        volume: 20,
      });
      session.update(document(), ['SW1']);
      expect(run(session, 500)).toContain('গান 2 বাজছে');
      session.update(document(), []);
      expect(run(session, 9000)).toContain('গান 2 শেষ হলো');
    });

    it('mp3: with TX wired to TX the program says the player does not answer', () => {
      const session = new SimulationSession(
        circuit(
          [part('MP1', 'mp3', { vcc: 'c10', rx: 'c11', tx: 'c12', gnd: 'c13' }, { tracks: 5 })],
          [
            ['ESP1.vin', 'a10'],
            ['ESP1.rx2', 'a11'],
            ['ESP1.tx2', 'a12'],
            ['ESP1.gnd1', 'a13'],
          ],
        ),
      );
      session.loadFirmware('ESP1', starter('mp3'));
      expect(run(session, 4500)).toContain('প্লেয়ার সাড়া দিচ্ছে না');
    });

    /** The SIM800L on an 18650 cell, its ground shared with the board's. */
    const gsmCircuit = (signal: number, charge = 0.5) =>
      circuit(
        [
          part('GSM1', 'gsm', { vcc: 'c10', rx: 'c11', tx: 'c12', gnd: 'c13' }, { signal }),
          part('CELL1', 'cell', { pos: 'c3', neg: 'c5' }, { charge, capacity: 2000 }),
          ...lamp,
        ],
        [
          ['a3', 'a10'],
          ['a5', 'a13'],
          ['ESP1.tx2', 'a11'],
          ['ESP1.rx2', 'a12'],
          ['ESP1.gnd1', 'b13'],
          ...lampWires,
        ],
      );

    it('sms: finds the network, says it is ready, and obeys ON and OFF', () => {
      const session = new SimulationSession(gsmCircuit(20));
      session.loadFirmware('ESP1', starter('sms'));
      const started = run(session, 12_000);
      expect(started).toContain('নেটওয়ার্ক পাওয়া গেছে');
      expect(started).toContain('SMS পাঠানো হলো');
      session.phone('GSM1', 'on');
      expect(run(session, 6000)).toContain('SMS এসেছে: ON');
      expect(led(session)).toBe('on');
      const messages = session.frame().result.readings.GSM1!.phone!.messages;
      expect(messages.map((m) => `${m.from}: ${m.text}`)).toEqual([
        'module: Light controller ready. Send ON or OFF.',
        'phone: on',
        'module: Light is ON',
      ]);
    });

    it('sms: with no signal the program says there is no network', () => {
      const session = new SimulationSession(gsmCircuit(0));
      session.loadFirmware('ESP1', starter('sms'));
      expect(run(session, 14_000)).toContain('নেটওয়ার্ক পাওয়া যায়নি');
    });

    it('a SIM800L on 5 V is being damaged, and the lab says so', () => {
      const document = circuit(
        [part('GSM1', 'gsm', { vcc: 'c10', rx: 'c11', tx: 'c12', gnd: 'c13' }, { signal: 20 })],
        [
          ['ESP1.vin', 'a10'],
          ['ESP1.gnd1', 'a13'],
        ],
      );
      const session = new SimulationSession(document);
      session.loadFirmware('ESP1', starter('sms'));
      run(session, 200);
      expect(simulate(document).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'gsm-overvoltage', componentId: 'GSM1' }),
        ]),
      );
    });
  },
);
