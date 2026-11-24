import { useQuery } from '@tanstack/react-query';
import { GitBranch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { PersonCard } from '../components/PersonCard.jsx';
import { PageHeader, QueryState, Section, Stat } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { num, pick, year } from '../lib/format.js';

export default function FamilyDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const family = useQuery({ queryKey: ['family', id], queryFn: () => api.get(`/families/${id}`) });
  const members = useQuery({ queryKey: ['family-members', id], queryFn: () => api.get(`/families/${id}/members`) });
  return (
    <QueryState query={family}>
      {(f) => (
        <>
          <PageHeader title={pick(f, 'name', lang)} subtitle={pick(f, 'homestead_name', lang)}
            actions={<Link to={`/people/${f.root_person_id}/tree?depth=6`} className="inline-flex items-center gap-2 rounded-lg bg-forest-700 px-4 py-2 font-medium text-paper hover:bg-forest-800"><GitBranch className="h-4 w-4" />{t('families.viewTree')}</Link>} />
          <div className="mx-auto max-w-6xl space-y-10 px-4 py-8">
            <div className="grid grid-cols-3 gap-3">
              <Stat value={num(f.member_count, lang)} label={t('families.members')} />
              <Stat value={num(f.generations, lang)} label={t('families.generations')} />
              <Stat value={f.earliest_year ? year(f.earliest_year, lang) : '—'} label={t('families.earliest')} />
            </div>
            {pick(f, 'description', lang) && <p className="max-w-3xl whitespace-pre-line">{pick(f, 'description', lang)}</p>}
            <div className="grid gap-8 md:grid-cols-2">
              <Section title={t('families.root')}><PersonCard person={f.root_person} /></Section>
              {(f.parent_family || f.branches.length > 0) && (
                <Section title={f.parent_family ? t('families.partOf') : t('families.branches')}>
                  <ul className="space-y-1">{[f.parent_family, ...f.branches].filter(Boolean).map((b) => <li key={b.id}><Link className="text-forest-700 hover:underline" to={`/families/${b.id}`}>{pick(b, 'name', lang)}</Link></li>)}</ul>
                </Section>
              )}
            </div>
            <Section title={t('families.members')}>
              <QueryState query={members}>
                {({ items }) => <div className="grid gap-3 md:grid-cols-2">{items.map((m) => <PersonCard key={m.person.id} person={m.person} subtitle={t(`families.membership.${m.membership_type}`)} />)}</div>}
              </QueryState>
            </Section>
          </div>
        </>
      )}
    </QueryState>
  );
}
