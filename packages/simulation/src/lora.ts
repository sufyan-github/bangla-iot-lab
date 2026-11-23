/**
 * The SX1278 LoRa radio of the Ra-02 module, as a program sees it over SPI,
 * and the air between two of them. Written from Semtech's SX1276/77/78/79
 * datasheet: the LoRa-mode registers, the FIFO, the operating modes, the
 * interrupt flags on DIO0, and the time a packet takes on air. Nothing here has
 * been compared with a real module.
 *
 * Only what the common Arduino LoRa library uses is modelled; FSK mode, frequency
 * hopping, channel activity detection and the other DIO lines are left out.
 */

export const SX1278_REG = {
  fifo: 0x00,
  opMode: 0x01,
  frfMsb: 0x06,
  frfMid: 0x07,
  frfLsb: 0x08,
  paConfig: 0x09,
  fifoAddrPtr: 0x0d,
  fifoTxBase: 0x0e,
  fifoRxBase: 0x0f,
  fifoRxCurrent: 0x10,
  irqFlags: 0x12,
  rxNbBytes: 0x13,
  pktSnr: 0x19,
  pktRssi: 0x1a,
  rssi: 0x1b,
  modemConfig1: 0x1d,
  modemConfig2: 0x1e,
  preambleMsb: 0x20,
  preambleLsb: 0x21,
  payloadLength: 0x22,
  modemConfig3: 0x26,
  syncWord: 0x39,
  dioMapping1: 0x40,
  version: 0x42,
  paDac: 0x4d,
} as const;

export const LORA_MODE = { sleep: 0, standby: 1, tx: 3, rxContinuous: 5, rxSingle: 6 } as const;
export const LORA_IRQ = { rxDone: 0x40, crcError: 0x20, validHeader: 0x10, txDone: 0x08 } as const;

/** Register values after power-on or reset, from the datasheet's register table (LoRa mode). */
const RESET_VALUES: Record<number, number> = {
  [SX1278_REG.opMode]: 0x09,
  // 434 MHz.
  [SX1278_REG.frfMsb]: 0x6c,
  [SX1278_REG.frfMid]: 0x80,
  [SX1278_REG.frfLsb]: 0x00,
  [SX1278_REG.paConfig]: 0x4f,
  0x0b: 0x2b,
  0x0c: 0x20,
  [SX1278_REG.fifoTxBase]: 0x80,
  [SX1278_REG.modemConfig1]: 0x72,
  [SX1278_REG.modemConfig2]: 0x70,
  0x1f: 0x64,
  [SX1278_REG.preambleLsb]: 0x08,
  [SX1278_REG.payloadLength]: 0x01,
  0x23: 0xff,
  0x31: 0xc3,
  0x37: 0x0a,
  [SX1278_REG.syncWord]: 0x12,
  [SX1278_REG.version]: 0x12,
  [SX1278_REG.paDac]: 0x84,
};

/** Signal bandwidths by the code in RegModemConfig1, in hertz. */
const BANDWIDTHS = [7.8e3, 10.4e3, 15.6e3, 20.8e3, 31.25e3, 41.7e3, 62.5e3, 125e3, 250e3, 500e3];

/**
 * REPORTED, from the datasheet's table of spreading factors: the lowest
 * signal-to-noise ratio, in dB, at which each spreading factor (6 to 12) can
 * still be received.
 */
const SNR_LIMIT: Record<number, number> = {
  6: -5,
  7: -7.5,
  8: -10,
  9: -12.5,
  10: -15,
  11: -17.5,
  12: -20,
};
/** REPORTED, from the datasheet: the receiver's noise figure, in dB. */
const NOISE_FIGURE_DB = 6;
/**
 * ESTIMATE: how fast the signal weakens with distance, as the exponent of a
 * log-distance model. 2 is open space; 3.3 is between open country and a town,
 * with the modules near the ground.
 */
