import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, InlineError } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { lifespan, personName, pick } from '../../lib/format.js';

/** Search existing people and pick one (never create a duplicate record). */
export function PersonPicker({ value, onChange, excludeId, placeholder }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [text, setText] = useState('');
  const q = useDeferredValue(text.trim());
  const search = useQuery({ queryKey: ['people', q, 'picker'], queryFn: () => api.get('/people', { q, limit: 8 }), enabled: q.length >= 2 && !value });
  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-forest-300 bg-forest-50 px-3 py-2">
        <span><strong>{personName(value, lang)}</strong> <span className="text-sm text-muted">{lifespan(value, lang)}</span></span>
        <button type="button" className="text-sm text-forest-700 underline" onClick={() => onChange(null)}>{t('editor.change')}</button>
      </div>
    );
  }
  return (
    <div>
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder ?? t('editor.searchPerson')} aria-label={t('editor.searchPerson')} />
      <InlineError error={search.error} />
      {search.data && q.length >= 2 && (
        <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-white">
          {search.data.items.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t('families.noResults')}</li>}
          {search.data.items.filter((p) => p.id !== excludeId).map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onChange(p); setText(''); }} className="w-full px-3 py-2 text-left hover:bg-forest-50">
                <span className="font-medium">{personName(p, lang)}</span>
                <span className="ml-2 text-sm text-muted">{[lifespan(p, lang), pick(p.primary_family, 'name', lang)].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
