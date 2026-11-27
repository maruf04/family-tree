import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { PageHeader } from '../components/ui.jsx';
import { ChangePassword } from '../features/account/ChangePassword.jsx';
import { pick } from '../lib/format.js';

export default function Account() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  return (
    <>
      <PageHeader title={t('account.title')} subtitle={[pick(auth.user, 'display_name', i18n.language), auth.user?.username ?? auth.user?.email].filter(Boolean).join(' · ')} />
      <div className="space-y-6 px-4 py-8">
        {auth.person && <p className="text-center"><Link className="text-forest-700 underline" to={`/people/${auth.person.id}`}>{t('nav.myProfile')}</Link></p>}
        <ChangePassword />
      </div>
    </>
  );
}
