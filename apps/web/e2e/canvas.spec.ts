import { expect, test, type Page } from '@playwright/test';
import { pick } from './pick';

/**
 * Working on the canvas by hand: pointing at holes, pulling wires out of them,
 * carrying parts and wire ends, and moving the battery and the board.
 */

interface Spot {
  x: number;
  y: number;
}

/**
 * Canvas coordinates of holes, terminals and sockets, read while the wire tool
 * shows its targets. They stay true however the page is scrolled or laid out.
 */
async function places(page: Page, endpoints: string[]): Promise<Record<string, Spot>> {
  await pick(page, 'wire');
  const found: Record<string, Spot> = {};
  for (const endpoint of endpoints) {
    const target = page.locator(`[data-endpoint="${endpoint}"]`);
    found[endpoint] = {
      x: Number(await target.getAttribute('cx')),
      y: Number(await target.getAttribute('cy')),
    };
  }
  await pick(page, 'select');
  return found;
}

/** Scrolls the canvas so these canvas points are on screen, and returns where they are there. */
function onScreen(page: Page, points: Spot[]): Promise<Spot[]> {
  return page.evaluate((canvasPoints) => {
    const frame = document.querySelector('[data-testid="canvas-frame"]')!;
    const svg = frame.querySelector('svg')!;
    const project = () =>
      canvasPoints.map((p) => {
        const q = new DOMPoint(p.x, p.y).matrixTransform(svg.getScreenCTM()!);
        return { x: q.x, y: q.y };
      });
    const before = project();
    const middle = (pick: (p: Spot) => number) =>
      before.reduce((sum, p) => sum + pick(p), 0) / before.length;
    const rect = frame.getBoundingClientRect();
    frame.scrollBy(
      middle((p) => p.x) - (rect.left + rect.width / 2),
      middle((p) => p.y) - (rect.top + rect.height / 2),
    );
    return project();
  }, points);
}

async function pointAt(page: Page, place: Spot) {
  const [spot] = await onScreen(page, [place]);
  await page.mouse.move(spot!.x, spot!.y);
}

/** Presses at one canvas point and lets go at another. */
async function drag(page: Page, from: Spot, to: Spot) {
  const [start, end] = await onScreen(page, [from, to]);
  await page.mouse.move(start!.x, start!.y);
  await page.mouse.down();
  await page.mouse.move((start!.x + end!.x) / 2, (start!.y + end!.y) / 2, { steps: 5 });
  await page.mouse.move(end!.x, end!.y, { steps: 5 });
  await page.mouse.up();
}

const wires = (page: Page) => page.locator('[data-wire]');
const hoverMark = (page: Page) => page.getByTestId('hover-mark');

