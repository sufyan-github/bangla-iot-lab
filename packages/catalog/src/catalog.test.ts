import { describe, expect, it } from 'vitest';
import { CatalogIndex, diffCatalogs, importSnapshot, parseCsv, productIdFromUrl } from './index';

/**
 * Made-up data in the same shape as the store export. The real catalogue is not
 * in this repository; `pnpm catalog:verify` checks it where it is available.
 */
const SHOP = 'https://shop.example';
const INVENTORY = [
  'Group,Category,Product,Price (BDT),Stock,Used in projects,URL',
  `Sensors,Distance,Example Ultrasonic Sensor,140,In-Stock,"S1, S2",${SHOP}/sensors/101-example-ultrasonic.html`,
  `Sensors,Distance,"Waterproof Sensor, 5 m cable",615,In Stock,C1,${SHOP}/sensors/102-waterproof.html`,
  `Boards,Development Board,Example 30-pin Board,480,Last items in stock,S1,${SHOP}/boards/103-example-board.html`,
  `Components,Capacitor,XY100 Transistor,14,Out of Stock,,${SHOP}/components/104-xy100-transistor.html`,
  `Components,Connector,100K Potentiometer,20,in-stock,,${SHOP}/components/105-100k-potentiometer.html`,
  `Components,Components,32 MHz Crystal,11,In-Stock,,${SHOP}/components/106-crystal.html`,
  `Components,Components,32 MHz Crystal,15,In-Stock,,${SHOP}/components/107-crystal.html`,
  `Components,Resistor,220 Ohm Resistor - Pack of 10,,In-Stock,,${SHOP}/components/108-220-ohm.html`,
  `Components,Analog ICs,AB3130,70,Sold-out,,${SHOP}/components/109-ab3031-chip.html`,
  `Components,LED,Example LED,5,Maybe,,${SHOP}/components/110-example-led.html`,
].join('\r\n');
const PROJECTS = [
  'Project ID,Project,Track,Difficulty,Score /30,Shortlist,Component,RoboticsBD product,Qty,Unit BDT,Line BDT,Price source,Optional,URL',
  `S1,School kit,Education,Beginner,30,yes,Board,Example 30-pin Board,1,480,480,verified,,${SHOP}/boards/103-example-board.html`,
  `S1,School kit,Education,Beginner,30,yes,Distance sensor,Example Ultrasonic Sensor,2,140,280,verified,,${SHOP}/sensors/101-example-ultrasonic.html`,
  'S1,School kit,Education,Beginner,30,yes,Storage box,,1,200,200,estimated,,',
  `S1,School kit,Education,Beginner,30,yes,Spare sensor,Example Ultrasonic Sensor,1,140,140,verified,yes,${SHOP}/sensors/101-example-ultrasonic.html`,
  `C1,Flood warning,Climate,Intermediate,28,,Waterproof sensor,Waterproof Sensor,1,615,600,verified,,${SHOP}/sensors/102-waterproof.html`,
  `C1,Flood warning,Climate,Intermediate,28,,Siren,Example Siren,1,690,690,verified,,${SHOP}/sound/999-siren.html`,
].join('\n');
const LAB = [
  'Tier,Item,Purpose / used by,Qty,Unit BDT,Total BDT,Price source,URL',
  `A - Bench,Example 30-pin Board,Default board,20,480,9600,verified,${SHOP}/boards/103-example-board.html`,
  'A - Bench,Consumables,Wire and solder,1,6000,6000,estimated,',
  `B - Kits,Example Ultrasonic Sensor,Kits,10,140,1400,verified,${SHOP}/sensors/101-example-ultrasonic.html`,
].join('\n');

const snapshot = importSnapshot(
  { inventory: INVENTORY, projects: PROJECTS, lab: LAB },
  '2026-11-13',
);
const issue = (code: string) => snapshot.issues.filter((entry) => entry.code === code);

