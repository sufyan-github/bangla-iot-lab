import { THERMAL_VOLTAGE } from './devices';
import type { Circuit } from './dc';
import type { Capacitor, Diode, Resistor, TheveninSource, VoltageSource } from './devices';

/**
 * Writes a circuit as a SPICE deck so the same netlist can be solved by ngspice
 * and compared with our solver. Only used by tests and the golden-file script.
 */
export function toSpiceDeck(
  title: string,
  circuit: Circuit,
  /** Transient analysis from the capacitors' stored voltages; omitted for a DC operating point. */
  transient?: { stepSeconds: number; stopSeconds: number },
): string {
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
    } else if (device.kind === 'capacitor') {
      const c = device as Capacitor;
      lines.push(`C${name} ${c.a} ${c.b} ${c.capacitance} IC=${c.storedVoltage}`);
    } else if (device.kind === 'thevenin-source') {
      // Written as an ideal source plus resistor; the internal node is named, not numbered.
      const t = device as TheveninSource;
      lines.push(`V${name} x${name} ${t.negative} DC ${t.volts}`);
      lines.push(`R${name} ${t.positive} x${name} ${t.resistance}`);
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
    transient ? `.tran ${transient.stepSeconds} ${transient.stopSeconds} uic` : '.op',
    '.end',
    '',
  ].join('\n');
}

/** Exposed so tests can state the temperature assumption shared with ngspice. */
export const SPICE_NOMINAL_THERMAL_VOLTAGE = THERMAL_VOLTAGE;
