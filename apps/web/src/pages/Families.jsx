import { useQuery } from '@tanstack/react-query';
import { GitBranch, Search, Users } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { PersonCard } from '../components/PersonCard.jsx';
import { Card, EmptyState, Input, PageHeader, QueryState, Tabs } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { num, personName, pick } from '../lib/format.js';

function FamilyList({ q }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const query = useQuery({ queryKey: ['families', q], queryFn: () => api.get('/families', { q }) });
  return (
    <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title={t('families.noResults')} />}>
      {({ items }) => (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((f) => (
            <Card key={f.id} className="flex flex-col p-6 transition-colors hover:border-forest-300">
              <Link to={`/families/${f.id}`} className="text-xl font-semibold text-forest-900 hover:underline font-display">{pick(f, 'name', lang)}</Link>
              <p className="text-muted">{pick(f, 'homestead_name', lang)}</p>
              <dl className="mt-3 flex-1 space-y-1 text-sm">
                <div><dt className="inline text-muted">{t('families.root')}: </dt><dd className="inline"><Link className="text-forest-700 hover:underline" to={`/people/${f.root_person_id}`}>{personName(f.root_person, lang)}</Link></dd></div>
                <div className="inline-flex items-center gap-1 text-muted"><Users className="h-4 w-4" />{num(f.member_count, lang)} {t('families.members')}</div>
              </dl>
              <Link to={`/people/${f.root_person_id}/tree?depth=6`} className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg bg-forest-700 px-4 py-2 text-sm font-medium text-paper hover:bg-forest-800"><GitBranch className="h-4 w-4" />{t('families.viewTree')}</Link>
            </Card>
          ))}
        </div>
      )}
    </QueryState>
  );
}

function PeopleList({ q }) {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ['people', q], queryFn: () => api.get('/people', { q, limit: 60 }) });
  return (
    <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title={t('families.noResults')} />}>
      {({ items }) => <div className="grid gap-3 md:grid-cols-2">{items.map((p) => <PersonCard key={p.id} person={p} />)}</div>}
    </QueryState>
  );
}

export default function Families() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'families';
  const [text, setText] = useState('');
  const q = useDeferredValue(text.trim());
  return (
    <>
      <PageHeader title={t('families.title')} subtitle={t('families.subtitle')}>
        <Tabs value={tab} onChange={(v) => { setText(''); setParams({ tab: v }); }} tabs={[{ value: 'families', label: t('families.tabFamilies') }, { value: 'people', label: t('families.tabPeople') }]} />
      </PageHeader>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <label className="relative block max-w-md">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" aria-hidden />
          <Input style={{ paddingLeft: '2.25rem' }} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('common.search')} placeholder={t(tab === 'people' ? 'families.searchPeople' : 'families.searchFamilies')} />
        </label>
        {tab === 'people' ? <PeopleList q={q} /> : <FamilyList q={q} />}
      </div>
    </>
  );
}
