import type { Lesson } from '@banglalab/lessons';
import { addBattery, addEsp32, emptyCircuit, type CircuitDocument } from '@banglalab/shared';
import { placeBesideOtherBoard } from '../lab/geometry';
import { projectStore, type ProjectRecord } from '../storage/projects';
import { freshProgress } from './progress';

/** The circuit a lesson starts from: its board, and its battery if it has one. */
export function lessonCircuit(lesson: Lesson): CircuitDocument {
  let circuit = emptyCircuit();
  const board = addEsp32(circuit);
  if (board.ok) circuit = board.circuit;
  if (lesson.setup.boards === 2) {
    const second = addEsp32(circuit);
    if (second.ok) circuit = placeBesideOtherBoard(second.circuit, second.id);
  }
  if (lesson.setup.battery !== undefined) {
    const battery = addBattery(circuit, lesson.setup.battery);
    if (battery.ok) circuit = battery.circuit;
  }
  return circuit;
}

/** Makes a new project for a lesson, at its first step. */
export function startLesson(lesson: Lesson, name: string): Promise<ProjectRecord> {
  return projectStore.create({
    name,
    circuit: lessonCircuit(lesson),
    programs: {},
    lesson: freshProgress(lesson),
  });
}

/** The latest project made from each lesson, by lesson id. */
export function lessonProjects(projects: readonly ProjectRecord[]): Map<string, ProjectRecord> {
  const latest = new Map<string, ProjectRecord>();
  for (const project of projects) {
    const id = project.lesson?.id;
    if (!id) continue;
    const known = latest.get(id);
    if (!known || known.updatedAt < project.updatedAt) latest.set(id, project);
  }
  return latest;
}
