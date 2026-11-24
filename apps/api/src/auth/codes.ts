import { createHash, randomInt } from 'node:crypto';

/**
 * Codes people type: a class's join code and a learner's key. Letters and
 * digits that cannot be mistaken for each other (no 0/O, 1/I/L), in groups.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function makeCode(groups: number, size = 4): string {
  return Array.from({ length: groups }, () =>
    Array.from({ length: size }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''),
  ).join('-');
}

/** The same code however it was typed: case, spaces and dashes do not matter. */
export function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export const hashCode = (code: string) =>
  createHash('sha256').update(normaliseCode(code)).digest('base64url');