describe('reading CSV', () => {
  it('handles quotes, commas and line breaks inside a field, and a byte-order mark', () => {
    const rows = parseCsv('﻿a,b\r\n"one, two","say ""hi"""\n"line\nbreak",x\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['one, two', 'say "hi"'],
      ['line\nbreak', 'x'],
    ]);
  });

  it('says which column is missing', () => {
    expect(() =>
      importSnapshot({ inventory: 'Product\nX', projects: PROJECTS, lab: LAB }, '2026-11-13'),
    ).toThrow(/Missing column\(s\): Group, Category/);
  });

  it('insists on a dated snapshot', () => {
    expect(() =>
      importSnapshot({ inventory: INVENTORY, projects: PROJECTS, lab: LAB }, 'November'),
    ).toThrow(/yyyy-mm-dd/);
  });
});

describe('importing products', () => {
  it('keeps every row and its original text', () => {
    expect(snapshot.products).toHaveLength(10);
    const sensor = snapshot.products[1]!;
    expect(sensor).toMatchObject({
      id: 'rbd-102',
      name: 'Waterproof Sensor, 5 m cable',
      priceBdt: 615,
      stock: 'in-stock',
      usedInProjects: ['C1'],
    });
    // The source row is preserved exactly, odd spelling included.
    expect(sensor.raw.Stock).toBe('In Stock');
    expect(snapshot.products[0]!.usedInProjects).toEqual(['S1', 'S2']);
  });

  it('takes the id from the store product number in the link', () => {
    expect(productIdFromUrl(`${SHOP}/sensors/396-some-name.html`)).toBe('rbd-396');
    expect(productIdFromUrl(`${SHOP}/sensors/`)).toBeNull();
    // A variant picked in the link does not change which product it is.
    expect(productIdFromUrl(`${SHOP}/printer/3054-340-filament.html#/121-colour-white`)).toBe(
      'rbd-3054',
    );
  });

  it('reads every spelling of stock, and reports the unusual ones once each', () => {
    expect(snapshot.products.map((product) => product.stock)).toEqual([
      'in-stock',
      'in-stock',
      'low-stock',
      'out-of-stock',
      'in-stock',
      'in-stock',
      'in-stock',
      'in-stock',
      'out-of-stock',
      'unknown',
    ]);
    expect(
      issue('stock-spelling')
        .map((entry) => entry.message)
        .sort(),
    ).toEqual([
      'Stock is written "In Stock" instead of "In-Stock".',
      'Stock is written "Sold-out" instead of "Out of Stock".',
      'Stock is written "in-stock" instead of "In-Stock".',
    ]);
    expect(issue('stock-unknown')[0]).toMatchObject({ count: 1, severity: 'warning' });
  });

  it('reports missing prices, duplicate names, misfiled parts and a link that names another part', () => {
    expect(snapshot.products[7]!.priceBdt).toBeNull();
    expect(issue('missing-price')[0]!.examples).toEqual(['rbd-108: 220 Ohm Resistor - Pack of 10']);
    expect(issue('duplicate-name')[0]!.examples[0]).toContain('rbd-106, rbd-107');
    expect(issue('duplicate-name')[0]!.examples[0]).toContain('৳11 and 15');
    expect(
      issue('misfiled-category')
        .map((entry) => entry.message)
        .sort(),
    ).toEqual([
      'Looks like a potentiometer but is filed under "Connector".',
      'Looks like a transistor but is filed under "Capacitor".',
    ]);
    expect(issue('link-name-mismatch')[0]!.examples).toEqual(['rbd-109: AB3130']);
  });
});

