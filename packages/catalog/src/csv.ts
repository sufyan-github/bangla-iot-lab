/**
 * A small CSV reader (RFC 4180): quoted fields, doubled quotes, commas and line
 * breaks inside quotes, CRLF or LF, and an optional byte-order mark. The store
 * export is plain enough that a dependency is not worth carrying.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (quoted) {
      if (char !== '"') field += char;
      else if (source[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell !== ''));
}

/** Rows as objects keyed by the header row. `line` is the row's line in the file, for reports. */
export function readTable(text: string, required: readonly string[]): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error('The file is empty.');
  const missing = required.filter((column) => !header.includes(column));
  if (missing.length > 0) throw new Error(`Missing column(s): ${missing.join(', ')}`);
  return rows.map((cells) =>
    Object.fromEntries(header.map((column, index) => [column, cells[index] ?? ''])),
  );
}
