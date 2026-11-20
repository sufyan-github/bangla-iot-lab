/**
 * Turns an Arduino sketch (.ino) into C++ the compiler accepts.
 *
 * Arduino lets students call a function before defining it. C++ does not, so
 * (like the Arduino IDE) we add a prototype for every function the sketch
 * defines, placed just before the first one. `#line` directives keep compiler
 * messages pointing at the student's own line numbers.
 *
 * The scanner is deliberately simple: it handles ordinary functions, which is
 * what school sketches contain. Templates and functions that return function
 * pointers are left alone and must be declared before use.
 */

/** Replaces comments, strings and preprocessor lines with spaces, keeping every newline. */
function blankNonCode(source: string): string {
  const out = source.split('');
  const blank = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (out[i] !== '\n') out[i] = ' ';
  };
  let i = 0;
  let lineStart = true;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    const ch = source[i]!;
    if (two === '//') {
      const end = source.indexOf('\n', i);
      blank(i, end < 0 ? source.length : end);
      i = end < 0 ? source.length : end;
    } else if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== ch && source[j] !== '\n')
        j += source[j] === '\\' ? 2 : 1;
      blank(i, Math.min(j + 1, source.length));
      i = j + 1;
    } else if (ch === '#' && lineStart) {
      let end = i;
      // A preprocessor line continues while it ends in a backslash.
      do {
        end = source.indexOf('\n', end + 1);
      } while (end > 0 && source[end - 1] === '\\');
      blank(i, end < 0 ? source.length : end);
      i = end < 0 ? source.length : end;
    } else {
      if (ch === '\n') lineStart = true;
      else if (ch !== ' ' && ch !== '\t') lineStart = false;
      i++;
      continue;
    }
    lineStart = false;
  }
  return out.join('');
}

const NOT_FUNCTIONS = new Set(['if', 'for', 'while', 'switch', 'return', 'else', 'do', 'sizeof']);
const DEFINITION = /((?:[A-Za-z_][\w:]*[\s*&]+)+)([A-Za-z_]\w*)\s*\(([^;{}()]*)\)\s*\{/g;

export interface FunctionDefinition {
  prototype: string;
  /** Offset in the source where the definition starts. */
  offset: number;
}

/** Finds functions defined at the top level of a sketch. */
export function findFunctions(source: string): FunctionDefinition[] {
  const code = blankNonCode(source);
  const depth = new Int32Array(code.length + 1);
  for (let i = 0, d = 0; i < code.length; i++) {
    depth[i] = d;
    if (code[i] === '{') d++;
    else if (code[i] === '}') d = Math.max(0, d - 1);
  }

  const found: FunctionDefinition[] = [];
  for (const match of code.matchAll(DEFINITION)) {
    const [, returnType, name, parameters] = match as unknown as [string, string, string, string];
    const offset = match.index + (match[0].length - match[0].trimStart().length);
    if (depth[offset] !== 0 || NOT_FUNCTIONS.has(name)) continue;
    const type = returnType.trim().replace(/\s+/g, ' ');
    if (/\b(struct|class|enum|union|typedef|new|else|return|operator)\b/.test(type)) continue;
    // Default values may only appear once, on the definition itself.
    const params = parameters
      .replace(/\s*=[^,]*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    found.push({ prototype: `${type} ${name}(${params});`, offset });
  }
  return found;
}

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) if (source[i] === '\n') line++;
  return line;
}

export function sketchToCpp(source: string): string {
  const functions = findFunctions(source);
  const header = '#include <Arduino.h>\n#line 1 "sketch.ino"\n';
  if (functions.length === 0) return header + source;

  // Insert before the line that holds the first function, so earlier type
  // declarations are already visible to the prototypes.
  const first = functions[0]!.offset;
  const insertAt = source.lastIndexOf('\n', first - 1) + 1;
  const prototypes = functions.map((f) => f.prototype).join('\n');
  return (
    header +
    source.slice(0, insertAt) +
    `${prototypes}\n#line ${lineAt(source, insertAt)} "sketch.ino"\n` +
    source.slice(insertAt)
  );
}