describe('importing projects and the lab budget', () => {
  it('computes each project total from its lines, keeping optional parts apart', () => {
    const kit = snapshot.projects.find((project) => project.id === 'S1')!;
    expect(kit).toMatchObject({ name: 'School kit', score: 30, shortlisted: true });
    expect(kit.lines).toHaveLength(4);
    expect(kit.requiredBdt).toBe(480 + 280 + 200);
    expect(kit.optionalBdt).toBe(140);
    expect(kit.lines.map((line) => line.priceSource)).toEqual([
      'verified',
      'verified',
      'estimated',
      'verified',
    ]);
  });

  it('links a line to the catalogue product it buys', () => {
    const kit = snapshot.projects.find((project) => project.id === 'S1')!;
    expect(kit.lines.map((line) => line.productId)).toEqual([
      'rbd-103',
      'rbd-101',
      null,
      'rbd-101',
    ]);
    // A verified price whose product is not in the catalogue is worth a look.
    expect(issue('not-in-catalogue')[0]!.examples[0]).toContain('C1 Siren');
  });

  it('catches a line total that does not match, and does not let it into the project total', () => {
    expect(issue('line-total-mismatch')[0]!.examples[0]).toContain('C1 Waterproof sensor');
    expect(snapshot.projects.find((project) => project.id === 'C1')!.requiredBdt).toBe(615 + 690);
  });

  it('totals the lab budget by tier', () => {
    expect(snapshot.lab.totalBdt).toBe(9600 + 6000 + 1400);
    expect(snapshot.lab.tiers).toEqual([
      { tier: 'A - Bench', lines: 2, totalBdt: 15600 },
      { tier: 'B - Kits', lines: 1, totalBdt: 1400 },
    ]);
  });

  it('lists the most serious issues first', () => {
    const ranks = snapshot.issues.map((entry) =>
      ['error', 'warning', 'info'].indexOf(entry.severity),
    );
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe('finding products', () => {
  const index = new CatalogIndex(snapshot.products);

  it('matches every word of the query against the start of a word in the name', () => {
    expect(index.search({ text: 'ultra sens' }).items.map((p) => p.id)).toEqual(['rbd-101']);
    expect(index.search({ text: 'sensor' }).total).toBe(2);
    expect(index.search({ text: 'sensor nothing' }).total).toBe(0);
    expect(index.search({ text: '32 mhz' }).total).toBe(2);
  });

  it('filters by group, category and availability, and pages the result', () => {
    expect(index.search({ group: 'Components' }).total).toBe(7);
    expect(index.search({ group: 'Components', availableOnly: true }).total).toBe(4);
    expect(index.search({ category: 'Distance' }).total).toBe(2);
    const page = index.search({ limit: 3, offset: 3 });
    expect(page.total).toBe(10);
    expect(page.items).toHaveLength(3);
    expect(index.get('rbd-103')!.name).toBe('Example 30-pin Board');
  });

  it('lists the groups and their categories with counts', () => {
    expect(index.groups.map((group) => group.group)).toEqual(['Boards', 'Components', 'Sensors']);
    expect(index.groups[2]!.categories).toEqual([{ category: 'Distance', count: 2 }]);
  });
});

describe('comparing two snapshots', () => {
  it('reports additions, removals and changes by product number', () => {
    const later = snapshot.products
      .filter((product) => product.id !== 'rbd-110')
      .map((product) =>
        product.id === 'rbd-101'
          ? { ...product, priceBdt: 150, stock: 'out-of-stock' as const }
          : product.id === 'rbd-103'
            ? { ...product, name: 'Example 30-pin Board v2' }
            : product,
      )
      .concat([{ ...snapshot.products[0]!, id: 'rbd-200', name: 'New Part' }]);
    const diff = diffCatalogs(snapshot.products, later);
    expect(diff.added.map((product) => product.id)).toEqual(['rbd-200']);
    expect(diff.removed.map((product) => product.id)).toEqual(['rbd-110']);
    expect(diff.priceChanged).toEqual([
      { id: 'rbd-101', name: 'Example Ultrasonic Sensor', from: 140, to: 150 },
    ]);
    expect(diff.stockChanged).toEqual([
      { id: 'rbd-101', name: 'Example Ultrasonic Sensor', from: 'in-stock', to: 'out-of-stock' },
    ]);
    expect(diff.renamed).toEqual([
      { id: 'rbd-103', from: 'Example 30-pin Board', to: 'Example 30-pin Board v2' },
    ]);
  });
});
