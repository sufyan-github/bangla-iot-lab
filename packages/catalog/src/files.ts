import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NO_DECISIONS, type LinkDecisions } from './links';
import type { Snapshot } from './types';

/**
 * Reading and writing the private catalogue files under data/private/catalog/:
 * one folder per snapshot date written by `catalog:import`, and one file of
 * link decisions shared by every snapshot.
 */

/** The repository's private catalogue folder. */
export const PRIVATE_CATALOG = path.resolve(import.meta.dirname, '../../../data/private/catalog');

/** The file of link decisions, beside the snapshot folders. */
export const decisionsFile = (root: string = PRIVATE_CATALOG) => path.join(root, 'part-links.json');

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;

/** A snapshot as `catalog:import` wrote it. */
export function readSnapshot(folder: string): Snapshot {
  const manifest = readJson<{ snapshotDate: string }>(path.join(folder, 'manifest.json'));
  return {
    snapshotDate: manifest.snapshotDate,
    products: readJson(path.join(folder, 'products.json')),
    projects: readJson(path.join(folder, 'projects.json')),
    lab: readJson(path.join(folder, 'lab.json')),
    issues: readJson(path.join(folder, 'issues.json')),
  };
}

/** The decisions so far; none when the file does not exist yet. */
export function readDecisions(file: string): LinkDecisions {
  if (!existsSync(file)) return NO_DECISIONS;
  const value = readJson<LinkDecisions>(file);
  if (value.formatVersion !== 1 || typeof value.decisions !== 'object' || !value.decisions) {
    throw new Error(`${file} is not a file of link decisions.`);
  }
  return value;
}

/** Writes the decisions whole, through a temporary file, so a crash never leaves half a file. */
export function writeDecisions(file: string, decisions: LinkDecisions): void {
  const sorted = Object.fromEntries(
    Object.entries(decisions.decisions).sort(([a], [b]) => a.localeCompare(b)),
  );
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ formatVersion: 1, decisions: sorted }, null, 2)}\n`);
  renameSync(temporary, file);
}
