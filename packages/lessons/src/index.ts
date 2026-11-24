import { Value } from 'typebox/value';
import { partDefinition } from '@banglalab/parts';
import { LESSON_FILES } from './registry';
import { LessonSchema, type Check, type Lesson } from './schema';

export * from './checks';
export * from './schema';

/**
 * Everything wrong with a lesson file: its shape, and references that the
 * schema alone cannot check. Empty when the lesson is usable.
 */
export function lessonProblems(value: unknown): string[] {
  if (!Value.Check(LessonSchema, value)) {
    return [...Value.Errors(LessonSchema, value)].map(
      (error) => `${error.instancePath || '/'}: ${error.message}`,
    );
  }
  const lesson = value;
  const problems: string[] = [];
  for (const id of lesson.parts) {
    try {
      partDefinition(id);
    } catch {
      problems.push(`no part definition "${id}"`);
    }
  }
  const programSteps = lesson.steps.filter((step) => step.program === true);
  const secondSteps = lesson.steps.filter((step) => step.program === 2);
  if (lesson.program === undefined && programSteps.length > 0) {
    problems.push('a step puts a program on the board, but the lesson has none');
  }
  if (lesson.program !== undefined && programSteps.length !== 1) {
    problems.push('a lesson with a program has exactly one step that puts it on the board');
  }
  if ((lesson.program2 !== undefined) !== (secondSteps.length === 1) || secondSteps.length > 1) {
    problems.push('a second program goes with exactly one step that puts it on the second board');
  }
  if (lesson.program2 !== undefined && lesson.setup.boards !== 2) {
    problems.push('a second program needs a second board');
  }
  const checks: Check[] = lesson.steps.flatMap((step) => step.checks);
  for (const check of checks) {
    const own = check.kind === 'program' && check.unit === 2 ? lesson.program2 : lesson.program;
    if (check.kind === 'program' && check.starter !== own) {
      problems.push(`a step checks for program "${check.starter}", not the lesson's own`);
    }
    if (check.kind === 'serial') {
      try {
        new RegExp(check.matches, 'u');
      } catch {
        problems.push(`not a pattern: ${check.matches}`);
      }
      // The student sees plain text as it is; a pattern needs words of its own.
      if (/[\\^$.*+?()[\]{}|]/.test(check.matches) && !check.label) {
        problems.push(`the pattern ${check.matches} needs a label to show the student`);
      }
    }
    if (check.kind === 'diagnostic' && !check.label) {
      problems.push(`the check for the lab's "${check.code}" explanation needs a label`);
    }
  }
  for (const [i, question] of (lesson.quiz ?? []).entries()) {
    if (question.answer >= question.choices.length) {
      problems.push(`quiz question ${i + 1} gives an answer it does not offer`);
    }
  }
  if (lesson.learned.bn.length !== lesson.learned.en.length || lesson.learned.bn.length === 0) {
    problems.push('"learned" needs the same number of points in both languages');
  }
  return problems;
}

function load(): Lesson[] {
  const lessons = LESSON_FILES.map((raw) => {
    const problems = lessonProblems(raw);
    const id = (raw as { id?: string }).id ?? '(no id)';
    if (problems.length > 0) throw new Error(`Lesson ${id}: ${problems.join('; ')}`);
    return raw as Lesson;
  });
  // A lesson to take first must exist and come earlier.
  for (const lesson of lessons) {
    for (const id of lesson.after ?? []) {
      const before = lessons.find((other) => other.id === id);
      if (!before || before.order >= lesson.order) {
        throw new Error(`Lesson ${lesson.id}: "${id}" is not an earlier lesson`);
      }
    }
  }
  return lessons.sort((a, b) => a.order - b.order);
}

/** A lesson's kind; lessons that do not say are about one part. */
export const lessonKind = (lesson: Lesson) => lesson.kind ?? 'part';

/** The kit lessons, in the order they are taken. Their text is CC BY 4.0 (see content/README.md). */
export const LESSONS: readonly Lesson[] = load();

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.id === id);
}
