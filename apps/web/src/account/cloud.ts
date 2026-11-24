import { isCircuitDocument, migrateCircuit } from '@banglalab/shared';
import { projectStore, type BoardProgram, type ProjectRecord } from '../storage/projects';
import { call, type Answer } from './client';

export interface CloudProject {
  id: string;
  title: string;
  updatedAt: string;
  version: number;
}

/**
 * What goes to the cloud: the name, the circuit and the programs' source. The
 * compiled firmware stays behind (it is large, and is built again on upload).
 */
function documentOf(project: ProjectRecord) {
  const programs: Record<string, BoardProgram> = {};
  for (const [boardId, program] of Object.entries(project.programs)) {
    programs[boardId] = { ...program, hex: null, hexSource: null };
  }
  const extra = project as ProjectRecord & { sheet?: unknown };
  return {
    name: project.name,
    circuit: project.circuit,
    programs,
    ...(extra.sheet === undefined ? {} : { sheet: extra.sheet }),
  };
}

/** Saves a project to the cloud: a new one, or a new version of the one it came from. */
export async function saveToCloud(
  project: ProjectRecord,
): Promise<Answer<{ id: string; version: number }>> {
  const answer = await call<{ id: string; version: number }>('/v1/projects', {
    ...(project.cloudId ? { id: project.cloudId } : {}),
    document: documentOf(project),
  });
  if (answer.ok) await projectStore.setCloud(project.id, answer.value.id, answer.value.version);
  return answer;
}

export const listCloud = () => call<{ projects: CloudProject[] }>('/v1/projects');

/** Brings a cloud project onto this device as a project of its own. Refuses one the lab cannot open. */
export async function openFromCloud(id: string): Promise<Answer<ProjectRecord>> {
  const answer = await call<{
    id: string;
    version: number;
    document: {
      name: string;
      circuit: unknown;
      programs?: Record<string, BoardProgram>;
      sheet?: unknown;
    };
  }>(`/v1/projects/${id}`);
  if (!answer.ok) return answer;
  const { document, version } = answer.value;
  const circuit = migrateCircuit(document.circuit);
  if (!circuit || !isCircuitDocument(circuit)) return { ok: false, error: 'cannot-open' };
  const record = await projectStore.create({
    name: document.name,
    circuit,
    programs: document.programs ?? {},
    ...(document.sheet === undefined ? {} : ({ sheet: document.sheet } as object)),
  });
  await projectStore.setCloud(record.id, id, version);
  return { ok: true, value: record };
}
