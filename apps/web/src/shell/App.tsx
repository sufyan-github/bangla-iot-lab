import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router';
import { AccountPage } from '../account/AccountPage';
import { useAccount } from '../account/client';
import { EmailLinkPage, GuardianPage } from '../account/EmailLink';
import { HomePage } from '../home/HomePage';
import { useLocale, useT } from '../i18n';
import { THEME_ORDER, useTheme, type ThemeChoice } from '../theme';
import { LabPage } from '../lab/LabPage';
import { LessonsPage } from '../lessons/LessonsPage';
import { Esp32Page } from './Esp32Page';
import { LicencesPage } from './LicencesPage';
import { OwnerPage } from '../owner/OwnerPage';
import { useOnline } from './useOnline';

/** Sun for light, moon for dark, and a half-filled circle for following the device. */
function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      {choice === 'light' && (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </>
      )}
      {choice === 'dark' && <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />}
      {choice === 'system' && (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

function Header() {
  const { t, locale } = useT();
  const setLocale = useLocale((s) => s.setLocale);
  const theme = useTheme((s) => s.choice);
  const setTheme = useTheme((s) => s.setChoice);
  const online = useOnline();
  const me = useAccount((s) => s.me);
  const refresh = useAccount((s) => s.refresh);
  useEffect(() => void refresh(), [refresh]);
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  // The menu closes when a page is chosen.
  useEffect(() => setMenu(false), [pathname]);
  // In the lab on a phone, the lab's own bar (with its way back) takes this one's place.
  const inLab = pathname.startsWith('/lab/');
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center rounded-lg px-3 text-sm font-medium ${
      isActive ? 'bg-chalk/15 text-chalk' : 'text-chalk/75 hover:bg-chalk/10 hover:text-chalk'
    }`;
  const links = (
    <>
      <NavLink to="/" end className={link}>
        {t('nav.projects')}
      </NavLink>
      <NavLink to="/lessons" className={link} data-testid="nav-lessons">
        {t('nav.lessons')}
      </NavLink>
      <NavLink to="/licences" className={link} data-testid="nav-licences">
        {t('nav.licences')}
      </NavLink>
      {me?.user.platformRole === 'platform_admin' && (
        <NavLink to="/owner" className={link} data-testid="nav-owner">
          {t('nav.owner')}
        </NavLink>
      )}
    </>
  );

  return (
    <>
      <header className={`bg-mat-deep text-chalk ${inLab ? 'max-lg:hidden' : ''}`}>
        <div className="flex h-12 items-center gap-1 px-3">
          <NavLink to="/" className="mr-3 flex shrink-0 items-center gap-2 font-semibold">
            <img src="/favicon.svg" alt="" width={26} height={26} />
            <span className="text-lg max-[420px]:sr-only">{t('app.name')}</span>
          </NavLink>
          {!menu && <nav className="hidden gap-0.5 md:flex">{links}</nav>}
          <div className="ml-auto flex items-center gap-2">
            <NavLink
              to="/account"
              data-testid="nav-account"
              className={({ isActive }) =>
                `flex min-h-9 max-w-32 items-center gap-2 truncate rounded-full sm:max-w-40 border px-3 text-sm font-medium ${
                  isActive
                    ? 'border-chalk bg-chalk text-mat-deep'
                    : 'border-chalk/35 hover:bg-chalk/10'
                }`
              }
            >
              {me && (
                <span
                  aria-hidden
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber text-xs font-bold text-graphite"
                >
                  {[...me.user.displayName][0]}
                </span>
              )}
              <span className="truncate">{me ? me.user.displayName : t('nav.account')}</span>
            </NavLink>
            <button
              type="button"
              data-testid="language"
              lang={locale === 'bn' ? 'en' : 'bn'}
              aria-label={t('nav.language')}
              onClick={() => setLocale(locale === 'bn' ? 'en' : 'bn')}
              className="flex min-h-9 overflow-hidden rounded-full border border-chalk/35 text-xs font-semibold"
            >
              <span
                className={`grid place-items-center px-2.5 ${locale === 'bn' ? 'bg-chalk text-mat-deep' : ''}`}
              >
                বাং
              </span>
              <span
                className={`grid place-items-center px-2.5 ${locale === 'en' ? 'bg-chalk text-mat-deep' : ''}`}
              >
                EN
              </span>
            </button>
            <button
              type="button"
              data-testid="theme"
              data-theme-choice={theme}
              aria-label={t('nav.theme', { mode: t(`theme.${theme}`) })}
              title={t('nav.theme', { mode: t(`theme.${theme}`) })}
              onClick={() =>
                setTheme(THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]!)
              }
              className="grid h-9 w-9 place-items-center rounded-full border border-chalk/35 hover:bg-chalk/10"
            >
              <ThemeIcon choice={theme} />
            </button>
            <button
              type="button"
              data-testid="menu"
              aria-expanded={menu}
              aria-label={t('nav.menu')}
              onClick={() => setMenu(!menu)}
              className="grid h-11 w-11 place-items-center rounded-lg hover:bg-chalk/10 md:hidden"
            >
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                {menu ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>
        {menu && (
          <nav className="flex flex-col gap-0.5 border-t border-chalk/15 px-3 py-2 md:hidden">
            {links}
          </nav>
        )}
      </header>
      {/* Outside the header, so it shows in the lab on a phone too, where the header steps aside. */}
      {!online && (
        <p
          role="status"
          data-testid="offline-banner"
          className="bg-amber px-3 py-1 text-center text-sm font-medium text-graphite"
        >
          {t('status.offline')}
        </p>
      )}
    </>
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
          <Route path="/lessons" element={<LessonsPage />} />
          <Route path="/licences" element={<LicencesPage />} />
          <Route path="/esp32" element={<Esp32Page />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/owner" element={<OwnerPage />} />
          <Route path="/account/verify" element={<EmailLinkPage expected="verify-email" />} />
          <Route path="/account/approve" element={<EmailLinkPage expected="approve-learner" />} />
          <Route path="/account/reset" element={<EmailLinkPage expected="reset-password" />} />
          <Route path="/account/close" element={<EmailLinkPage expected="close-account" />} />
          <Route path="/account/guardian" element={<GuardianPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </div>
    </div>
  );
}
