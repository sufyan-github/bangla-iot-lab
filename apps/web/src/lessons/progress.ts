import type { StepStatus } from '@banglalab/lessons';
import { LESSONS, type Lesson } from '@banglalab/lessons';
import { create } from 'zustand';
import { projectStore, type LessonProgress } from '../storage/projects';

/**
 * The lesson of the open project, if it has one: where the student is, and
 * which of the current step's checks hold right now. Progress is saved with
 * the project, on this device only.
 */
interface LessonState {
  projectId: string | null;
  lesson: Lesson | null;
  progress: LessonProgress | null;
  /** For each check of the current step: does it hold. */
  checks: boolean[];
  open(projectId: string, progress: LessonProgress | undefined): void;
  close(): void;
  /** Takes in how the current step looks now. */
  report(status: StepStatus): void;
  goTo(step: number): void;
}

const sameList = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

export const useLessonState = create<LessonState>((set, get) => {
  const save = (progress: LessonProgress) => {
    const { projectId } = get();
    if (projectId) void projectStore.saveLesson(projectId, progress).catch(() => undefined);
  };
  return {
    projectId: null,
    lesson: null,
    progress: null,
    checks: [],
    open(projectId, progress) {
      const lesson = progress ? (LESSONS.find((l) => l.id === progress.id) ?? null) : null;
      set({ projectId, lesson, progress: lesson ? progress! : null, checks: [] });
    },
    close: () => set({ projectId: null, lesson: null, progress: null, checks: [] }),
    report(status) {
      const { progress, checks } = get();
      if (!progress) return;
      const done =
        status.done && !progress.done.includes(progress.step)
          ? [...progress.done, progress.step].sort((a, b) => a - b)
          : progress.done;
      const changed = done !== progress.done || !sameList(status.seen, progress.seen);
      if (changed) {
        const next = { ...progress, done, seen: status.seen };
        set({ progress: next, checks: status.checks });
        save(next);
      } else if (!sameList(status.checks, checks)) {
        set({ checks: status.checks });
      }
    },
    goTo(step) {
      const { progress, lesson } = get();
      if (!progress || !lesson || step < 0 || step >= lesson.steps.length) return;
      // What was seen belongs to the step it was seen on.
      const next = { ...progress, step, seen: [] };
      set({ progress: next, checks: [] });
      save(next);
    },
  };
});

/** A new lesson's progress: at its first step, nothing done. */
export function freshProgress(lesson: Lesson): LessonProgress {
  return { id: lesson.id, step: 0, done: [], seen: [] };
}
