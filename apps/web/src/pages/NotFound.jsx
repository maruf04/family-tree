import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-3xl font-semibold text-forest-900">{t('notFound.title')}</h1>
      <p className="mt-2 text-muted">{t('notFound.text')}</p>
      <Link to="/" className="mt-6 inline-block rounded-lg bg-forest-700 px-5 py-2.5 text-paper">{t('nav.home')}</Link>
    </div>
  );
}
