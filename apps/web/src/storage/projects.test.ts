import 'fake-indexeddb/auto';
import { emptyCircuit, ledCircuitExample, updateProps } from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { projectStore } from './projects';

describe('local project storage', () => {
  it('creates, reopens, updates and deletes a project', async () => {
    const created = await projectStore.create('LED', ledCircuitExample());
    expect(await projectStore.get(created.id)).toEqual(created);

    const edited = updateProps(created.circuit, 'R1', { resistance: 470 });
    if (!edited.ok) throw new Error(edited.error);
    await projectStore.save(created.id, { name: 'LED ২', circuit: edited.circuit });

    const reopened = await projectStore.get(created.id);
    expect(reopened).toMatchObject({ name: 'LED ২', createdAt: created.createdAt });
    expect(reopened!.circuit).toEqual(edited.circuit);
    expect(reopened!.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);

    await projectStore.remove(created.id);
    expect(await projectStore.get(created.id)).toBeUndefined();
  });

  it('lists the most recently changed project first', async () => {
    const first = await projectStore.create('প্রথম', emptyCircuit());
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await projectStore.create('দ্বিতীয়', emptyCircuit());
    expect((await projectStore.list()).map((p) => p.id).slice(0, 2)).toEqual([second.id, first.id]);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await projectStore.save(first.id, { name: 'প্রথম', circuit: emptyCircuit() });
    expect((await projectStore.list())[0]!.id).toBe(first.id);
  });

  it('refuses to save a circuit it could not reopen', async () => {
    const project = await projectStore.create('x', emptyCircuit());
    const broken = { ...emptyCircuit(), schemaVersion: 99 } as never;
    await expect(projectStore.save(project.id, { name: 'x', circuit: broken })).rejects.toThrow(
      /invalid/,
    );
    await expect(
      projectStore.save('missing', { name: 'x', circuit: emptyCircuit() }),
    ).rejects.toThrow(/no longer exists/);
  });
});
