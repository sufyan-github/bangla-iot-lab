import 'fake-indexeddb/auto';
import { emptyCircuit, ledCircuitExample, unoCircuitExample, updateProps } from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { projectStore } from './projects';

describe('local project storage', () => {
  it('creates, reopens, updates and deletes a project', async () => {
    const created = await projectStore.create({
      name: 'LED',
      circuit: ledCircuitExample(),
      programs: {},
    });
    expect(await projectStore.get(created.id)).toEqual(created);

    const edited = updateProps(created.circuit, 'R1', { resistance: 470 });
    if (!edited.ok) throw new Error(edited.error);
    await projectStore.save(created.id, { name: 'LED ২', circuit: edited.circuit, programs: {} });

    const reopened = await projectStore.get(created.id);
    expect(reopened).toMatchObject({ name: 'LED ২', createdAt: created.createdAt });
    expect(reopened!.circuit).toEqual(edited.circuit);
    expect(reopened!.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);

    await projectStore.remove(created.id);
    expect(await projectStore.get(created.id)).toBeUndefined();
  });

  it('keeps each board’s program and its compiled firmware', async () => {
    const programs = {
      UNO1: { source: 'void setup(){}\nvoid loop(){}\n', hex: ':00000001FF\n', hexSource: 'old' },
    };
    const created = await projectStore.create({
      name: 'UNO',
      circuit: unoCircuitExample(),
      programs,
    });
    expect((await projectStore.get(created.id))!.programs).toEqual(programs);
  });

  it('opens a project saved by the first version of the app', async () => {
    await projectStore.putRaw({
      id: 'old-project',
      name: 'পুরনো',
      createdAt: 1,
      updatedAt: 1,
      // Saved before breadboards were parts: no BB1, and holes without its name.
      circuit: JSON.parse(
        JSON.stringify({
          ...ledCircuitExample(),
          components: ledCircuitExample().components.filter((c) => c.type !== 'breadboard'),
          schemaVersion: 1,
        }).replaceAll('BB1.', ''),
      ),
    });
    const opened = await projectStore.get('old-project');
    expect(opened!.circuit).toEqual(ledCircuitExample());
    expect(opened!.programs).toEqual({});
    expect((await projectStore.list()).some((p) => p.id === 'old-project')).toBe(true);
  });

  it('lists the most recently changed project first', async () => {
    const content = { name: 'x', circuit: emptyCircuit(), programs: {} };
    const first = await projectStore.create(content);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await projectStore.create(content);
    expect((await projectStore.list()).map((p) => p.id).slice(0, 2)).toEqual([second.id, first.id]);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await projectStore.save(first.id, content);
    expect((await projectStore.list())[0]!.id).toBe(first.id);
  });

  it('refuses to save a circuit it could not reopen, and hides records it cannot read', async () => {
    const project = await projectStore.create({ name: 'x', circuit: emptyCircuit(), programs: {} });
    const broken = { ...emptyCircuit(), schemaVersion: 99 } as never;
    await expect(
      projectStore.save(project.id, { name: 'x', circuit: broken, programs: {} }),
    ).rejects.toThrow(/invalid/);
    await expect(
      projectStore.save('missing', { name: 'x', circuit: emptyCircuit(), programs: {} }),
    ).rejects.toThrow(/no longer exists/);

    await projectStore.putRaw({
      id: 'corrupt',
      name: 'x',
      createdAt: 1,
      updatedAt: 1,
      circuit: { nonsense: true },
    });
    expect(await projectStore.get('corrupt')).toBeUndefined();
    expect((await projectStore.list()).some((p) => p.id === 'corrupt')).toBe(false);
  });
});
