import {
  isCircuitDocument,
  isLogicSheet,
  migrateCircuit,
  type CircuitDocument,
  type LogicSheet,
} from '@banglalab/shared';
import Dexie, { type Table } from 'dexie';

/** The program written for one board, and the firmware last uploaded to it. */
export interface BoardProgram {
  source: string;
  /** Compiled firmware (Intel HEX), kept so the circuit runs again without a network. */
  hex: string | null;
  /** The source `hex` was built from; differs from `source` when there are unuploaded edits. */
  hexSource: string | null;
  /**
   * ESP32 only: how the student wants the program run. Absent means the lab's
   * own model of the board; `emulator` means the board's real firmware in an
   * emulator of the chip.
   */
  engine?: 'library' | 'emulator';
  /**
   * The sketch's other files, as tabs beside the main one: more of the sketch
   * (.ino), headers (.h) and sources compiled on their own (.c, .cpp).
   */
  files?: SketchTab[];
}

/** One of a sketch's other files. */
export interface SketchTab {
  name: string;
  source: string;
}

/**
 * Everything a program is made of, as one text: the main file alone when there
 * are no other files. `hexSource` holds this, so a change to any tab shows the
 * program needs uploading again.
 */
export function programText(program: { source: string; files?: readonly SketchTab[] }): string {
  const files = program.files ?? [];
  if (files.length === 0) return program.source;
  return [program.source, ...files.map((file) => `\u0000${file.name}\u0000${file.source}`)].join(
    '',
  );
}

/**
 * Where a student is in a lesson. Kept on this device with the project the
 * lesson made; nothing about it leaves the device.
 */
export interface LessonProgress {
  id: string;
  /** The step being shown, from 0. */
  step: number;
  /** Steps completed. */
  done: number[];
  /** Events already seen on the current step, by check index. */
  seen: number[];
}

/** A circuit saved on this device. */
export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  circuit: CircuitDocument;
  /** Programs by board id. Missing in projects saved before boards existed. */
  programs: Record<string, BoardProgram>;
  /** Present when the project was started from a lesson. */
  lesson?: LessonProgress;
  /**
   * Each board's saved settings (the ESP32's Preferences), by board id, as the
   * board library keeps them. They outlast stopping the circuit and uploading
   * a new program, as on a real board.
   */
  settings?: Record<string, string>;
  /** The logic sheet, when the project has one. */
  sheet?: LogicSheet;
  /** The project's id in the cloud, and the version last saved there or taken from there. */
  cloudId?: string;
  cloudVersion?: number;
}

export type ProjectContent = Pick<
  ProjectRecord,
  'name' | 'circuit' | 'programs' | 'lesson' | 'settings' | 'sheet'
>;

class LabDatabase extends Dexie {
  projects!: Table<ProjectRecord, string>;

  constructor() {
    super('banglalab');
    // Changing an index needs a new version() with an upgrade; never edit version 1.
    // Unindexed fields (such as `programs`) may be added without one.
    this.version(1).stores({ projects: 'id, updatedAt' });
  }
}

const database = new LabDatabase();

/** Brings a stored record up to the current shape, or rejects it. */
function restore(record: ProjectRecord | undefined): ProjectRecord | undefined {
  if (!record) return undefined;
  const circuit = migrateCircuit(record.circuit);
  return circuit ? { ...record, circuit, programs: record.programs ?? {} } : undefined;
}

/**
 * Local project storage (IndexedDB). This is the source of truth while offline;
 * server sync arrives with accounts in Phase 2.
 */
export const projectStore = {
  /** Newest first. Records that cannot be opened are left out rather than crashing the list. */
  async list(): Promise<ProjectRecord[]> {
    const records = await database.projects.orderBy('updatedAt').reverse().toArray();
    return records.map(restore).filter((record) => record !== undefined);
  },

  async get(id: string): Promise<ProjectRecord | undefined> {
    return restore(await database.projects.get(id));
  },

  async create(content: ProjectContent): Promise<ProjectRecord> {
    const now = Date.now();
    const record: ProjectRecord = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...content,
    };
    await database.projects.add(record);
    // Ask the browser not to evict saved work under storage pressure.
    void navigator.storage?.persist?.().catch(() => undefined);
    return record;
  },

  /** Saves changes to an existing project. Refuses documents the app could not reopen. */
  async save(id: string, content: ProjectContent): Promise<void> {
    if (!isCircuitDocument(content.circuit)) throw new Error('Refusing to save an invalid circuit');
    if (content.sheet !== undefined && !isLogicSheet(content.sheet)) {
      throw new Error('Refusing to save an invalid logic sheet');
    }
    const updated = await database.projects.update(id, { ...content, updatedAt: Date.now() });
    if (updated === 0) throw new Error(`Project ${id} no longer exists`);
  },

  /** Notes which cloud project and version this one matches. */
  async setCloud(id: string, cloudId: string, cloudVersion: number): Promise<void> {
    await database.projects.update(id, { cloudId, cloudVersion });
  },

  /** Saves how far the student has got in the project's lesson. */
  async saveLesson(id: string, lesson: LessonProgress): Promise<void> {
    await database.projects.update(id, { lesson });
  },

  async remove(id: string): Promise<void> {
    await database.projects.delete(id);
  },

  /** Test hook: writes a record exactly as given, as an older app version would have. */
  async putRaw(record: unknown): Promise<void> {
    await database.projects.put(record as ProjectRecord);
  },
};
