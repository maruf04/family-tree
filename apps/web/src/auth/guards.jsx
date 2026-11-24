import { Lock, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Spinner } from '../components/ui.jsx';
import { useAuth } from './AuthProvider.jsx';

function Gate({ icon: Icon, title, text, to, cta }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <Icon className="mx-auto h-10 w-10 text-forest-500" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold text-forest-900">{title}</h1>
      {text && <p className="mt-2 text-muted">{text}</p>}
      {to && <Link to={to} className="mt-6 inline-block rounded-lg bg-forest-700 px-5 py-2.5 font-medium text-paper hover:bg-forest-800">{cta}</Link>}
    </div>
  );
}

/** Content for verified village members only (the platform is private). */
export function RequireMember({ children }) {
  const { t } = useTranslation();
  const auth = useAuth();
  if (!auth.ready) return <Spinner />;
  if (!auth.signedIn) return <Gate icon={Lock} title={t('auth.membersOnly')} text={t('auth.loginIntro')} to="/login" cta={t('nav.login')} />;
  if (!auth.verified) return <Gate icon={ShieldCheck} title={t('auth.verifyTitle')} text={t('errors.verification_required')} to="/verify" cta={t('auth.verifyTitle')} />;
  return children;
}

export function RequireModerator({ children }) {
  const { t } = useTranslation();
  const auth = useAuth();
  return (
    <RequireMember>
      {auth.isModerator ? children : <Gate icon={Lock} title={t('errors.moderator_only')} />}
    </RequireMember>
  );
}
