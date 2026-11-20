import { cpp } from '@codemirror/lang-cpp';
import { EditorView, basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';

const theme = EditorView.theme({
  '&': { fontSize: '14px', backgroundColor: '#ffffff' },
  '.cm-content': {
    fontFamily: 'ui-monospace, "Cascadia Mono", Menlo, monospace',
    padding: '8px 0',
  },
  '.cm-gutters': { backgroundColor: '#f4f7f5', color: '#4b5d57', border: 'none' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { minHeight: '14rem', maxHeight: '26rem' },
});

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
