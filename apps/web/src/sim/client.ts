import { wrap, type Remote } from 'comlink';
import type { SimulationApi } from './sim.worker';

let remote: Remote<SimulationApi> | undefined;

/** The simulation worker, started the first time a circuit is run. */
export function simulation(): Remote<SimulationApi> {
  remote ??= wrap<SimulationApi>(
    new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module', name: 'simulation' }),
  );
  return remote;
}
