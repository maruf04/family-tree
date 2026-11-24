import { useTranslation } from 'react-i18next';
import { Input, Select } from './ui.jsx';

// Edits a fuzzy date ({qualifier, year, month, day, year_to}) or null = unknown.
// Month and day stay empty unless actually known.
export function FuzzyDateInput({ value, onChange }) {
  const { t } = useTranslation();
  const q = value?.qualifier ?? '';
  const set = (patch) => onChange({ ...value, ...patch });
  const intOrNull = (e) => (e.target.value === '' ? null : Number(e.target.value));
  return (
    <div className="flex flex-wrap gap-2">
      <div className="w-36">
        <Select aria-label={t('common.date')} value={q}
          onChange={(e) => onChange(e.target.value ? { qualifier: e.target.value, year: value?.year ?? null, ...(e.target.value === 'exact' ? { month: value?.month ?? null, day: value?.day ?? null } : {}) } : null)}
          options={[{ value: '', label: t('date.unknown') }, ...['exact', 'about', 'before', 'after', 'between'].map((v) => ({ value: v, label: t(`date.${v}`) }))]} />
      </div>
      {q && <div className="w-24"><Input type="number" min="1000" max="2200" placeholder={t('date.year')} aria-label={t('date.year')} value={value.year ?? ''} onChange={(e) => set({ year: intOrNull(e) })} /></div>}
      {q === 'exact' && <div className="w-20"><Input type="number" min="1" max="12" placeholder={t('date.month')} aria-label={t('date.month')} value={value.month ?? ''} onChange={(e) => set({ month: intOrNull(e) })} /></div>}
      {q === 'exact' && <div className="w-20"><Input type="number" min="1" max="31" placeholder={t('date.day')} aria-label={t('date.day')} value={value.day ?? ''} onChange={(e) => set({ day: intOrNull(e) })} /></div>}
      {q === 'between' && <div className="w-24"><Input type="number" min="1000" max="2200" placeholder={t('date.yearTo')} aria-label={t('date.yearTo')} value={value.year_to ?? ''} onChange={(e) => set({ year_to: intOrNull(e) })} /></div>}
    </div>
  );
}

/** A date with a qualifier but no year counts as unknown. */
export const cleanFuzzyDate = (v) => (v?.year ? v : null);
