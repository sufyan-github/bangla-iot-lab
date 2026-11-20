import { simulate } from '@banglalab/simulation';
import { expose } from 'comlink';

/** Runs circuit simulation off the main thread so the editor never stutters. */
const api = { simulate };
export type SimulationApi = typeof api;
expose(api);
