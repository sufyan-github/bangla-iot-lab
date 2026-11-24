import { cpp } from '@codemirror/lang-cpp';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { EditorView, basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';

/** The editor in the app's own colours, which follow light and dark mode. */
const theme = EditorView.theme({
  '&': {
    fontSize: '14px',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-ink)',
  },
  '.cm-content': {
    fontFamily: 'ui-monospace, "Cascadia Mono", Menlo, monospace',
    padding: '8px 0',
    caretColor: 'var(--color-ink)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-ink)' },
  '.cm-gutters': {
    backgroundColor: 'var(--color-paper)',
    color: 'var(--color-ink-soft)',
    border: 'none',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--color-accent) 7%, transparent)' },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 28%, transparent)',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--color-amber) 30%, transparent)',
    outline: 'none',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { minHeight: '14rem', maxHeight: '26rem' },
});

/** Colours for the parts of a program, from the theme. They replace CodeMirror's own, made for white only. */
const highlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.modifier],
    color: 'var(--color-code-keyword)',
  },
  { tag: [tags.typeName, tags.standard(tags.typeName)], color: 'var(--color-code-type)' },
  { tag: [tags.string, tags.character], color: 'var(--color-code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--color-code-number)' },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: 'var(--color-code-comment)',
    fontStyle: 'italic',
  },
  { tag: [tags.processingInstruction, tags.meta], color: 'var(--color-code-meta)' },
]);

/**
 * Text editor for Arduino code (CodeMirror 6). The editor owns the text while
 * the student types; `value` only replaces it when it changes from outside,
 * for example when a ready-made program is chosen.
 */
export default function CodeEditor(props: {
  value: string;
  onChange(value: string): void;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChange = useRef(props.onChange);
  onChange.current = props.onChange;

  useEffect(() => {
    const editor = new EditorView({
      doc: props.value,
      parent: host.current!,
      extensions: [
        basicSetup,
        cpp(),
        theme,
        syntaxHighlighting(highlight),
        EditorView.contentAttributes.of({ 'aria-label': props.label, 'data-testid': 'code' }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange.current(update.state.doc.toString());
        }),
      ],
    });
    view.current = editor;
    return () => editor.destroy();
    // The editor is created once; later `value` changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== props.value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: props.value } });
    }
  }, [props.value]);

  return <div ref={host} className="overflow-hidden rounded-xl border-2 border-line" />;
}
