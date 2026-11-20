import { isCircuitDocument, type CircuitDocument } from '@banglalab/shared';
import Dexie, { type Table } from 'dexie';

/** A circuit saved on this device. */
export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  circuit: CircuitDocument;
}

class LabDatabase extends Dexie {
  projects!: Table<ProjectRecord, string>;

  constructor() {
    super('banglalab');
    // Changing this needs a new version() with an upgrade; never edit version 1.
    this.version(1).stores({ projects: 'id, updatedAt' });
  }
}

const database = new LabDatabase();

/**
 * Local project storage (IndexedDB). This is the source of truth while offline;
 * server sync arrives with accounts in Phase 2.
 */
export const projectStore = {
  /** Newest first. Records that fail validation are left out rather than crashing the list. */
  async list(): Promise<ProjectRecord[]> {
    const records = await database.projects.orderBy('updatedAt').reverse().toArray();
    return records.filter((record) => isCircuitDocument(record.circuit));
  },

  async get(id: string): Promise<ProjectRecord | undefined> {
    const record = await database.projects.get(id);
    return record && isCircuitDocument(record.circuit) ? record : undefined;
  },

  async create(name: string, circuit: CircuitDocument): Promise<ProjectRecord> {
    const now = Date.now();
    const record: ProjectRecord = {
      id: crypto.randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
      circuit,
    };
    await database.projects.add(record);
    // Ask the browser not to evict saved work under storage pressure.
    void navigator.storage?.persist?.().catch(() => undefined);
    return record;
  },

  /** Saves changes to an existing project. Refuses documents the app could not reopen. */
  async save(id: string, changes: { name: string; circuit: CircuitDocument }): Promise<void> {
    if (!isCircuitDocument(changes.circuit)) throw new Error('Refusing to save an invalid circuit');
    const updated = await database.projects.update(id, { ...changes, updatedAt: Date.now() });
    if (updated === 0) throw new Error(`Project ${id} no longer exists`);
  },

  async remove(id: string): Promise<void> {
    await database.projects.delete(id);
  },
};
