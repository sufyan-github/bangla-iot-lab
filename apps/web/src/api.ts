/** Base URL of the API. Only compiling needs it; everything else works offline. */
const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export type CompileResult =
  | { ok: true; hex: string; flashBytes: number }
  | {
      ok: false;
      reason: 'compile-error' | 'timeout' | 'program-too-large';
      diagnostics: { line: number; severity: string; message: string }[];
    };

/** Compiles an Arduino sketch for the UNO on the server. Rejects when the server cannot be reached. */
export async function compileSketch(source: string): Promise<CompileResult> {
  const response = await fetch(`${API_URL}/v1/compile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ board: 'uno', language: 'arduino', source }),
  });
  if (!response.ok) throw new Error(`compile request failed: ${response.status}`);
  return response.json();
}
