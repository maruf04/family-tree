import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronDown, Languages, LogOut, Menu, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { api } from '../lib/api.js';
import { num, pick } from '../lib/format.js';
import { Badge, cx } from './ui.jsx';

const NAV = [
  ['/', 'nav.home'], ['/history', 'nav.history'], ['/families', 'nav.families'],
  ['/directory', 'nav.directory'], ['/community', 'nav.community'], ['/affairs', 'nav.affairs'],
];

function Logo() {
  const { t } = useTranslation();
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" className="h-9 w-9" />
      <span className="font-display text-lg font-semibold leading-tight text-forest-900">{t('app.name')}</span>
    </Link>
  );
}

function LanguageToggle() {
  const { t, i18n } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => i18n.changeLanguage(i18n.language === 'bn' ? 'en' : 'bn')}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm font-medium text-forest-800 hover:bg-forest-50"
      aria-label="Change language / ভাষা পরিবর্তন"
    >
      <Languages className="h-4 w-4" aria-hidden />{t('nav.language')}
    </button>
  );
}

function UserMenu() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const summary = useQuery({ queryKey: ['admin-summary'], queryFn: () => api.get('/admin/summary'), enabled: auth.isModerator, refetchInterval: 60_000 });
  const pendingTotal = summary.data ? summary.data.pending_proposals + summary.data.pending_news + summary.data.open_reports + summary.data.pending_verifications : 0;

  if (!auth.signedIn) {
    return <Link to="/login" className="rounded-lg bg-forest-700 px-4 py-2 text-sm font-medium text-paper hover:bg-forest-800">{t('nav.login')}</Link>;
  }
  const name = pick(auth.user, 'display_name', i18n.language) || '…';
  const unread = auth.user?.unread_notifications ?? 0;
  return (
    <div className="flex items-center gap-1" ref={ref}>
      <Link to="/notifications" className="relative rounded-lg p-2 text-forest-800 hover:bg-forest-50" aria-label={t('nav.notifications')}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-clay-600" />}
      </Link>
      <div className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-forest-50" aria-expanded={open}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest-100 font-display text-forest-800">{[...name][0]}</span>
          <span className="hidden max-w-[120px] truncate text-sm font-medium lg:inline">{name}</span>
          {pendingTotal > 0 && <span className="rounded-full bg-clay-600 px-1.5 text-xs text-white">{num(pendingTotal, i18n.language)}</span>}
          <ChevronDown className="h-4 w-4 text-muted" />
        </button>
        {open && (
          <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-paper py-1 shadow-xl">
            <div className="border-b border-line px-4 py-2">
              <div className="truncate font-medium">{name}</div>
              <Badge tone={auth.isAdmin ? 'gold' : auth.isModerator ? 'river' : 'green'}>{t(`admin.roles.${auth.user?.role ?? 'member'}`)}</Badge>
              {!auth.verified && <Badge tone="clay" className="ml-1">{t(`admin.membership.${auth.user?.membership_status ?? 'pending'}`)}</Badge>}
            </div>
            {auth.person && <Link to={`/people/${auth.person.id}`} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-forest-50"><UserRound className="h-4 w-4" />{t('nav.myProfile')}</Link>}
            {!auth.verified && <Link to="/verify" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-forest-50"><ShieldCheck className="h-4 w-4" />{t('auth.verifyTitle')}</Link>}
            {auth.verified && <Link to="/proposals" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-forest-50"><Sparkles className="h-4 w-4" />{t('nav.proposals')}</Link>}
            {auth.isModerator && (
              <Link to="/moderation" className="flex items-center justify-between px-4 py-2 text-sm hover:bg-forest-50">
                <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />{t('nav.moderation')}</span>
                {pendingTotal > 0 && <span className="rounded-full bg-clay-600 px-1.5 text-xs text-white">{num(pendingTotal, i18n.language)}</span>}
              </Link>
            )}
            {auth.isModerator && <Link to="/admin" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-forest-50"><ShieldCheck className="h-4 w-4" />{t('nav.admin')}</Link>}
            <button type="button" onClick={auth.signOut} className="flex w-full items-center gap-2 border-t border-line px-4 py-2 text-left text-sm text-clay-700 hover:bg-clay-100/50"><LogOut className="h-4 w-4" />{t('nav.logout')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function SampleBanner() {
  const { t } = useTranslation();
  const home = useQuery({ queryKey: ['home-village'], queryFn: () => api.get('/home'), staleTime: 300_000 });
  if (!/sample/i.test(home.data?.village?.name_en ?? '')) return null;
  return <div className="bg-turmeric-100 px-4 py-1.5 text-center text-xs text-turmeric-600">{t('common.fictional')}</div>;
}

export function Layout() {
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setMobileOpen(false); window.scrollTo(0, 0); }, [location.pathname]);
  const fullBleed = /\/tree$/.test(location.pathname);

  const linkClass = ({ isActive }) => cx('rounded-lg px-3 py-2 text-[15px] font-medium transition-colors',
    isActive ? 'bg-forest-100 text-forest-900' : 'text-ink/80 hover:bg-forest-50 hover:text-forest-900');

  return (
    <div className="flex min-h-screen flex-col">
      <SampleBanner />
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Logo />
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="primary">
            {NAV.map(([to, key]) => <NavLink key={to} to={to} end={to === '/'} className={linkClass}>{t(key)}</NavLink>)}
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block"><LanguageToggle /></div>
            <UserMenu />
            <button type="button" className="rounded-lg p-2 lg:hidden" onClick={() => setMobileOpen((o) => !o)} aria-label={t('nav.menu')} aria-expanded={mobileOpen}>
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="border-t border-line bg-paper px-4 py-3 lg:hidden" aria-label="mobile">
            <div className="grid gap-1">
              {NAV.map(([to, key]) => <NavLink key={to} to={to} end={to === '/'} className={linkClass}>{t(key)}</NavLink>)}
            </div>
            <div className="mt-3"><LanguageToggle /></div>
          </nav>
        )}
      </header>

      <main className={cx('flex-1', fullBleed && 'flex flex-col')}><Outlet /></main>

      {!fullBleed && (
        <footer className="mt-16 border-t border-line bg-forest-900 text-forest-100 nakshi">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-3">
            <div>
              <div className="font-display text-lg text-paper">{t('app.name')}</div>
              <p className="mt-1 text-sm text-forest-300">{t('app.tagline')}</p>
            </div>
            <nav className="grid grid-cols-2 gap-1 text-sm">
              {NAV.map(([to, key]) => <Link key={to} to={to} className="text-forest-100 hover:text-paper">{t(key)}</Link>)}
            </nav>
            <p className="text-sm text-forest-300">{t('common.fictional')}</p>
          </div>
        </footer>
      )}
    </div>
  );
}
