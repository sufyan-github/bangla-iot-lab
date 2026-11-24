import { describe, expect, it } from 'vitest';
import {
  NO_DECISIONS,
  candidateParts,
  decide,
  decisionProblems,
  hasKeyword,
  linkProducts,
  productsByPart,
  projectCoverage,
} from './links';
import type { CatalogProduct, CatalogProject } from './types';

/** Made-up products; the part keywords are the real, generic ones from packages/parts. */
const product = (id: string, name: string): CatalogProduct => ({
  id,
  group: 'Example',
  category: 'Example',
  name,
  priceBdt: 100,
  stock: 'in-stock',
  usedInProjects: [],
  url: `https://shop.example/${id}`,
  raw: {},
});
const PRODUCTS = [
  product('p-1', 'HC-SR04 Ultrasonic Distance Sensor Module'),
  product('p-2', 'Waterproof Ultrasonic Sensor JSN-SR04T'),
  product('p-3', '0.96" OLED Display I2C White'),
  product('p-4', 'Example Soldering Iron 60 W'),
  product('p-5', '5mm Red LED (Pack of 10)'),
  product('p-6', 'Carbon Film Resistors 1/4W Assorted'),
  product('p-7', 'PIR Motion Sensor HC-SR501'),
];

describe('finding a keyword in a product name', () => {
  it('takes whole words only, and plurals', () => {
    expect(hasKeyword('Carbon Film Resistors', 'resistor')).toBe(true);
    expect(hasKeyword('Glass Fuses', 'fuse')).toBe(true);
    expect(hasKeyword('Example Spirit Level', 'pir')).toBe(false);
    expect(hasKeyword('Mini PIR sensor', 'pir')).toBe(true);
    expect(hasKeyword('Breadboard 830 points', 'breadboard 830')).toBe(true);
    expect(hasKeyword('Breadboard 8300', 'breadboard 830')).toBe(false);
  });

  it('takes the words of a longer keyword in any order', () => {
    expect(hasKeyword('5mm Red LED', '5mm led')).toBe(true);
    expect(hasKeyword('LED Strip 5 m', '5mm led')).toBe(false);
    expect(hasKeyword('1/4 60 Ring w/ Drivers', '1/4 w')).toBe(false);
  });

  it('finds part numbers with a maker’s letters before them and a package’s after', () => {
    expect(hasKeyword('SN74HC00N Quad NAND', '74hc00')).toBe(true);
    expect(hasKeyword('74HC000 something', '74hc00')).toBe(false);
    expect(hasKeyword('LCD1602A display', '1602')).toBe(true);
    expect(hasKeyword('Module 216025', '1602')).toBe(false);
    expect(hasKeyword('5V Solar Panel', 'solar panel 5 v')).toBe(false);
  });

  it('matches keywords that end in punctuation, such as an inch mark', () => {
    expect(hasKeyword('0.96" OLED Display', '0.96" oled')).toBe(true);
    expect(hasKeyword('1.54" IPS display', '1.54" ips')).toBe(true);
  });
});

