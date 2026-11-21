import { expect, test, type Page } from '@playwright/test';

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
  await page.getByTestId('tool-wire').click();
  const found: Record<string, Spot> = {};
  for (const endpoint of endpoints) {
    const target = page.locator(`[data-endpoint="${endpoint}"]`);
    found[endpoint] = {
      x: Number(await target.getAttribute('cx')),
      y: Number(await target.getAttribute('cy')),
    };
  }
  await page.getByTestId('tool-select').click();
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
  const at = await places(page, ['h20', 'd9', 'tp13', 'BAT1.pos']);

  await pointAt(page, at.h20!);
  await expect(hoverMark(page)).toHaveAttribute('data-hover', 'h20');
  await expect(hoverMark(page).locator('text')).toHaveText('h20');
  // The five holes of column 20's lower strip are joined.
  await expect(hoverMark(page)).toHaveAttribute('data-joined', '5');

  // A hole holding a leg says whose leg it is.
  await pointAt(page, at.d9!);
  await expect(hoverMark(page)).toHaveAttribute('data-hover', 'd9');
  await expect(hoverMark(page).locator('text')).toContainText('LED1 +');

  // A power rail is one long strip.
  await pointAt(page, at.tp13!);
  await expect(hoverMark(page)).toHaveAttribute('data-joined', '25');

  await pointAt(page, at['BAT1.pos']!);
  await expect(hoverMark(page).locator('text')).toContainText('BAT1 +');
});

test('a wire can be dragged from one hole to another', async ({ page }) => {
  await openExample(page, 'open-example');
  const at = await places(page, ['h12', 'h20', 'f14', 'f22', 'f10', 'c9']);
  await expect(wires(page)).toHaveCount(4);

  // With the wire tool: press on one hole, let go on another.
  await page.getByTestId('tool-wire').click();
  const [from, to] = await onScreen(page, [at.h12!, at.h20!]);
  await page.mouse.move(from!.x, from!.y);
  await page.mouse.down();
  await page.mouse.move(to!.x - 30, to!.y + 10, { steps: 4 });
  await expect(page.getByTestId('wire-preview')).toBeVisible();
  await page.mouse.move(to!.x, to!.y, { steps: 3 });
  await page.mouse.up();
  await expect(wires(page)).toHaveCount(5);
  await expect(page.getByTestId('wire-preview')).toHaveCount(0);

  // With the select tool: dragging away from a free hole pulls a wire out of it.
  await page.getByTestId('tool-select').click();
  await drag(page, at.f14!, at.f22!);
  await expect(wires(page)).toHaveCount(6);
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');

  // Let go on a hole that is taken: no wire, and the reason is shown.
  await drag(page, at.f10!, at.c9!);
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
  const at = await places(page, ['a5', 'a20']);
  await drag(page, at.a5!, at.a20!);
  await expect(led).toHaveAttribute('data-led-state', 'off');
  await drag(page, at.a20!, at.a5!);
  await expect(led).toHaveAttribute('data-led-state', 'on');
  await expect(wires(page)).toHaveCount(4);
});

test('a part tool shows where the part will go before it is placed', async ({ page }) => {
  await openExample(page, 'open-example');
  await page.getByTestId('tool-resistor').click();
  const free = page.locator('[data-endpoint="h15"]');
  await free.hover();
  await expect(page.getByTestId('ghost')).toHaveAttribute('data-ghost', 'resistor');
  await expect(page.locator('[data-part]')).toHaveCount(3);

  // Over a hole that is taken there is nothing to show, and the mark turns red.
  await page.locator('[data-endpoint="c5"]').hover();
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
  await page.getByTestId('tool-wire').click();
  const socketBefore = Number(await socket.getAttribute('cx'));
  await page.getByTestId('tool-select').click();

  // Drag the board by its body, down and to the left.
  await dragPart(page, 'UNO1', { x: 0.5, y: 0.6 }, { x: -70, y: 40 });
  const after = await placeOf(page, 'UNO1');
  expect(after.x).toBeLessThan(before.x - 40);
  expect(after.y).toBeGreaterThan(before.y + 20);
  await page.getByTestId('tool-wire').click();
  expect(Number(await socket.getAttribute('cx')) - socketBefore).toBeCloseTo(after.x - before.x, 0);
  await page.getByTestId('tool-select').click();
  await expect(wires(page)).toHaveCount(9);

  // It cannot be dropped on the breadboard: it stops at the edge instead.
  await dragPart(page, 'UNO1', { x: 0.5, y: 0.6 }, { x: 0, y: -300 });
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
  await page.getByTestId('tool-battery').click();
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
  await page.getByTestId('tool-resistor').click();
  await page.locator('[data-endpoint="h15"]').click();
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
  const at = await places(page, ['tp4', 'a5']);
  const middle = { x: (at.tp4!.x + at.a5!.x) / 2, y: (at.tp4!.y + at.a5!.y) / 2 + 4 };
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
