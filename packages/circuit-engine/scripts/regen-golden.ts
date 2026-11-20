/**
 * Regenerates golden/*.json by solving every golden case with ngspice
 * (the WebAssembly build shipped in `eecircuit-engine`, so no system install is needed).
 * Run with `pnpm golden:regen` and review the diff before committing.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { Simulation } from 'eecircuit-engine';
import { GOLDEN_CASES } from '../src/golden-cases';
import { toSpiceDeck } from '../src/spice';
import { TRANSIENT_CASES } from '../src/transient-cases';

const outDir = new URL('../golden/', import.meta.url);
await mkdir(outDir, { recursive: true });

const sim = new Simulation();
await sim.start();

for (const goldenCase of GOLDEN_CASES) {
  const deck = toSpiceDeck(goldenCase.name, goldenCase.build());
  sim.setNetList(deck);
  const result = await sim.runSim();
  if (result.dataType !== 'real') throw new Error(`${goldenCase.name}: expected real data`);

  const voltages: Record<string, number> = {};
  const sourceCurrents: Record<string, number> = {};
  for (const series of result.data) {
    const value = series.values[0];
    const match = /^(v|i)\((.+)\)$/.exec(series.name);
    if (!match || typeof value !== 'number') throw new Error(`Unexpected series ${series.name}`);
    if (match[1] === 'v') {
      // Named nodes are internal to a source model; only numbered nodes are compared.
      if (/^\d+$/.test(match[2])) voltages[match[2]] = value;
    }
    // ngspice names the source "v<id>" in lower case; strip the leading v.
    else sourceCurrents[match[2].slice(1).toUpperCase()] = value;
  }
  const engine = /Command: (ngspice-[\d.]+)/.exec(result.header)?.[1] ?? 'ngspice';
  const golden = { name: goldenCase.name, engine, deck, voltages, sourceCurrents };
  await writeFile(
    new URL(`${goldenCase.name}.json`, outDir),
    JSON.stringify(golden, null, 2) + '\n',
  );
  console.log(`${goldenCase.name}: ${Object.keys(voltages).length} node voltages (${engine})`);
}

/** Linear interpolation of ngspice's own time points onto the times we sample. */
function interpolate(times: number[], values: number[], at: number): number {
  let i = times.findIndex((t) => t >= at);
  if (i <= 0) i = i === 0 ? 1 : times.length - 1;
  const t0 = times[i - 1];
  const t1 = times[i];
  return values[i - 1] + ((values[i] - values[i - 1]) * (at - t0)) / (t1 - t0);
}

for (const transientCase of TRANSIENT_CASES) {
  // Ask ngspice for a finer step than ours so it serves as the more accurate reference.
  const deck = toSpiceDeck(transientCase.name, transientCase.build(), {
    stepSeconds: transientCase.stepSeconds / 5,
    stopSeconds: transientCase.stopSeconds,
  });
  sim.setNetList(deck);
  const result = await sim.runSim();
  if (result.dataType !== 'real') throw new Error(`${transientCase.name}: expected real data`);
  const times = result.data.find((series) => series.name === 'time')?.values as number[];
  const voltages: Record<string, number[]> = {};
  for (const series of result.data) {
    const match = /^v\((\d+)\)$/.exec(series.name);
    if (!match) continue;
    voltages[match[1]] = transientCase.sampleSeconds.map((at) =>
      interpolate(times, series.values as number[], at),
    );
  }
  const engine = /Command: (ngspice-[\d.]+)/.exec(result.header)?.[1] ?? 'ngspice';
  const golden = {
    name: transientCase.name,
    engine,
    deck,
    sampleSeconds: transientCase.sampleSeconds,
    voltages,
  };
  await writeFile(
    new URL(`transient-${transientCase.name}.json`, outDir),
    JSON.stringify(golden, null, 2) + '\n',
  );
  console.log(`${transientCase.name}: ${times.length} ngspice time points (${engine})`);
}
process.exit(0);