describe('suggesting a part for each product', () => {
  it('prefers the longest keyword, and lists every part that matched', () => {
    // "waterproof ultrasonic" and "jsn-sr04t" point to the JSN-SR04T; nothing else matches.
    expect(candidateParts('Waterproof Ultrasonic Sensor JSN-SR04T')).toEqual(['jsn-sr04t']);
    expect(candidateParts('PIR Motion Sensor HC-SR501')).toEqual(['pir-hc-sr501']);
    expect(candidateParts('Example Soldering Iron 60 W')).toEqual([]);
  });

  it('links each product, and a person’s decision wins over the suggestion', () => {
    let decisions = decide(NO_DECISIONS, 'p-5', { part: null }, new Date('2026-11-25T00:00:00Z'));
    decisions = decide(decisions, 'p-1', { part: 'hc-sr04' });
    const links = linkProducts(PRODUCTS, decisions);
    expect(links.get('p-1')).toMatchObject({
      suggested: 'hc-sr04',
      part: 'hc-sr04',
      state: 'confirmed',
    });
    expect(links.get('p-3')).toMatchObject({ part: 'oled-ssd1306-096', state: 'suggested' });
    expect(links.get('p-4')).toMatchObject({ part: null, state: 'none' });
    expect(links.get('p-5')).toMatchObject({ suggested: 'led-5mm', part: null, state: 'rejected' });
    expect(decisions.decisions['p-5']!.decidedAt).toBe('2026-11-25T00:00:00.000Z');
  });

  it('can move a product to another part, and forget a decision', () => {
    let decisions = decide(NO_DECISIONS, 'p-2', { part: 'hc-sr04' });
    expect(linkProducts(PRODUCTS, decisions).get('p-2')).toMatchObject({
      suggested: 'jsn-sr04t',
      part: 'hc-sr04',
      state: 'confirmed',
    });
    decisions = decide(decisions, 'p-2', null);
    expect(linkProducts(PRODUCTS, decisions).get('p-2')!.state).toBe('suggested');
  });

  it('refuses a part or variant that does not exist', () => {
    expect(() => decide(NO_DECISIONS, 'p-1', { part: 'no-such-part' })).toThrow(/No part/);
    expect(() => decide(NO_DECISIONS, 'p-1', { part: 'hc-sr04', variant: 'nope' })).toThrow(
      /no variant/,
    );
    expect(() => decide(NO_DECISIONS, 'p-1', { part: null, variant: 'hc-sr04' })).toThrow(
      /variant needs a part/,
    );
    expect(
      decide(NO_DECISIONS, 'p-1', { part: 'hc-sr04', variant: 'hc-sr04' }).decisions['p-1'],
    ).toMatchObject({ part: 'hc-sr04', variant: 'hc-sr04' });
  });

  it('reports decisions that no longer fit the snapshot or the parts master', () => {
    const decisions = {
      formatVersion: 1 as const,
      decisions: {
        'p-1': { part: 'hc-sr04', decidedAt: '' },
        'gone-1': { part: null, decidedAt: '' },
        'p-3': { part: 'renamed-part', decidedAt: '' },
      },
    };
    expect(decisionProblems(PRODUCTS, decisions)).toEqual([
      'gone-1: not in this snapshot',
      'p-3: no part "renamed-part"',
    ]);
  });
});

describe('the parts master against the catalogue', () => {
  it('lists every part, with its confirmed and suggested products, and parts with none', () => {
    const decisions = decide(NO_DECISIONS, 'p-1', { part: 'hc-sr04' });
    const byPart = productsByPart(linkProducts(PRODUCTS, decisions));
    const find = (id: string) => byPart.find((entry) => entry.part === id)!;
    expect(find('hc-sr04')).toMatchObject({ confirmed: ['p-1'], suggested: [] });
    expect(find('resistor')).toMatchObject({ confirmed: [], suggested: ['p-6'] });
    // A part the catalogue does not sell is still listed.
    expect(find('74hc00')).toMatchObject({ confirmed: [], suggested: [] });
  });

  it('works out a project’s coverage through the links first, then the words', () => {
    const line = (component: string, productId: string | null, optional = false) => ({
      component,
      storeProduct: '',
      quantity: 1,
      unitBdt: 1,
      lineBdt: 1,
      priceSource: 'verified' as const,
      optional,
      url: '',
      productId,
      raw: {},
    });
    const project: CatalogProject = {
      id: 'X1',
      name: 'Example',
      track: '',
      difficulty: '',
      score: 0,
      shortlisted: false,
      requiredBdt: 0,
      optionalBdt: 0,
      lines: [
        line('Distance sensor', 'p-2'),
        line('Potentiometer 10k', null),
        line('Mystery gadget', 'p-4'),
        line('Spare sensor', 'p-1', true),
      ],
    };
    const decisions = decide(NO_DECISIONS, 'p-2', { part: 'hc-sr04' });
    expect(projectCoverage(project, linkProducts(PRODUCTS, decisions))).toEqual([
      {
        component: 'Distance sensor',
        productId: 'p-2',
        part: 'hc-sr04',
        via: 'link',
        status: 'simulated',
      },
      {
        component: 'Potentiometer 10k',
        productId: null,
        part: 'potentiometer',
        via: 'text',
        status: 'simulated',
      },
      { component: 'Mystery gadget', productId: 'p-4', part: null, via: null, status: 'undefined' },
    ]);
  });
});