async function openExample(page: Page, example: 'open-example' | 'open-example-uno') {
  await page.goto('/');
  await page.getByTestId(example).click();
  await expect(page).toHaveURL(/\/lab\//);
}

test('pointing at a hole names it and shows the holes joined to it', async ({ page }) => {
  await openExample(page, 'open-example');
  const at = await places(page, ['BB1.h20', 'BB1.d9', 'BB1.tp13', 'BAT1.pos']);

  await pointAt(page, at['BB1.h20']!);
  await expect(hoverMark(page)).toHaveAttribute('data-hover', 'BB1.h20');
  await expect(hoverMark(page).locator('text')).toHaveText('h20');
  // The five holes of column 20's lower strip are joined.
  await expect(hoverMark(page)).toHaveAttribute('data-joined', '5');

  // A hole holding a leg says whose leg it is.
  await pointAt(page, at['BB1.d9']!);
  await expect(hoverMark(page)).toHaveAttribute('data-hover', 'BB1.d9');
  await expect(hoverMark(page).locator('text')).toContainText('LED1 +');

  // A power rail is one long strip.
  await pointAt(page, at['BB1.tp13']!);
  await expect(hoverMark(page)).toHaveAttribute('data-joined', '25');

  await pointAt(page, at['BAT1.pos']!);
  await expect(hoverMark(page).locator('text')).toContainText('BAT1 +');
});

test('a wire can be dragged from one hole to another', async ({ page }) => {
  await openExample(page, 'open-example');
  const at = await places(page, ['BB1.h12', 'BB1.h20', 'BB1.f14', 'BB1.f22', 'BB1.f10', 'BB1.c9']);
  await expect(wires(page)).toHaveCount(4);

  // With the wire tool: press on one hole, let go on another.
  await pick(page, 'wire');
  const [from, to] = await onScreen(page, [at['BB1.h12']!, at['BB1.h20']!]);
  await page.mouse.move(from!.x, from!.y);
  await page.mouse.down();
  await page.mouse.move(to!.x - 30, to!.y + 10, { steps: 4 });
  await expect(page.getByTestId('wire-preview')).toBeVisible();
  await page.mouse.move(to!.x, to!.y, { steps: 3 });
  await page.mouse.up();
  await expect(wires(page)).toHaveCount(5);
  await expect(page.getByTestId('wire-preview')).toHaveCount(0);

  // With the select tool: dragging away from a free hole pulls a wire out of it.
  await pick(page, 'select');
  await drag(page, at['BB1.f14']!, at['BB1.f22']!);
  await expect(wires(page)).toHaveCount(6);
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');

  // Let go on a hole that is taken: no wire, and the reason is shown.
  await drag(page, at['BB1.f10']!, at['BB1.c9']!);
  await expect(wires(page)).toHaveCount(6);
  await expect(page.getByTestId('notice')).toBeVisible();
  await expect(page.getByTestId('wire-preview')).toHaveCount(0);
});

test('a wire picked up by its end moves to another hole', async ({ page }) => {
  await openExample(page, 'open-example');
  const led = page.locator('[data-part="LED1"]');
  await page.getByTestId('run').click();
  await expect(led).toHaveAttribute('data-led-state', 'on');

  // W3 joins the + rail (tp4) to the resistor's column. Carried to column 20 it feeds nothing.
  const at = await places(page, ['BB1.a5', 'BB1.a20']);
  await drag(page, at['BB1.a5']!, at['BB1.a20']!);
  await expect(led).toHaveAttribute('data-led-state', 'off');
  await drag(page, at['BB1.a20']!, at['BB1.a5']!);
  await expect(led).toHaveAttribute('data-led-state', 'on');
  await expect(wires(page)).toHaveCount(4);
});

test('a part tool shows where the part will go before it is placed', async ({ page }) => {
  await openExample(page, 'open-example');
  await pick(page, 'resistor');
  const free = page.locator('[data-endpoint="BB1.h15"]');
  await free.hover();
  await expect(page.getByTestId('ghost')).toHaveAttribute('data-ghost', 'resistor');
  await expect(page.locator('[data-part]')).toHaveCount(3);

  // Over a hole that is taken there is nothing to show, and the mark turns red.
  await page.locator('[data-endpoint="BB1.c5"]').hover();
  await expect(page.getByTestId('ghost')).toHaveCount(0);
  await expect(hoverMark(page)).toHaveAttribute('data-refused', 'true');

  await free.click();
  await expect(page.locator('[data-part]')).toHaveCount(4);
});

/** Where a part's touch area is, in canvas units, so scrolling does not affect the comparison. */
async function placeOf(page: Page, id: string): Promise<Spot> {
  const hit = page.locator(`[data-hit="${id}"]`);
  return { x: Number(await hit.getAttribute('x')), y: Number(await hit.getAttribute('y')) };
}

/** Drags a battery or board by a point inside its body, given as fractions of its size. */
async function dragPart(page: Page, id: string, hold: Spot, by: Spot) {
  const hit = page.locator(`[data-hit="${id}"]`);
  const corner = await placeOf(page, id);
  const grip = {
    x: corner.x + Number(await hit.getAttribute('width')) * hold.x,
    y: corner.y + Number(await hit.getAttribute('height')) * hold.y,
  };
  await drag(page, grip, { x: grip.x + by.x, y: grip.y + by.y });
}

test('the battery and the board can be moved, and their wires follow', async ({ page }) => {
  await openExample(page, 'open-example-uno');
  const socket = page.locator('[data-endpoint="UNO1.d13"]');
  const before = await placeOf(page, 'UNO1');
  await pick(page, 'wire');
  const socketBefore = Number(await socket.getAttribute('cx'));
  await pick(page, 'select');

  // Drag the board by its body, down and to the left.
  await dragPart(page, 'UNO1', { x: 0.5, y: 0.6 }, { x: -70, y: 40 });
  const after = await placeOf(page, 'UNO1');
  expect(after.x).toBeLessThan(before.x - 40);
  expect(after.y).toBeGreaterThan(before.y + 20);
  await pick(page, 'wire');
  expect(Number(await socket.getAttribute('cx')) - socketBefore).toBeCloseTo(after.x - before.x, 0);
  await pick(page, 'select');
  await expect(wires(page)).toHaveCount(9);

  // It cannot be dropped on the breadboard: it stops at the edge instead.
  await dragPart(page, 'UNO1', { x: 0.5, y: 0.6 }, { x: 0, y: -160 });
  const blocked = await placeOf(page, 'UNO1');
  expect(blocked.y).toBeLessThan(after.y);
  expect(blocked.y).toBeGreaterThan(28 + 19 * 24); // still below the breadboard's bottom edge

  // The program still drives the circuit from the board's new place.
  await page.getByTestId('run').click();
  await expect(page.locator('[data-part="LED1"]')).toHaveAttribute('data-led-state', 'on', {
    timeout: 10_000,
  });
  await page.getByTestId('run').click();

  // A battery moves the same way, and the position is saved with the circuit.
  await pick(page, 'battery');
  const batteryBefore = await placeOf(page, 'BAT1');
  await dragPart(page, 'BAT1', { x: 0.3, y: 0.5 }, { x: 8, y: 110 });
  const batteryAfter = await placeOf(page, 'BAT1');
  expect(batteryAfter.y).toBeGreaterThan(batteryBefore.y + 60);

  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
  await page.reload();
  await expect(page.locator('[data-hit="BAT1"]')).toBeVisible();
  expect(await placeOf(page, 'BAT1')).toEqual(batteryAfter);
  expect(await placeOf(page, 'UNO1')).toEqual(blocked);
});

test('a carried part follows the pointer and drops into the nearest holes', async ({ page }) => {
  await openExample(page, 'open-example');
  const part = page.locator('[data-part="R1"]');
  const hit = page.locator('[data-hit="R1"]');
  await hit.scrollIntoViewIfNeeded();
  const box = await hit.boundingBox();
  if (!box) throw new Error('resistor not on screen');
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  // A third of a hole: not enough to change holes, but the part already moves with the hand.
  await page.mouse.move(centre.x + 7, centre.y + 5, { steps: 3 });
  await expect(part).toHaveClass(/part-lifted/);
  const carried = await part.evaluate((el) => getComputedStyle(el).transform);
  expect(carried).not.toBe('none');
  await page.mouse.up();
  await expect(part).not.toHaveClass(/part-lifted/);

  // The quick actions under the canvas act on the selected part.
  await expect(page.getByTestId('quick-remove')).toBeVisible();
  await page.getByTestId('quick-remove').click();
  await expect(part).toHaveCount(0);
});

test('undo and redo step through edits, drags and removals', async ({ page }) => {
  await openExample(page, 'open-example-uno');
  const undo = page.getByTestId('undo');
  const redo = page.getByTestId('redo');
  const parts = page.locator('[data-part]');
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await expect(parts).toHaveCount(5);

  // Place a part, then take it back.
  await pick(page, 'resistor');
  await page.locator('[data-endpoint="BB1.h15"]').click();
  await expect(parts).toHaveCount(6);
  await undo.click();
  await expect(parts).toHaveCount(5);
  await redo.click();
  await expect(parts).toHaveCount(6);
  await undo.click();

  // A whole drag is one step: the board goes back to where it started.
  const before = await placeOf(page, 'UNO1');
  await dragPart(page, 'UNO1', { x: 0.5, y: 0.6 }, { x: -60, y: 50 });
  expect(await placeOf(page, 'UNO1')).not.toEqual(before);
  await undo.click();
  expect(await placeOf(page, 'UNO1')).toEqual(before);
  await expect(undo).toBeDisabled();

  // Removing the board takes its wires and program; the keyboard brings all of it back.
  await page.locator('[data-hit="UNO1"]').click({ position: { x: 200, y: 100 } });
  await page.getByTestId('quick-remove').click();
  await expect(parts).toHaveCount(4);
  await expect(wires(page)).toHaveCount(4);
  await page.keyboard.press('Control+z');
  await expect(parts).toHaveCount(5);
  await expect(wires(page)).toHaveCount(9);
  await page.getByTestId('run').click();
  await expect(page.locator('[data-part="LED1"]')).toHaveAttribute('data-led-state', 'on', {
    timeout: 10_000,
  });

  // Undo and redo also work while the circuit runs.
  await page.keyboard.press('Control+y');
  await expect(parts).toHaveCount(4);
  await page.keyboard.press('Control+Shift+z');
  await expect(parts).toHaveCount(4);
  await page.keyboard.press('Control+z');
  await expect(parts).toHaveCount(5);
});

test('a wire can be bent around parts and straightened again', async ({ page }) => {
  await openExample(page, 'open-example');
  // W3 runs from the + rail (tp4) to a5. Select it by a point away from its ends.
  const at = await places(page, ['BB1.tp4', 'BB1.a5']);
  const middle = {
    x: (at['BB1.tp4']!.x + at['BB1.a5']!.x) / 2,
    y: (at['BB1.tp4']!.y + at['BB1.a5']!.y) / 2 + 4,
  };
  const [spot] = await onScreen(page, [middle]);
  await page.mouse.click(spot!.x, spot!.y);
  await expect(page.getByTestId('quick-remove')).toBeVisible();
  const path = page.locator('[data-wire="W3"] path').first();
  const straight = await path.getAttribute('d');

  // Dragging the small dot in the middle makes a bend there.
  const centreOf = async (handle: string) => {
    const box = await page.locator(`[data-handle="${handle}"]`).boundingBox();
    if (!box) throw new Error(`${handle} is not on screen`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const pull = async (handle: string, dx: number, dy: number) => {
    const from = await centreOf(handle);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
    await page.mouse.up();
  };
  await pull('W3.add0', 60, 10);
  await expect(page.locator('[data-handle="W3.bend0"]')).toBeVisible();
  const bent = await path.getAttribute('d');
  expect(bent).not.toBe(straight);
  expect(bent).toContain('Q'); // a rounded corner

  // The bend is one undo step, and the wire still conducts either way.
  await page.getByTestId('run').click();
  await expect(page.locator('[data-part="LED1"]')).toHaveAttribute('data-led-state', 'on');
  await page.getByTestId('undo').click();
  await expect(page.locator('[data-handle="W3.bend0"]')).toHaveCount(0);
  await page.getByTestId('redo').click();
  await expect(page.locator('[data-handle="W3.bend0"]')).toBeVisible();

  // Dragged back onto the straight line, the bend disappears.
  await pull('W3.bend0', -60, -10);
  await expect(page.locator('[data-handle="W3.bend0"]')).toHaveCount(0);

  // The straighten button removes every bend at once.
  await pull('W3.add0', 50, 0);
  await expect(page.getByTestId('quick-straighten')).toBeVisible();
  await page.getByTestId('quick-straighten').click();
  await expect(page.locator('[data-handle="W3.bend0"]')).toHaveCount(0);
  expect(await path.getAttribute('d')).toBe(straight);
  await expect(page.locator('[data-part="LED1"]')).toHaveAttribute('data-led-state', 'on');
});

test('the multimeter probes read the voltage between two points', async ({ page }) => {
  await openExample(page, 'open-example');
  const reading = page.getByTestId('probe-reading');
  await pick(page, 'probe');

  // Red probe on the battery's +: nothing to read until the circuit is switched on.
  await page.locator('[data-endpoint="BAT1.pos"]').click();
  await expect(page.getByTestId('probe-red')).toHaveAttribute('data-probe', 'BAT1.pos');
  await expect(reading).toHaveAttribute('data-state', 'off');
  await page.getByTestId('run').click();
  await expect(reading).toHaveAttribute('data-state', 'ok');
  expect(Number(await reading.getAttribute('data-volts'))).toBeCloseTo(9, 1);

  // Black probe after the resistor: the meter now shows the drop across the resistor.
  await page.locator('[data-endpoint="BB1.e9"]').click();
  await expect(page.getByTestId('probe-black')).toHaveAttribute('data-probe', 'BB1.e9');
  await expect(reading).toHaveAttribute('data-volts', /^7\.\d+$/);
  const drop = Number(await reading.getAttribute('data-volts'));
  expect(drop).toBeCloseTo(
    Number(await page.locator('[data-part="R1"]').getAttribute('data-voltage')),
    2,
  );

  // A probe on a strip nothing is connected to reads nothing.
  await page.locator('[data-endpoint="BB1.h20"]').click();
  await expect(page.getByTestId('probe-red')).toHaveAttribute('data-probe', 'BB1.h20');
  await expect(reading).toHaveAttribute('data-state', 'open');

  // The probes stay while other tools are used, until they are taken off.
  await pick(page, 'select');
  await expect(page.getByTestId('probe-black')).toBeVisible();
  await page.getByTestId('probe-clear').click();
  await expect(page.getByTestId('probe-meter')).toHaveCount(0);
  await expect(page.getByTestId('probe-red')).toHaveCount(0);
});

test('pointing at a hole while the circuit runs shows its voltage', async ({ page }) => {
  await openExample(page, 'open-example');
  const at = await places(page, ['BB1.a5', 'BB1.j12']);
  await page.getByTestId('run').click();
  await expect(page.locator('[data-part="LED1"]')).toHaveAttribute('data-led-state', 'on');
  await pointAt(page, at['BB1.a5']!);
  await expect(hoverMark(page).locator('text')).toContainText('V');
  // A strip nothing is joined to has a name but no voltage.
  await pointAt(page, at['BB1.j12']!);
  await expect(hoverMark(page)).toHaveAttribute('data-hover', 'BB1.j12');
  await expect(hoverMark(page).locator('text')).not.toContainText('V');
});

/** Where a point of the canvas is on the screen, without moving the view. */
const screenOf = (page: Page, point: Spot) =>
  page.evaluate((p) => {
    const svg = document.querySelector<SVGSVGElement>('[data-testid="canvas-frame"] svg')!;
    const q = new DOMPoint(p.x, p.y).matrixTransform(svg.getScreenCTM()!);
    return { x: q.x, y: q.y };
  }, point);

const viewBoxOf = (page: Page) =>
  page.evaluate(() =>
    document
      .querySelector('[data-testid="canvas-frame"] svg')!
      .getAttribute('viewBox')!
      .split(' ')
      .map(Number),
  );

test('a first look takes in the whole circuit, at full size at most', async ({
  page,
  isMobile,
}) => {
  await openExample(page, 'open-example-uno');
  await expect(page.locator('[data-hit="UNO1"]')).toBeVisible();
  const scale = await page.evaluate(
    () =>
      document.querySelector<SVGSVGElement>('[data-testid="canvas-frame"] svg')!.getScreenCTM()!.a,
  );
  expect(scale).toBeLessThanOrEqual(1.001);
  // The mat has no scrollbars, and reaches past the circuit on every side.
  const frame = page.getByTestId('canvas-frame');
  expect(await frame.evaluate((el) => (el as HTMLElement).offsetWidth - el.clientWidth)).toBe(0);
  const [left, top] = await viewBoxOf(page);
  expect(left).toBeLessThan(-200);
  expect(top).toBeLessThan(-200);
  // On a laptop the breadboard and the board below it are both in sight.
  if (!isMobile) {
    await expect(page.locator('[data-hit="UNO1"]')).toBeInViewport({ ratio: 0.99 });
    await expect(page.locator('[data-part="LED1"]')).toBeInViewport();
  }
});

test('dragging the bare mat moves the view, any way', async ({ page, isMobile }) => {
  test.skip(isMobile, 'on a touch screen a finger moves the mat itself');
  await openExample(page, 'open-example');
  await expect(page.locator('[data-hit="BAT1"]')).toBeVisible();
  // A place on the mat below the breadboard, away from any hole.
  const grip = { x: 520, y: 640 };
  await onScreen(page, [grip]);
  const mark = { x: 190, y: 28 }; // the breadboard's corner
  const before = await screenOf(page, mark);
  const hold = await screenOf(page, grip);

  await page.mouse.move(hold.x, hold.y);
  await page.mouse.down();
  await page.mouse.move(hold.x - 60, hold.y - 40, { steps: 4 });
  await expect(page.getByTestId('canvas-frame')).toHaveAttribute('data-panning', 'true');
  await page.mouse.move(hold.x - 120, hold.y - 80, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('canvas-frame')).toHaveAttribute('data-panning', 'false');
  const after = await screenOf(page, mark);
  expect(after.x).toBeCloseTo(before.x - 120, 0);
  expect(after.y).toBeCloseTo(before.y - 80, 0);

  // And back the other way, past where it started: there is mat to the left and above.
  const again = await screenOf(page, grip);
  await page.mouse.move(again.x, again.y);
  await page.mouse.down();
  await page.mouse.move(again.x + 220, again.y + 150, { steps: 6 });
  await page.mouse.up();
  const back = await screenOf(page, mark);
  expect(back.x).toBeCloseTo(before.x + 100, 0);
  expect(back.y).toBeCloseTo(before.y + 70, 0);
  // Nothing was built by it.
  await expect(wires(page)).toHaveCount(4);
});

test('the mat grows where parts are put: a battery far to the left stays there', async ({
  page,
}) => {
  await openExample(page, 'open-example');
  const start = await placeOf(page, 'BAT1');
  const [leftBefore] = await viewBoxOf(page);

  // Twice, each time into the bare room the mat keeps on that side.
  await dragPart(page, 'BAT1', { x: 0.4, y: 0.5 }, { x: -200, y: 0 });
  await dragPart(page, 'BAT1', { x: 0.4, y: 0.5 }, { x: -200, y: 0 });
  const moved = await placeOf(page, 'BAT1');
  expect(moved.x).toBeLessThan(start.x - 300);
  expect(moved.x).toBeLessThan(0);
  const [leftAfter] = await viewBoxOf(page);
  expect(leftAfter).toBeLessThan(leftBefore! - 300);
  await expect(wires(page)).toHaveCount(4);

  // The place is kept with the circuit.
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
  await page.reload();
  await expect(page.locator('[data-hit="BAT1"]')).toBeVisible();
  expect(await placeOf(page, 'BAT1')).toEqual(moved);
});

/** The middle of a battery or board, in canvas coordinates. */
async function middleOf(page: Page, id: string): Promise<Spot> {
  const hit = page.locator(`[data-hit="${id}"]`);
  const corner = await placeOf(page, id);
  return {
    x: corner.x + Number(await hit.getAttribute('width')) / 2,
    y: corner.y + Number(await hit.getAttribute('height')) / 2,
  };
}

test('a battery in hand follows the pointer, and is put down where the mat is pressed', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'a picture follows a mouse; a finger just presses where the part goes');
  await openExample(page, 'open-example');
  await expect(page.locator('[data-hit="BAT1"]')).toBeVisible();
  await page.getByTestId('tool-battery').click();
  await expect(page.getByTestId('tool-battery')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('canvas-hint')).toContainText(/মাদুরের যেখানে|Press on the mat/);
  // Nothing is added yet.
  await expect(page.locator('[data-hit="BAT2"]')).toHaveCount(0);

  // Over the breadboard it has no room, and its picture says so; a press there adds nothing.
  const ghost = page.getByTestId('ghost-beside');
  const [onBoard] = await onScreen(page, [{ x: 560, y: 280 }]);
  await page.mouse.move(onBoard!.x, onBoard!.y);
  await expect(ghost).toHaveAttribute('data-fits', 'false');
  await page.mouse.click(onBoard!.x, onBoard!.y);
  await expect(page.getByTestId('notice')).toBeVisible();
  await expect(page.locator('[data-hit="BAT2"]')).toHaveCount(0);
  await expect(page.getByTestId('tool-battery')).toHaveAttribute('aria-pressed', 'true');

  // On the bare mat to the right it fits; a press puts it there, and it is no longer in hand.
  const place = { x: 1110, y: 640 };
  const [free] = await onScreen(page, [place]);
  await page.mouse.move(free!.x, free!.y);
  await expect(ghost).toHaveAttribute('data-fits', 'true');
  await page.mouse.click(free!.x, free!.y);
  await expect(page.locator('[data-hit="BAT2"]')).toBeVisible();
  await expect(ghost).toHaveCount(0);
  // Its middle is where the mat was pressed. (What it is picked up by reaches a little
  // further right than its body, to take in its terminals.)
  const middle = await middleOf(page, 'BAT2');
  expect(Math.abs(middle.x - place.x)).toBeLessThan(20);
  expect(Math.abs(middle.y - place.y)).toBeLessThan(6);

  // Esc puts a part in hand back.
  await page.getByTestId('tool-supply').click();
  await expect(page.getByTestId('tool-supply')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tool-supply')).toHaveAttribute('aria-pressed', 'false');
});

test('a breadboard is picked by its size, and put where the mat is pressed', async ({ page }) => {
  await openExample(page, 'open-example');
  await expect(page.locator('[data-hit="BAT1"]')).toBeVisible();
  const open = page.getByTestId('parts-open');
  if (await open.isVisible()) await open.click();

  // The breadboard's line opens its three sizes, with their holes.
  await page.getByTestId('tool-breadboard').click();
  await expect(page.getByTestId('tool-breadboard')).toHaveAttribute('aria-expanded', 'true');
  for (const [size, holes] of [
    ['mini', '১৭০'],
    ['half', '৪০০'],
    ['full', '৮৩০'],
  ]) {
    await expect(page.getByTestId(`tool-breadboard-${size}`)).toHaveAttribute(
      'aria-label',
      new RegExp(holes!),
    );
  }
  await page.getByTestId('tool-breadboard-mini').click();
  await expect(page.locator('[data-breadboard="BB2"]')).toHaveCount(0);

  // A press on the bare mat, below the first breadboard, puts the small one there.
  const [free] = await onScreen(page, [{ x: 500, y: 720 }]);
  await page.mouse.click(free!.x, free!.y);
  await expect(page.locator('[data-breadboard="BB2"]')).toBeVisible();
  // It is selected, and the circuit panel shows it is the mini.
  const panel = page.getByTestId('tab-circuit');
  if (await panel.isVisible()) await panel.click();
  await expect(page.getByTestId('breadboard-mini')).toHaveAttribute('aria-pressed', 'true');
});

test('a part for the breadboard rides beside the pointer until it is over a hole', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'a picture follows a mouse');
  await openExample(page, 'open-example');
  const spot = await places(page, ['BB1.c20']);
  await pick(page, 'resistor');

  // On the bare mat: its drawing, by the pointer.
  const [bare] = await onScreen(page, [{ x: 520, y: 640 }]);
  await page.mouse.move(bare!.x, bare!.y);
  await expect(page.getByTestId('ghost-icon')).toHaveAttribute('data-ghost', 'resistor');
  await expect(page.getByTestId('ghost')).toHaveCount(0);

  // Over a hole: the part itself, where it would go.
  const [hole] = await onScreen(page, [spot['BB1.c20']!]);
  await page.mouse.move(hole!.x, hole!.y);
  await expect(page.getByTestId('ghost')).toHaveAttribute('data-ghost', 'resistor');
  await expect(page.getByTestId('ghost-icon')).toHaveCount(0);
});

