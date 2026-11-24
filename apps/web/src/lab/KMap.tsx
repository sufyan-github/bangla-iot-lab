import type { SumTerm } from '@banglalab/simulation';
import { useState } from 'react';
import { useT } from '../i18n';
import { kmapLayout } from './kmap';

/** A colour for each group, easy to tell apart on paper and in either language's text. */
const GROUP_COLOURS = ['#c2410c', '#1d4ed8', '#15803d', '#a21caf', '#b45309', '#0e7490', '#be123c'];

/**
 * One lamp's Karnaugh map: the truth table's rows in Gray-code order, with
 * each group of the simplest sum marked in its colour. Choosing a group's
 * term outlines the cells it covers.
 */
export function KMap({
  inputs,
  outputs,
  terms,
}: {
  inputs: number;
  outputs: readonly boolean[];
  terms: readonly SumTerm[];
}) {
  const { t } = useT();
  const [active, setActive] = useState<number | null>(null);
  const layout = kmapLayout(inputs);
  if (!layout) return null;
  const covering = (row: number) =>
    terms.flatMap((term, i) => ((row & term.mask) === term.value ? [i] : []));

  return (
    <div className="flex flex-wrap items-start gap-4" data-testid="sheet-kmap">
      <table className="border-collapse font-mono tabular-nums" aria-label={t('sheet.kmap')}>
        <thead>
          <tr>
            <th className="px-2 py-1 text-xs font-normal text-ink-soft">
              {layout.rowNames}\{layout.colNames}
            </th>
            {layout.colLabels.map((label) => (
              <th key={label} className="px-2 py-1 text-xs font-semibold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {layout.cells.map((cells, r) => (
            <tr key={layout.rowLabels[r]}>
              <th className="px-2 py-1 text-xs font-semibold">{layout.rowLabels[r]}</th>
              {cells.map((row) => {
                const groups = covering(row);
                const lit = active !== null && groups.includes(active);
                return (
                  <td
                    key={row}
                    data-testid="kmap-cell"
                    data-row={row}
                    data-value={outputs[row] ? 1 : 0}
                    data-groups={groups.length}
                    className="relative h-11 w-11 border border-line text-center align-middle"
                    style={
                      lit
                        ? {
                            outline: `3px solid ${GROUP_COLOURS[active % GROUP_COLOURS.length]}`,
                            outlineOffset: -3,
                          }
                        : undefined
                    }
                  >
                    <span className={outputs[row] ? 'font-bold' : 'text-ink-faint'}>
                      {outputs[row] ? 1 : 0}
                    </span>
                    {/* A small bar for each group the cell is in. */}
                    <span className="absolute inset-x-1 bottom-1 flex gap-0.5" aria-hidden>
                      {groups.map((group) => (
                        <span
                          key={group}
                          className="h-1 flex-1 rounded-full"
                          style={{ background: GROUP_COLOURS[group % GROUP_COLOURS.length] }}
                        />
                      ))}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {terms.length > 0 && terms[0]!.mask !== 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-ink-soft">{t('sheet.kmapGroups')}</p>
          <div className="flex flex-wrap gap-1.5">
            {terms.map((term, i) => (
              <button
                key={term.text}
                type="button"
                data-testid="kmap-term"
                aria-pressed={active === i}
                className="chip font-mono"
                style={{
                  borderColor: GROUP_COLOURS[i % GROUP_COLOURS.length],
                  background: active === i ? GROUP_COLOURS[i % GROUP_COLOURS.length] : undefined,
                  color: active === i ? '#fff' : GROUP_COLOURS[i % GROUP_COLOURS.length],
                }}
                onClick={() => setActive(active === i ? null : i)}
              >
                {term.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
