/**
 * Data as CSV, for a spreadsheet: a header row, then one row per entry.
 * Fields with a comma, quote or line break are quoted, as RFC 4180 has it;
 * numbers are written as they are, and a missing value is left empty.
 */
export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const field = (value: unknown) => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [header, ...rows].map((row) => row.map(field).join(',')).join('\r\n') + '\r\n';
}

/** Hands the browser a text file to save. Nothing leaves the device. */
export function downloadText(name: string, text: string, type = 'text/csv'): void {
  // A byte-order mark, so spreadsheets read Bangla text as UTF-8.
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
