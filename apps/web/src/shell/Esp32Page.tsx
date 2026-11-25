import type { MessageKey } from '@banglalab/i18n';
import { useT } from '../i18n';
import { PageBand } from './PageBand';

const STUDY =
  'https://github.com/sufyan-github/bangla-iot-lab/blob/main/docs/decisions/esp32-study.md';

const keys = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${prefix}.${i + 1}` as MessageKey);

function List({ items, mark }: { items: MessageKey[]; mark: string }) {
  const { t } = useT();
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span aria-hidden="true" className="w-4 shrink-0 font-semibold text-accent">
            {mark}
          </span>
          <span>{t(item)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * What the ESP32 board in the lab is and is not: how it runs a program, what
 * works, where it differs from a real board, and what has been measured. The
 * board is an experiment, and this page is where the lab says so in full.
 */
export function Esp32Page() {
  const { t } = useT();
  const section = 'mt-8 rounded-[var(--radius-card)] border border-line bg-surface p-5';
  const heading = 'text-xl font-semibold';
  return (
    <main className="flex-1" data-testid="esp32-page">
      <PageBand title={t('esp32.title')} intro={t('esp32.intro')} />
      <div className="mx-auto max-w-3xl px-4 pb-8">
        <section className={section}>
          <h2 className={heading}>{t('esp32.how.title')}</h2>
          <p className="mt-3">{t('esp32.how.body')}</p>
        </section>

        <div className="grid gap-x-6 sm:grid-cols-2">
          <section className={section}>
            <h2 className={heading}>{t('esp32.works.title')}</h2>
            <List items={keys('esp32.works', 12)} mark="✓" />
          </section>
          <section className={section}>
            <h2 className={heading}>{t('esp32.missing.title')}</h2>
            <List items={keys('esp32.missing', 3)} mark="–" />
            <p className="mt-3 text-sm text-ink-soft">{t('esp32.missing.note')}</p>
          </section>
        </div>

        <section className={section}>
          <h2 className={heading}>{t('esp32.differs.title')}</h2>
          <List items={keys('esp32.differs', 5)} mark="≠" />
        </section>

        <section className={section} data-testid="esp32-measured">
          <h2 className={heading}>{t('esp32.measured.title')}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t('esp32.date')}</p>
          <dl className="mt-3 divide-y divide-line">
            {keys('esp32.measured', 5).map((row, index) => (
              <div key={row} className="grid gap-1 py-2.5 sm:grid-cols-[1fr_auto] sm:gap-6">
                <dt>{t(row)}</dt>
                <dd
                  className={
                    index >= 3 ? 'font-semibold text-amber-deep' : 'font-semibold sm:text-right'
                  }
                >
                  {t(`${row}.value` as MessageKey)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-ink-soft">{t('esp32.measured.note')}</p>
        </section>

        <section className={section}>
          <h2 className={heading}>{t('esp32.other.title')}</h2>
          <p className="mt-3">{t('esp32.other.body')}</p>
        </section>

        <p className="mt-6">
          <a className="font-medium text-accent underline" href={STUDY} rel="noreferrer">
            {t('esp32.full')}
          </a>
        </p>
      </div>
    </main>
  );
}
