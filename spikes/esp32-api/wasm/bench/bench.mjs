// Runs every sketch in the manifest and reports what it cost. Used by the
// page on its own thread or inside a worker; the code is the same either way.
import { runModule } from './world.mjs';

export async function runAll(onRow) {
  const manifest = await (await fetch('manifest.json')).json();
  const rows = [];
  for (const sketch of manifest.sketches) {
    const bytes = await (await fetch(sketch.file)).arrayBuffer();
    // First the scenario, to prove this browser gives the result the build machine got.
    const checked = runModule(bytes, sketch.scenario);
    const same = checked.ok && checked.trace === sketch.trace && checked.serial === sketch.serial;
    // Then a long plain run, three times, keeping the best: the speed figure.
    const runs = [];
    for (let i = 0; i < 3; i++)
      runs.push(runModule(bytes, { runMs: manifest.boardMs, script: [] }));
    const best = runs.reduce((a, b) => (b.realMs < a.realMs ? b : a));
    const row = {
      name: sketch.name,
      bytes: bytes.byteLength,
      same,
      compileMs: best.compileMs,
      realMs: best.realMs,
      boardMs: manifest.boardMs,
      timesRealTime: manifest.boardMs / Math.max(best.realMs, 0.01),
      hostCalls: best.hostCalls,
    };
    rows.push(row);
    onRow(row);
  }
  return rows;
}

// Inside a worker: run at once and post each row back.
const scope = globalThis;
if (typeof scope.document === 'undefined' && typeof scope.postMessage === 'function') {
  runAll((row) => scope.postMessage({ row })).then(
    (rows) => scope.postMessage({ done: rows }),
    (error) => scope.postMessage({ error: String(error) }),
  );
}
