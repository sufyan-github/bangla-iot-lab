import { Fragment, type ReactNode } from 'react';

/**
 * Shows lesson text written in a small part of Markdown: paragraphs, line
 * breaks, lists, headings, code blocks, **bold** and `code`. Pictures and the
 * targets of links are left out; tables are shown as they are typed.
 */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // Pictures go; a link keeps its words.
  const plain = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const match of plain.matchAll(pattern)) {
    if (match.index > last) parts.push(plain.slice(last, match.index));
    const token = match[0];
    parts.push(
      token.startsWith('**') ? (
        <strong key={parts.length}>{token.slice(2, -2)}</strong>
      ) : (
        <code key={parts.length} className="rounded bg-paper px-1 font-mono text-[0.92em]">
          {token.slice(1, -1)}
        </code>
      ),
    );
    last = match.index + token.length;
  }
  if (last < plain.length) parts.push(plain.slice(last));
  return parts;
}

function lines(text: string): ReactNode {
  return text.split('\n').map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {inline(line)}
    </Fragment>
  ));
}

export function Rich({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const source = text.replace(/\r\n/g, '\n');
  // Code blocks first, so that blank lines inside them do not split them.
  const pieces = source.split(/^```[^\n]*\n([\s\S]*?)^```\s*$/m);
  pieces.forEach((piece, index) => {
    if (index % 2 === 1) {
      blocks.push(
        <pre
          key={blocks.length}
          className="overflow-x-auto rounded-lg bg-paper p-3 font-mono text-sm"
        >
          {piece}
        </pre>,
      );
      return;
    }
    for (const block of piece.split(/\n{2,}/)) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      const key = blocks.length;
      const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
      if (heading && !trimmed.includes('\n')) {
        blocks.push(
          <p key={key} className="font-semibold">
            {inline(heading[2]!)}
          </p>,
        );
      } else if (trimmed.split('\n').every((line) => /^\s*[-*]\s+/.test(line))) {
        blocks.push(
          <ul key={key} className="list-disc space-y-1 pl-5">
            {trimmed.split('\n').map((line, i) => (
              <li key={i}>{inline(line.replace(/^\s*[-*]\s+/, ''))}</li>
            ))}
          </ul>,
        );
      } else if (trimmed.startsWith('|')) {
        blocks.push(
          <pre key={key} className="overflow-x-auto font-mono text-xs leading-relaxed">
            {trimmed}
          </pre>,
        );
      } else {
        blocks.push(<p key={key}>{lines(trimmed)}</p>);
      }
    }
  });
  return <div className={`space-y-2.5 ${className ?? ''}`}>{blocks}</div>;
}