export const LORA_PATH_EXPONENT = 3.3;
/** Free-space loss over the first metre at 433 MHz, in dB: 20·log10(4π·1 m / λ). */
const LOSS_AT_ONE_METRE_DB = 25.2;
/** ESTIMATE: two frequencies further apart than this share of the bandwidth do not hear each other. */
const FREQUENCY_TOLERANCE = 0.25;
/** REPORTED: the RSSI register reads the signal plus this, at frequencies below 525 MHz. */
const RSSI_OFFSET_LF = 164;

/** What a radio is set to, as far as two radios hearing each other goes. */
export interface LoraSettings {
  frequencyHz: number;
  spreadingFactor: number;
  bandwidthHz: number;
  /** Coding rate 4/(4 + codingRate): 1 to 4. */
  codingRate: number;
  implicitHeader: boolean;
  crc: boolean;
  preamble: number;
  lowDataRateOptimize: boolean;
  syncWord: number;
  txPowerDbm: number;
}

/**
 * Time on air of a packet, in milliseconds, from the datasheet's formula:
 * the preamble plus 4.25 symbols, then 8 symbols and as many more as the
 * payload, header and CRC take at the coding rate.
 */
export function timeOnAirMs(settings: LoraSettings, payloadBytes: number): number {
  const { spreadingFactor: sf, bandwidthHz: bw, codingRate: cr } = settings;
  const symbolMs = ((1 << sf) / bw) * 1000;
  const de = settings.lowDataRateOptimize ? 1 : 0;
  const ih = settings.implicitHeader ? 1 : 0;
  const crc = settings.crc ? 1 : 0;
  const numerator = 8 * payloadBytes - 4 * sf + 28 + 16 * crc - 20 * ih;
  const payloadSymbols = 8 + Math.max(Math.ceil(numerator / (4 * (sf - 2 * de))) * (cr + 4), 0);
  return (settings.preamble + 4.25 + payloadSymbols) * symbolMs;
}

/** The weakest signal, in dBm, a receiver at these settings still decodes. */
export function sensitivityDbm(settings: Pick<LoraSettings, 'spreadingFactor' | 'bandwidthHz'>) {
  return noiseFloorDbm(settings.bandwidthHz) + (SNR_LIMIT[settings.spreadingFactor] ?? -7.5);
}

function noiseFloorDbm(bandwidthHz: number): number {
  return -174 + 10 * Math.log10(bandwidthHz) + NOISE_FIGURE_DB;
}

/** ESTIMATE: the signal, in dBm, that arrives over `km` from a radio sending at `txDbm`. */
export function receivedDbm(txDbm: number, km: number): number {
  const metres = Math.max(1, km * 1000);
  return txDbm - LOSS_AT_ONE_METRE_DB - 10 * LORA_PATH_EXPONENT * Math.log10(metres);
}

/** A packet in the air: who sent it, with what settings, when it starts and ends. */
export interface Packet {
  from: string;
  settings: LoraSettings;
  payload: Uint8Array;
  start: number;
  end: number;
}

/** What a radio is doing and what it last heard, for the inspector. */
export interface RadioStatus {
  mode: 'sleep' | 'standby' | 'transmitting' | 'receiving';
  sent: number;
  received: number;
  /** The last packet received: its signal strength and signal-to-noise ratio, in dB. */
  lastRssi?: number;
  lastSnr?: number;
  /** How far it is from the other radio, in kilometres, when there is one. */
  distanceKm?: number;
}

/** A level the radio puts on its DIO0 pin at a moment. */
export interface Dio0Change {
  timeMs: number;
  level: boolean;
}

