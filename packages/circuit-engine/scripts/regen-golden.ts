/**
 * Regenerates golden/*.json by solving every golden case with ngspice
 * (the WebAssembly build shipped in `eecircuit-engine`, so no system install is needed).
 * Run with `pnpm golden:regen` and review the diff before committing.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { Simulation } from 'eecircuit-engine';
import { GOLDEN_CASES } from '../src/golden-cases';
import { toSpiceDeck } from '../src/spice';

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
    if (match[1] === 'v') voltages[match[2]] = value;
    // ngspice names the source "v<id>" in lower case; strip the leading v.
    else sourceCurrents[match[2].slice(1).toUpperCase()] = value;
  }
  const engine = /Command: (ngspice-[\d.]+)/.exec(result.header)?.[1] ?? 'ngspice';
  const golden = { name: goldenCase.name, engine, deck, voltages, sourceCurrents };
  await writeFile(new URL(`${goldenCase.name}.json`, outDir), JSON.stringify(golden, null, 2) + '\n');
  console.log(`${goldenCase.name}: ${Object.keys(voltages).length} node voltages (${engine})`);
}
process.exit(0);
