import { THERMAL_VOLTAGE } from './devices';
import type { Circuit } from './dc';
import type { Diode, Resistor, VoltageSource } from './devices';

/**
 * Writes a circuit as a SPICE deck so the same netlist can be solved by ngspice
 * and compared with our solver. Only used by tests and the golden-file script.
 */
export function toSpiceDeck(title: string, circuit: Circuit): string {
  const lines = [`* ${title}`];
  const models: string[] = [];
  const sanitize = (id: string) => id.replace(/[^A-Za-z0-9_]/g, '_');

  for (const device of circuit.devices) {
    const name = sanitize(device.id);
    if (device.kind === 'resistor') {
      const r = device as Resistor;
      lines.push(`R${name} ${r.a} ${r.b} ${r.resistance}`);
    } else if (device.kind === 'voltage-source') {
      const v = device as VoltageSource;
      lines.push(`V${name} ${v.positive} ${v.negative} DC ${v.volts}`);
    } else {
      const d = device as Diode;
      lines.push(`D${name} ${d.anode} ${d.cathode} M${name}`);
      models.push(
        `.model M${name} D(IS=${d.model.saturationCurrent} N=${d.model.emissionCoefficient})`,
      );
    }
  }
  return [
    ...lines,
    ...models,
    '.options gmin=1e-12 reltol=1e-7 abstol=1e-14 vntol=1e-9',
    '.op',
    '.end',
    '',
  ].join('\n');
}

/** Exposed so tests can state the temperature assumption shared with ngspice. */
export const SPICE_NOMINAL_THERMAL_VOLTAGE = THERMAL_VOLTAGE;
