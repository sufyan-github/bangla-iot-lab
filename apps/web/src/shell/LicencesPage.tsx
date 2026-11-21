import { useT } from '../i18n';

const REPOSITORY = 'https://github.com/sufyan-github/bangla-iot-lab';

/** What the application distributes besides its own code, and under which licence. */
const NOTICES = [
  {
    id: 'app',
    name: 'বাংলা IoT ল্যাব (Bangla IoT Lab)',
    licence: 'Apache-2.0',
    text: 'Copyright 2026 Md Abu Sufyan. The original code of this application.',
    file: 'LICENSE.txt',
    source: REPOSITORY,
  },
  {
    id: 'firmware',
    name: 'Starter firmware for the UNO-compatible board',
    licence: 'LGPL-2.1-or-later',
    text: 'The ready-made programs are compiled from sketches written for this project together with ArduinoCore-avr 1.8.8, and the Servo 1.3.0 and LiquidCrystal 1.0.7 libraries, Copyright Arduino LLC and contributors. Their complete source, and how to rebuild or relink the firmware, is in the repository.',
    file: 'LGPL-2.1.txt',
    source: `${REPOSITORY}/tree/main/third_party/arduino-avr`,
  },
  {
    id: 'avr-libc',
    name: 'avr-libc',
    licence: 'BSD-style',
    text: 'The C library linked into the starter firmware.',
    file: 'avr-libc.txt',
    source: 'https://github.com/avrdudes/avr-libc',
  },
  {
    id: 'font',
    name: 'Anek Bangla',
    licence: 'SIL Open Font License 1.1',
    text: 'Copyright 2021 The Anek Project Authors. The typeface used throughout.',
    file: 'OFL-1.1-AnekBangla.txt',
    source: 'https://github.com/EkType/Anek',
  },
] as const;

export function LicencesPage() {
  const { t } = useT();
  return (
    <main className="mx-auto max-w-3xl px-4 py-8" data-testid="licences">
      <h1 className="text-3xl font-semibold">{t('licences.title')}</h1>
      <p className="mt-3 text-ink-soft">{t('licences.intro')}</p>
      <p className="mt-2 text-ink-soft">{t('licences.replace')}</p>

      <ul className="mt-6 space-y-4" lang="en">
        {NOTICES.map((notice) => (
          <li
            key={notice.id}
            data-notice={notice.id}
            className="rounded-xl border border-line bg-surface p-4"
          >
            <h2 className="text-lg font-semibold">{notice.name}</h2>
            <p className="text-sm font-medium text-amber-deep">{notice.licence}</p>
            <p className="mt-2 text-sm">{notice.text}</p>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
              <a className="text-mat underline" href={`/licences/${notice.file}`}>
                {notice.file}
              </a>
              <a className="text-mat underline" href={notice.source} rel="noreferrer">
                {t('licences.source')}
              </a>
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-sm">
        <a
          className="font-medium text-mat underline"
          href="/licences/THIRD_PARTY_LICENSES.md"
          data-testid="licences-full"
        >
          {t('licences.fullList')}
        </a>
      </p>
      <p className="mt-4 text-sm text-ink-soft" lang="en">
        Arduino and UNO are trademarks of Arduino S.r.l. This project is not affiliated with or
        endorsed by Arduino, or by any parts supplier. Product names are used only to say what the
        software is compatible with.
      </p>
    </main>
  );
}