/** The drawn path of a wire: its last coloured line. */
const wireD = (page: Page, id: string) =>
  page.locator(`[data-wire="${id}"] path`).nth(2).getAttribute('d');

test('a wire can be drawn square, and any wire changed from one kind to the other', async ({
  page,
}) => {
  await openExample(page, 'open-example');
  await expect(page.locator('[data-hit="BAT1"]')).toBeVisible();
  await expect(wires(page)).toHaveCount(4);
  const spot = await places(page, ['BB1.a20', 'BB1.j26']);

  // Chosen in the toolbar: on a phone, a toggle beside the wire tool once it is in hand.
  const open = page.getByTestId('parts-open');
  if (await open.isVisible()) {
    await pick(page, 'wire');
    await page.getByTestId('wire-style-toggle').click();
    await expect(page.getByTestId('wire-style-toggle')).toHaveAttribute('data-style', 'square');
  } else {
    await page.getByTestId('wire-style-square').click();
    await expect(page.getByTestId('wire-style-square')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tool-wire')).toHaveAttribute('aria-pressed', 'true');
  }
  const [a, b] = await onScreen(page, [spot['BB1.a20']!, spot['BB1.j26']!]);
  await page.mouse.click(a!.x, a!.y);
  await page.mouse.click(b!.x, b!.y);
  await expect(wires(page)).toHaveCount(5);

  // Straight runs, across and then down: no curves in its path.
  const square = await wireD(page, 'W5');
  expect(square).not.toContain('C');
  expect(square).toMatch(/L/);

  // Selected, it can be made a jumper wire, which hangs slack in a curve; and back.
  // Pressed on its first run, across, a third of the way along.
  await pick(page, 'select');
  const along = {
    x: spot['BB1.a20']!.x + (spot['BB1.j26']!.x - spot['BB1.a20']!.x) / 3,
    y: spot['BB1.a20']!.y,
  };
  const [onWire] = await onScreen(page, [along]);
  await page.mouse.click(onWire!.x, onWire!.y);
  const restyle = page.getByTestId('quick-restyle');
  await expect(restyle).toHaveAttribute('data-style', 'square');
  await restyle.click();
  await expect(restyle).toHaveAttribute('data-style', 'jumper');
  expect(await wireD(page, 'W5')).toContain('C');
  await restyle.click();
  await expect(restyle).toHaveAttribute('data-style', 'square');

  // It is kept with the circuit, and the choice for new wires is kept on the device.
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
  await page.reload();
  await expect(page.locator('[data-hit="BAT1"]')).toBeVisible();
  expect(await wireD(page, 'W5')).not.toContain('C');
  if (!(await page.getByTestId('parts-open').isVisible())) {
    await expect(page.getByTestId('wire-style-square')).toHaveAttribute('aria-pressed', 'true');
  }
});
