import { BadgeCheck, GitBranch, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { lifespan, personName, pick } from '../lib/format.js';
import { cx } from './ui.jsx';

const SEX_TONE = { male: 'bg-river-100 text-river-600', female: 'bg-clay-100 text-clay-700', unknown: 'bg-paper-200 text-muted' };

export function Avatar({ person, size = 'md' }) {
  const { i18n } = useTranslation();
  const name = personName(person, i18n.language);
  const initial = [...(name || '?').replace(/^(মোঃ|মো\.|md\.?|মুন্সী|হাজী)\s*/i, '')][0] ?? '?';
  const sizes = { sm: 'h-8 w-8 text-sm', md: 'h-11 w-11 text-lg', lg: 'h-20 w-20 text-3xl' };
  return (
    <div className={cx('flex shrink-0 items-center justify-center rounded-full font-display font-semibold', SEX_TONE[person?.sex ?? 'unknown'], sizes[size])} aria-hidden>
      {initial}
    </div>
  );
}

export function VerifiedMark({ person }) {
  const { t } = useTranslation();
  if (person?.verification_status !== 'verified') return null;
  return <BadgeCheck className="h-4 w-4 shrink-0 text-forest-600" aria-label={t('person.verified')} />;
}

/** Compact person row used in lists. */
export function PersonCard({ person, subtitle, right, className }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  if (!person) return null;
  return (
    <div className={cx('flex items-center gap-3 rounded-xl border border-line bg-white/70 p-3 transition-colors hover:border-forest-300', className)}>
      <Avatar person={person} />
      <div className="min-w-0 flex-1">
        <Link to={`/people/${person.id}`} className="flex items-center gap-1 font-medium text-forest-900 hover:underline">
          <span className="truncate">{personName(person, lang)}</span>
          <VerifiedMark person={person} />
          {person.redacted && <Lock className="h-3.5 w-3.5 shrink-0 text-muted" aria-label={t('person.privateNotice')} />}
        </Link>
        <div className="truncate text-sm text-muted">
          {[subtitle, lifespan(person, lang), pick(person.primary_family, 'name', lang)].filter(Boolean).join(' · ')}
        </div>
      </div>
      {right}
      <Link to={`/people/${person.id}/tree`} className="rounded-lg p-2 text-forest-700 hover:bg-forest-50" title={t('person.viewTree')} aria-label={t('person.viewTree')}>
        <GitBranch className="h-4 w-4" />
      </Link>
    </div>
  );
}
