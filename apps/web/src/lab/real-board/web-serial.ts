import type { BootloaderPort } from './stk500';

/**
 * The browser's own serial ports (Web Serial), as the uploader needs them
 * (D-117). VERIFIED from Chrome's and MDN's documentation: desktop Chrome and
 * Edge from version 89, Firefox from 151; not Safari; HTTPS pages only. On
 * Android, Chrome lists wired ports only on phones set up to offer them, so
 * an empty choice is expected there.
 */

interface SerialSignals {
  dataTerminalReady?: boolean;
  requestToSend?: boolean;
}
export interface WebSerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  setSignals(signals: SerialSignals): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
}
interface WebSerial {
  requestPort(): Promise<WebSerialPort>;
}

/** The browser's serial ports, if it has them. */
export function webSerial(): WebSerial | null {
  const serial = (navigator as Navigator & { serial?: WebSerial }).serial;
  return serial && window.isSecureContext ? serial : null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Opens a port the student chose and wraps it for the uploader; `close` gives it back. */
export async function openBootloaderPort(
  port: WebSerialPort,
  baudRate: number,
): Promise<BootloaderPort & { close(): Promise<void> }> {
  await port.open({ baudRate });
  const reader = port.readable!.getReader();
  const writer = port.writable!.getWriter();
  let buffer: number[] = [];
  let pending: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;
  let closed = false;

  /** Waits up to `ms` for more bytes, adding them to the buffer. False if none came. */
  const more = async (ms: number): Promise<boolean> => {
    pending ??= reader.read();
    const timer = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms));
    const result = await Promise.race([pending, timer]);
    if (result === 'timeout') return false;
    pending = null;
    if (result.done) {
      closed = true;
      return false;
    }
    buffer.push(...result.value);
    return true;
  };

  return {
    async write(bytes) {
      await writer.write(bytes);
    },
    async read(count, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (buffer.length < count && !closed) {
        const left = deadline - Date.now();
        if (left <= 0 || !(await more(left))) break;
      }
      if (buffer.length < count) return null;
      const out = Uint8Array.from(buffer.slice(0, count));
      buffer = buffer.slice(count);
      return out;
    },
    async drain() {
      while (await more(20));
      buffer = [];
    },
    async reset() {
      // As avrdude opens an Arduino: lines released for 250 ms, a short pulse, released again,
      // then 100 ms for the bootloader to start. Which way round a USB chip drives the
      // board's reset from these is not yet checked on a real board.
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await sleep(250);
      await port.setSignals({ dataTerminalReady: true, requestToSend: true });
      await sleep(1);
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await sleep(100);
    },
    async close() {
      try {
        await reader.cancel();
      } catch {
        // Already gone: the board was unplugged.
      }
      reader.releaseLock();
      writer.releaseLock();
      await port.close().catch(() => {});
    },
  };
}
