import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PART_DEFINITIONS, coverage, definitionProblems, matchPart, partDefinition } from './index';

describe('part definitions', () => {
  it('loads every file in definitions/, and each one is valid', () => {
    const files = readdirSync(path.resolve(import.meta.dirname, '../definitions'))
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace(/\.json$/, ''))
      .sort();
    // A file that is not registered would silently not exist for the application.
    expect(PART_DEFINITIONS.map((definition) => definition.id)).toEqual(files);
    for (const definition of PART_DEFINITIONS) {
      expect(definitionProblems(definition), definition.id).toEqual([]);
    }
  });

  it('claims no hardware validation, because no bench record exists yet', () => {
    expect(
      PART_DEFINITIONS.filter((definition) => definition.validation.state === 'validated'),
    ).toEqual([]);
  });

  it('says what every model leaves out, and why every other part is not fully modelled', () => {
    for (const definition of PART_DEFINITIONS) {
      if (definition.status === 'simulated') {
        expect(definition.model.simplified.length, definition.id).toBeGreaterThan(0);
      } else {
        expect(definition.statusNote, definition.id).toBeTruthy();
      }
    }
  });

  it('refuses a definition that overstates itself', () => {
    const real = partDefinition('hc-sr04');
    expect(definitionProblems({ ...real, validation: { state: 'validated', tests: [] } })).toEqual([
      '"validated" needs the bench record that proves it',
    ]);
    expect(definitionProblems({ ...real, status: 'generic', statusNote: undefined })).toContain(
      'a part that is not fully simulated must say what is missing in statusNote',
    );
    // Every part now has a model, so a planned one is made up from a real one.
    expect(
      definitionProblems({
        ...real,
        status: 'planned',
        statusNote: 'Not built yet.',
        simulates: null,
        model: { level: 'timing', simplified: [] },
      }),
    ).toContain('a planned part has no model yet, so model.level must be "none"');
    expect(definitionProblems({ ...real, model: { ...real.model, simplified: [] } })).toContain(
      'every model leaves something out: list it in model.simplified',
    );
    expect(definitionProblems({ ...real, id: 'Not An Id' }).length).toBeGreaterThan(0);
  });

  it('has the default board of the plan on the list, honestly marked as an experiment', () => {
    const board = partDefinition('esp32-devkit-30pin');
    expect(board).toMatchObject({ status: 'simulated', simulates: 'esp32', tier: 1 });
    // It runs on the lab's own model of the board and has not been checked on one.
    expect(board.statusNote).toMatch(/^Experimental/);
    expect(board.model.simplified.length).toBeGreaterThanOrEqual(4);
    expect(board.validation.state).toBe('not-checked');
    expect(() => partDefinition('no-such-part')).toThrow(/No part definition/);
  });
});

describe('recognising parts in a parts list', () => {
  it('finds the part a line means, preferring the more specific name', () => {
    expect(matchPart('HC-SR04 ultrasonic')?.id).toBe('hc-sr04');
    expect(matchPart('Waterproof ultrasonic distance sensor (JSN-SR04T type)')?.id).toBe(
      'jsn-sr04t',
    );
    expect(matchPart('1-ch relay module (optocoupled)')?.id).toBe('relay-module-1ch');
    expect(matchPart('ESP32 dev board (node)')?.id).toBe('esp32-devkit-30pin');
    expect(matchPart('1/4 W resistors 220 Ω, 330 Ω')?.id).toBe('resistor');
    expect(matchPart('Something nobody has defined')).toBeNull();
  });

  it('reports how much of a parts list can be built', () => {
    const report = coverage([
      'HC-SR04 ultrasonic',
      'SG90 micro servo 180°',
      'SX1278 Ra-02 LoRa module',
      'YL-69 soil moisture',
      'IR obstacle avoidance sensor',
      'USB cable',
      'Unobtainium sensor',
    ]);
    expect(report.counts).toEqual({
      simulated: 5,
      generic: 0,
      planned: 0,
      'not-simulated': 1,
      undefined: 1,
    });
    expect(report.ready).toBe(false);
    expect(coverage(['HC-SR04 ultrasonic', 'USB cable']).ready).toBe(true);
  });
});