export class Sx1278 {
  private regs = new Uint8Array(0x80);
  private readonly fifo = new Uint8Array(256);
  private selected = false;
  /** The register address of the exchange under way, and whether it writes. */
  private address: number | null = null;
  private writing = false;
  /** When the packet being sent leaves the antenna. */
  private sending: { end: number; length: number } | null = null;
  /** A packet on its way to this radio, heard from its start. */
  private incoming: Packet | null = null;
  private lastDio0 = false;
  sent = 0;
  received = 0;
  lastRssi: number | undefined;
  lastSnr: number | undefined;

  constructor(
    readonly id: string,
    /** Hands a packet to the air when this radio starts sending it. */
    private readonly transmit: (packet: Packet) => void,
    /** Says when DIO0 changes level. */
    private readonly dio0: (change: Dio0Change) => void,
  ) {
    this.reset();
  }

  /** Power-on or a pulse on RST: every register back to its reset value, the FIFO kept. */
  reset(): void {
    this.regs = new Uint8Array(0x80);
    for (const [address, value] of Object.entries(RESET_VALUES)) this.regs[Number(address)] = value;
    this.sending = null;
    this.incoming = null;
    this.address = null;
    this.lastDio0 = false;
  }

  /** Power lost: the FIFO is forgotten too. */
  powerOff(): void {
    this.fifo.fill(0);
    this.reset();
    this.sent = 0;
    this.received = 0;
    this.lastRssi = undefined;
    this.lastSnr = undefined;
  }

  get mode(): number {
    return this.regs[SX1278_REG.opMode]! & 0x07;
  }

  /** LoRa mode, rather than FSK, which the lab does not model. */
  get loraMode(): boolean {
    return (this.regs[SX1278_REG.opMode]! & 0x80) !== 0;
  }

  get listening(): boolean {
    return (
      this.loraMode && (this.mode === LORA_MODE.rxContinuous || this.mode === LORA_MODE.rxSingle)
    );
  }

  settings(): LoraSettings {
    const r = this.regs;
    const frf =
      (r[SX1278_REG.frfMsb]! << 16) | (r[SX1278_REG.frfMid]! << 8) | r[SX1278_REG.frfLsb]!;
    const config1 = r[SX1278_REG.modemConfig1]!;
    const config2 = r[SX1278_REG.modemConfig2]!;
    const pa = r[SX1278_REG.paConfig]!;
    // With PA_BOOST: 2 dBm plus the output power setting, 3 dB more with the high-power DAC.
    const boost = 2 + (pa & 0x0f) + ((r[SX1278_REG.paDac]! & 0x07) === 0x07 ? 3 : 0);
    const rfo = 10.8 + 0.6 * ((pa >> 4) & 0x07) - (15 - (pa & 0x0f));
    return {
      frequencyHz: (frf * 32e6) / (1 << 19),
      spreadingFactor: Math.min(12, Math.max(6, config2 >> 4)),
      bandwidthHz: BANDWIDTHS[config1 >> 4] ?? 125e3,
      codingRate: Math.min(4, Math.max(1, (config1 >> 1) & 0x07)),
      implicitHeader: (config1 & 0x01) !== 0,
      crc: (config2 & 0x04) !== 0,
      preamble: (r[SX1278_REG.preambleMsb]! << 8) | r[SX1278_REG.preambleLsb]!,
      lowDataRateOptimize: (r[SX1278_REG.modemConfig3]! & 0x08) !== 0,
      syncWord: r[SX1278_REG.syncWord]!,
      txPowerDbm: pa & 0x80 ? boost : rfo,
    };
  }

  /** NSS went LOW: an exchange begins, its first byte the address. */
  select(): void {
    this.selected = true;
    this.address = null;
  }

  /** NSS went HIGH: the exchange is over. */
  deselect(): void {
    this.selected = false;
    this.address = null;
  }

