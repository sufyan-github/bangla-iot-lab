import { NavLink, Route, Routes } from 'react-router';
import { HomePage } from '../home/HomePage';
import { useLocale, useT } from '../i18n';
import { LabPage } from '../lab/LabPage';
import { useOnline } from './useOnline';

function Header() {
  const { t, locale } = useT();
  const setLocale = useLocale((s) => s.setLocale);
  const online = useOnline();
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 font-medium ${isActive ? 'bg-paper/15 text-paper' : 'text-paper/80 hover:text-paper'}`;

  return (
    <header className="bg-mat-deep text-paper">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
        <NavLink to="/" className="mr-2 flex items-center gap-2 py-1 text-xl font-semibold">
          <img src="/favicon.svg" alt="" width={32} height={32} />
          {t('app.name')}
        </NavLink>
        <nav className="flex gap-1">
          <NavLink to="/" end className={link}>
            {t('nav.projects')}
          </NavLink>
        </nav>
        <button
          type="button"
          data-testid="language"
          lang={locale === 'bn' ? 'en' : 'bn'}
          onClick={() => setLocale(locale === 'bn' ? 'en' : 'bn')}
          className="ml-auto min-h-11 rounded-lg border border-paper/40 px-3 font-medium hover:bg-paper/10"
        >
          {t('nav.language')}
        </button>
      </div>
      {!online && (
        <p
          role="status"
          data-testid="offline-banner"
          className="bg-amber px-3 py-1 text-center text-sm font-medium text-ink"
        >
          {t('status.offline')}
        </p>
      )}
    </header>
  );
}

export function App() {
  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/lab/:projectId" element={<LabPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </div>
    </div>
  );
}
