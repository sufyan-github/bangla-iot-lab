import { netName, type SimulationResult } from '@banglalab/simulation';
import type { MeterProbes } from './store';

/** Volts above ground at a hole, terminal or socket; undefined when nothing is connected there. */
export function voltageAt(result: SimulationResult, endpoint: string): number | undefined {
  return result.nodeVoltages[netName(endpoint)];
}

export type MeterReading =
  /** The circuit is switched off: there is nothing to measure yet. */
  | { state: 'off' }
  /** A probe is on a point that is joined to nothing. */
  | { state: 'open' }
  | { state: 'ok'; volts: number };

/**
 * What the multimeter shows: the red probe's voltage above the black probe's.
 * With only the red probe placed, the black one counts as resting on ground.
 */
export function meterReading(
  result: SimulationResult | null,
  meter: MeterProbes,
): MeterReading | null {
  if (meter.red === null) return null;
  if (!result) return { state: 'off' };
  const red = voltageAt(result, meter.red);
  const black = meter.black === null ? 0 : voltageAt(result, meter.black);
  if (red === undefined || black === undefined) return { state: 'open' };
  return { state: 'ok', volts: red - black };
}