  /**
   * Bytes clocked in on MOSI while NSS is LOW, at `timeMs`; returns the bytes
   * clocked out on MISO. The first byte of an exchange is an address, with its
   * top bit set for a write; each byte after it is read or written there, the
   * address moving on except at the FIFO.
   */
  exchange(bytes: Uint8Array, timeMs: number): Uint8Array {
    this.advance(timeMs);
    const out = new Uint8Array(bytes.length);
    bytes.forEach((byte, i) => {
      if (!this.selected) return;
      if (this.address === null) {
        this.address = byte & 0x7f;
        this.writing = (byte & 0x80) !== 0;
        out[i] = 0;
        return;
      }
      if (this.writing) this.write(this.address, byte, timeMs);
      else out[i] = this.read(this.address);
      if (this.address !== SX1278_REG.fifo) this.address = (this.address + 1) & 0x7f;
    });
    return out;
  }

  private read(address: number): number {
    if (address === SX1278_REG.fifo) {
      const pointer = this.regs[SX1278_REG.fifoAddrPtr]!;
      this.regs[SX1278_REG.fifoAddrPtr] = (pointer + 1) & 0xff;
      return this.fifo[pointer]!;
    }
    if (address === SX1278_REG.rssi) {
      // With nothing on the air, the receiver hears its own noise.
      const noise = noiseFloorDbm(this.settings().bandwidthHz);
      return Math.max(0, Math.min(255, Math.round(noise + RSSI_OFFSET_LF)));
    }
    return this.regs[address]!;
  }

  private write(address: number, value: number, timeMs: number): void {
    switch (address) {
      case SX1278_REG.fifo: {
        const pointer = this.regs[SX1278_REG.fifoAddrPtr]!;
        this.fifo[pointer] = value;
        this.regs[SX1278_REG.fifoAddrPtr] = (pointer + 1) & 0xff;
        return;
      }
      case SX1278_REG.irqFlags:
        // A flag is cleared by writing a 1 to it.
        this.regs[address] = this.regs[address]! & ~value;
        this.updateDio0(timeMs);
        return;
      case SX1278_REG.opMode:
        this.setMode(value, timeMs);
        return;
      case SX1278_REG.version:
      case SX1278_REG.rxNbBytes:
      case SX1278_REG.fifoRxCurrent:
      case SX1278_REG.pktRssi:
      case SX1278_REG.pktSnr:
      case SX1278_REG.rssi:
        return; // read only
      default:
        this.regs[address] = value;
        if (address === SX1278_REG.dioMapping1) this.updateDio0(timeMs);
    }
  }

  private setMode(value: number, timeMs: number): void {
    const before = this.regs[SX1278_REG.opMode]!;
    // LoRa or FSK can only be chosen while asleep.
    const loraBit = (before & 0x07) === LORA_MODE.sleep ? value & 0x80 : before & 0x80;
    this.regs[SX1278_REG.opMode] = (value & 0x7f) | loraBit;
    const mode = value & 0x07;
    if (mode !== LORA_MODE.rxContinuous && mode !== LORA_MODE.rxSingle) this.incoming = null;
    if (mode === LORA_MODE.tx && this.loraMode && !this.sending) {
      const settings = this.settings();
      const length = this.regs[SX1278_REG.payloadLength]!;
      const base = this.regs[SX1278_REG.fifoTxBase]!;
      const payload = Uint8Array.from({ length }, (_, i) => this.fifo[(base + i) & 0xff]!);
      const end = timeMs + timeOnAirMs(settings, length);
      this.sending = { end, length };
      this.transmit({ from: this.id, settings, payload, start: timeMs, end });
    }
  }

  /** A packet another radio started sending: heard if this radio is listening and tuned to it. */
  hear(packet: Packet, rssiDbm: number): void {
    if (!this.listening || this.sending) return;
    const own = this.settings();
    const theirs = packet.settings;
    const tuned =
      Math.abs(own.frequencyHz - theirs.frequencyHz) <= FREQUENCY_TOLERANCE * own.bandwidthHz &&
      own.spreadingFactor === theirs.spreadingFactor &&
      own.bandwidthHz === theirs.bandwidthHz &&
      own.syncWord === theirs.syncWord &&
      own.implicitHeader === theirs.implicitHeader;
    if (!tuned || rssiDbm < sensitivityDbm(own)) return;
    // Two packets at once: neither is understood.
    if (this.incoming && this.incoming.end > packet.start) {
      this.incoming = null;
      return;
    }
    this.incoming = { ...packet, payload: packet.payload };
    this.incomingRssi = rssiDbm;
  }

