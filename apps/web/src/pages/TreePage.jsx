import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FamilyTree } from '../features/tree/FamilyTree.jsx';
import { api } from '../lib/api.js';
import { personName } from '../lib/format.js';

export default function TreePage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'ancestors' ? 'ancestors' : 'descendants';
  const depth = Math.min(10, Math.max(1, Number(params.get('depth')) || 4));
  const person = useQuery({ queryKey: ['person', id], queryFn: () => api.get(`/people/${id}`) });
  const name = personName(person.data?.person, i18n.language);
  const update = (patch) => setParams({ view, depth, ...patch }, { replace: true });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-paper-200/60 px-3 py-2">
        <Link to={`/people/${id}`} className="rounded-lg p-1.5 text-forest-800 hover:bg-forest-50" aria-label={t('common.back')}><ArrowLeft className="h-5 w-5" /></Link>
        <h1 className="truncate text-lg font-semibold text-forest-900">{t('tree.title', { name })}</h1>
      </div>
      <div className="min-h-0 flex-1">
        <FamilyTree key={id} personId={id} view={view} depth={depth} rootName={name} setView={(v) => update({ view: v })} setDepth={(d) => update({ depth: d })} />
      </div>
    </div>
  );
}
