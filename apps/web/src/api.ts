/**
 * True when this build of the application carries the ESP32 chip emulator. It
 * is built separately and may be left out.
 */
export async function hasChipEmulator(): Promise<boolean> {
  try {
    const response = await fetch('/esp32sim/SOURCE.txt');
    return response.ok && (await response.text()).startsWith('esp32sim.wasm');
  } catch {
    return false;
  }
}

/** Base URL of the API. Only compiling needs it; everything else works offline. */
const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export type CompileResult =
  | { ok: true; hex: string; flashBytes: number }
  | {
      ok: false;
      reason: 'compile-error' | 'timeout' | 'program-too-large';
      diagnostics: { line: number; severity: string; message: string }[];
    };

/**
 * Compiles an Arduino sketch on the server for a kind of board. `hex` in the
 * result is the built program as text. Rejects when the server cannot be reached.
 */
export async function compileSketch(
  source: string,
  board: 'uno' | 'esp32' = 'uno',
  /** ESP32 only: `emulator` asks for real firmware for the chip emulator. */
  engine?: 'library' | 'emulator',
): Promise<CompileResult> {
  const response = await fetch(`${API_URL}/v1/compile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ board, language: 'arduino', source, ...(engine ? { engine } : {}) }),
  });
  if (!response.ok) throw new Error(`compile request failed: ${response.status}`);
  return response.json();
}
