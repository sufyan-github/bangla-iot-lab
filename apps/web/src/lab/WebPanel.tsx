import type { MessageKey } from '@banglalab/i18n';
import type { HttpResponse } from '@banglalab/simulation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { simulation } from '../sim/client';
import { useT } from '../i18n';
import { useLab } from './store';

/**
 * Nothing in a page from the board may reach anywhere: no scripts, no requests
 * to other sites (a student's page could name any address), only its own
 * styles and pictures written into it.
 */
const PAGE_POLICY =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:"><base target="_blank">';

/** A link or a simple form on the page, which the panel offers as a button. */
interface PageAction {
  label: string;
  path: string;
  /** For a form: the names of its fields, filled in before it is sent. */
  fields?: string[];
}

/** The page's links to its own board, and its forms that send with GET. Nothing is run. */
function actionsOf(page: HttpResponse): PageAction[] {
  if (!page.type.startsWith('text/html')) return [];
  const document = new DOMParser().parseFromString(page.body, 'text/html');
  const local = (href: string | null) =>
    href !== null && !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('//');
  const actions: PageAction[] = [];
  for (const link of document.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href');
    if (local(href)) {
      actions.push({
        label: link.textContent?.trim() || href!,
        path: href!.startsWith('/') ? href! : `/${href}`,
      });
    }
  }
  for (const form of document.querySelectorAll('form')) {
    const method = (form.getAttribute('method') ?? 'get').toLowerCase();
    const action = form.getAttribute('action') ?? page.path.split('?')[0]!;
    if (method !== 'get' || !local(action)) continue;
    const fields = [...form.querySelectorAll('input[name], select[name], textarea[name]')]
      .filter((input) => !['submit', 'button'].includes(input.getAttribute('type') ?? ''))
      .map((input) => input.getAttribute('name')!);
    const submit = form.querySelector('[type=submit], button');
    actions.push({
      label: submit?.textContent?.trim() || submit?.getAttribute('value') || action,
      path: action.startsWith('/') ? action : `/${action}`,
      fields,
    });
  }
  return actions.slice(0, 20);
}

function FormAction({ action, onSend }: { action: PageAction; onSend: (path: string) => void }) {
  const { t } = useT();
  const [values, setValues] = useState<Record<string, string>>({});
  const send = (event: FormEvent) => {
    event.preventDefault();
    const query = new URLSearchParams(action.fields!.map((name) => [name, values[name] ?? '']));
    onSend(`${action.path}?${query.toString()}`);
  };
  return (
    <form
      onSubmit={send}
      className="space-y-1.5 rounded-lg border border-line p-2"
      data-testid="web-form"
    >
      {action.fields!.map((name) => (
        <label key={name} className="flex items-center gap-2 text-sm">
          <span className="min-w-16 text-ink-soft">{name}</span>
          <input
            value={values[name] ?? ''}
            onChange={(event) => setValues({ ...values, [name]: event.target.value })}
            className="field min-h-10 flex-1"
          />
        </label>
      ))}
      <button type="submit" className="btn btn-secondary min-h-10 text-sm">
        {action.label || t('web.send')}
      </button>
    </form>
  );
}

/**
 * The lab's browser: asks an ESP32's own web server for a page and shows it.
 * There is no real network; the request goes to the board's program.
 */
export function WebPanel({ boardId }: { boardId: string }) {
  const running = useLab((s) => s.running);
  const page = useLab((s) => s.pages[boardId]);
  const { t } = useT();
  const [path, setPath] = useState('/');
  const [waiting, setWaiting] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const open = async (target: string) => {
    const wanted = target.startsWith('/') ? target : `/${target}`;
    setPath(wanted);
    const sent = await simulation().request(boardId, wanted);
    if (typeof sent === 'number') {
      setWaiting(sent);
      setProblem(null);
    } else {
      setWaiting(null);
      setProblem(sent);
    }
  };

  // An answer has come for the request sent; a redirect is followed once.
  const answered = page !== undefined && page.id === waiting;
  useEffect(() => {
    if (!answered) return;
    setWaiting(null);
    const location = page.headers.Location ?? page.headers.location;
    if (page.status >= 300 && page.status < 400 && location?.startsWith('/')) void open(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered]);

  const actions = useMemo(() => (page ? actionsOf(page) : []), [page]);

  if (!running) return <p className="px-4 py-4 text-sm text-ink-soft">{t('web.idle')}</p>;

  return (
    <div className="space-y-3 px-4 py-4" data-testid="web-panel">
      <p className="text-sm text-ink-soft">{t('web.about')}</p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void open(path);
        }}
      >
        <label className="field flex min-w-0 flex-1 items-center px-2">
          <span className="shrink-0 text-sm text-ink-soft">http://{boardId}</span>
          <input
            data-testid="web-address"
            aria-label={t('web.address')}
            value={path}
            onChange={(event) => setPath(event.target.value)}
            className="min-h-11 min-w-0 flex-1 bg-transparent px-1"
          />
        </label>
        <button type="submit" data-testid="web-go" className="btn btn-primary">
          {t('web.go')}
        </button>
      </form>
      {problem && (
        <p role="alert" className="text-sm font-medium text-danger" data-testid="web-problem">
          {t(`web.error.${problem}` as MessageKey)}
        </p>
      )}
      {waiting !== null && <p className="text-sm text-ink-soft">{t('web.waiting')}</p>}
      {page && (
        <section data-testid="web-page" data-status={page.status}>
          <p className="mb-1.5 text-sm text-ink-soft">
            {page.status === 0
              ? t('web.noAnswer', { path: page.path })
              : t('web.status', { status: page.status, path: page.path })}
          </p>
          {page.type.startsWith('text/html') ? (
            <>
              <div
                className="flex items-center gap-2 rounded-t-[var(--radius-card)] bg-line px-3 py-1.5"
                aria-hidden
              >
                <span className="h-2.5 w-2.5 rounded-full bg-paper" />
                <span className="truncate font-mono text-xs text-ink-soft">
                  http://{boardId}
                  {page.path}
                </span>
              </div>
              <iframe
                title={t('web.page')}
                sandbox=""
                srcDoc={PAGE_POLICY + page.body}
                className="h-72 w-full rounded-b-[var(--radius-card)] border-2 border-t-0 border-line bg-white"
              />
            </>
          ) : (
            page.status !== 0 && (
              <pre className="max-h-72 overflow-auto rounded-lg border-2 border-line bg-paper p-2 text-sm whitespace-pre-wrap">
                {page.body}
              </pre>
            )
          )}
          {actions.length > 0 && (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-ink-soft">{t('web.actions')}</p>
              <div className="flex flex-wrap gap-1.5" data-testid="web-links">
                {actions
                  .filter((action) => !action.fields)
                  .map((action, i) => (
                    <button
                      key={`${action.path}-${i}`}
                      type="button"
                      onClick={() => void open(action.path)}
                      className="chip"
                    >
                      {action.label}
                    </button>
                  ))}
              </div>
              {actions
                .filter((action) => action.fields)
                .map((action, i) => (
                  <FormAction
                    key={`${action.path}-${i}`}
                    action={action}
                    onSend={(target) => void open(target)}
                  />
                ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