  private incomingRssi = 0;

  /** Brings the radio up to `timeMs`: a packet sent or one received ends in time. */
  advance(timeMs: number): void {
    if (this.sending && this.sending.end <= timeMs) {
      const { end } = this.sending;
      this.sending = null;
      this.sent++;
      this.regs[SX1278_REG.irqFlags] = this.regs[SX1278_REG.irqFlags]! | LORA_IRQ.txDone;
      this.regs[SX1278_REG.opMode] = (this.regs[SX1278_REG.opMode]! & 0xf8) | LORA_MODE.standby;
      this.updateDio0(end);
    }
    if (this.incoming && this.incoming.end <= timeMs) {
      const packet = this.incoming;
      this.incoming = null;
      this.deliver(packet);
    }
  }

  private deliver(packet: Packet): void {
    const base = this.regs[SX1278_REG.fifoRxBase]!;
    packet.payload.forEach((byte, i) => (this.fifo[(base + i) & 0xff] = byte));
    const r = this.regs;
    r[SX1278_REG.fifoRxCurrent] = base;
    r[SX1278_REG.rxNbBytes] = packet.payload.length;
    const snr = Math.min(10, this.incomingRssi - noiseFloorDbm(packet.settings.bandwidthHz));
    r[SX1278_REG.pktSnr] = Math.round(snr * 4) & 0xff;
    r[SX1278_REG.pktRssi] = Math.max(
      0,
      Math.min(255, Math.round(this.incomingRssi + RSSI_OFFSET_LF)),
    );
    r[SX1278_REG.irqFlags] = r[SX1278_REG.irqFlags]! | LORA_IRQ.rxDone | LORA_IRQ.validHeader;
    if (this.mode === LORA_MODE.rxSingle) {
      r[SX1278_REG.opMode] = (r[SX1278_REG.opMode]! & 0xf8) | LORA_MODE.standby;
    }
    this.received++;
    this.lastRssi = Math.round(this.incomingRssi);
    this.lastSnr = Math.round(snr * 4) / 4;
    this.updateDio0(packet.end);
  }

  /** When the packet this radio is sending or receiving ends, if there is one. */
  nextEvent(): number | null {
    const times = [this.sending?.end, this.incoming?.end].filter(
      (t): t is number => t !== undefined,
    );
    return times.length ? Math.min(...times) : null;
  }

  /** DIO0 follows the flag it is mapped to: RxDone (00) or TxDone (01). */
  private updateDio0(timeMs: number): void {
    const mapping = this.regs[SX1278_REG.dioMapping1]! >> 6;
    const flags = this.regs[SX1278_REG.irqFlags]!;
    const level =
      mapping === 0
        ? (flags & LORA_IRQ.rxDone) !== 0
        : mapping === 1 && (flags & LORA_IRQ.txDone) !== 0;
    if (level === this.lastDio0) return;
    this.lastDio0 = level;
    this.dio0({ timeMs, level });
  }

  status(): Omit<RadioStatus, 'distanceKm'> {
    const mode =
      this.sending !== null
        ? 'transmitting'
        : this.listening
          ? 'receiving'
          : this.loraMode && this.mode !== LORA_MODE.sleep
            ? 'standby'
            : 'sleep';
    return {
      mode,
      sent: this.sent,
      received: this.received,
      ...(this.lastRssi === undefined ? {} : { lastRssi: this.lastRssi, lastSnr: this.lastSnr }),
    };
  }
}
