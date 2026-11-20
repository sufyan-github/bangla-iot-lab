import { wrap, type Remote } from 'comlink';
import type { LabWorkerApi } from './lab.worker';

let remote: Remote<LabWorkerApi> | undefined;

/** The simulation worker, started the first time a circuit is run. */
export function simulation(): Remote<LabWorkerApi> {
  remote ??= wrap<LabWorkerApi>(
    new Worker(new URL('./lab.worker.ts', import.meta.url), { type: 'module', name: 'simulation' }),
  );
  return remote;
}
