import { useQuery } from '@tanstack/react-query';
import { GitBranch, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Avatar, PersonCard } from '../components/PersonCard.jsx';
import { Badge, Button, Card, EmptyState, QueryState, Section } from '../components/ui.jsx';
import { PersonEditor } from '../features/person/PersonEditor.jsx';
import { RelationshipFinder } from '../features/person/RelationshipFinder.jsx';
import { UNION_COLORS } from '../features/tree/layout.js';
import { api } from '../lib/api.js';
import { fuzzyDate, lifespan, ordinal, personName, pick } from '../lib/format.js';

const REL_LABEL = { adoptive: 'person.adopted', foster: 'person.foster' };

function IconButton({ icon: Icon, label, onClick }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} className="rounded-lg p-1.5 text-muted hover:bg-paper-200 hover:text-forest-800"><Icon className="h-4 w-4" /></button>;
}

function MarriageHeading({ marriage, spouse, index, lang, t, onEdit }) {
  const role = marriage?.order_for_person
    ? t(spouse?.sex === 'female' ? 'person.wifeN' : spouse?.sex === 'male' ? 'person.husbandN' : 'person.spouseN', { n: ordinal(marriage.order_for_person, lang) })
    : null;
  const info = marriage ? [
    role,
    marriage.start_date && `${t('person.married')}: ${fuzzyDate(marriage.start_date, lang)}`,
    marriage.end_date && `${t('person.ended')}: ${fuzzyDate(marriage.end_date, lang)}`,
  ] : [t('person.noMarriageRecord')];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
      <span className="h-3 w-3 rounded-full" style={{ background: UNION_COLORS[index % UNION_COLORS.length] }} aria-hidden />
      <span>{info.filter(Boolean).join(' · ')}</span>
      {marriage && <Badge tone={['divorced', 'annulled', 'separated'].includes(marriage.status) ? 'clay' : marriage.status === 'ongoing' ? 'green' : 'gray'}>{t(`person.marriageStatus.${marriage.status}`)}</Badge>}
      {marriage && <IconButton icon={Pencil} label={t('editor.editMarriage')} onClick={onEdit} />}
    </div>
  );
}

export default function Person() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const auth = useAuth();
  const [editor, setEditor] = useState(null);
  const query = useQuery({ queryKey: ['person', id], queryFn: () => api.get(`/people/${id}`) });

  return (
    <QueryState query={query}>
      {(profile) => {
        const { person: p, married_in: marriedIn, parents, siblings, spouses, children_by_spouse: groups, families, sources } = profile;
        // A remarried couple has several marriages but one family group.
        const marriagesOf = (spouseId) => spouses.filter((s) => s.spouse.id === spouseId);
        // People who married in have a simple profile: general facts, spouse, children and tree.
        const places = marriedIn ? [] : [
          ['person.birthPlace', pick(p, 'birth_place', lang)], ['person.deathPlace', pick(p, 'death_place', lang)],
          ['person.burialPlace', pick(p, 'burial_place', lang)],
        ];
        const facts = [
          ['person.born', fuzzyDate(p.birth, lang)], ['person.died', fuzzyDate(p.death, lang)], ...places, ['person.occupation', pick(p, 'occupation', lang)],
          ['person.nickname', pick(p, 'nickname', lang)],
        ].filter(([, v]) => v);
        return (
          <>
            <header className="border-b border-line bg-paper-200/60 nakshi">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-5 px-4 py-8">
                <Avatar person={p} size="lg" />
                <div className="min-w-[200px] flex-1">
                  <h1 className="text-3xl font-semibold text-forest-900">{personName(p, lang)}</h1>
                  <p className="text-muted">{[lifespan(p, lang), t(`person.living.${p.living_status}`)].filter(Boolean).join(' · ')}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={p.verification_status === 'verified' ? 'green' : p.verification_status === 'disputed' ? 'clay' : 'gray'}>{t(`person.${p.verification_status}`)}</Badge>
                    {families.map((f) => <Link key={f.id} to={`/families/${f.id}`}><Badge tone="gold">{pick(f, 'name', lang)} · {t(`families.membership.${f.membership_type}`)}</Badge></Link>)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to={`/people/${id}/tree?view=descendants`} className="inline-flex items-center gap-2 rounded-lg bg-forest-700 px-4 py-2 font-medium text-paper hover:bg-forest-800"><GitBranch className="h-4 w-4" />{t(marriedIn ? 'person.viewTree' : 'person.descendants')}</Link>
                  {!marriedIn && <Link to={`/people/${id}/tree?view=ancestors`} className="inline-flex items-center gap-2 rounded-lg border border-forest-700 px-4 py-2 font-medium text-forest-800 hover:bg-forest-50"><GitBranch className="h-4 w-4 rotate-180" />{t('person.ancestors')}</Link>}
                </div>
              </div>
            </header>

            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-8 lg:grid-cols-3">
              <div className="min-w-0 space-y-8 lg:col-span-1">
                <Card className="p-5">
                  {p.redacted && <p className="mb-3 flex items-center gap-2 text-sm text-muted"><Lock className="h-4 w-4 shrink-0" />{t('person.privateNotice')}</p>}
                  <dl className="space-y-2">{facts.map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{t(k)}</dt><dd>{v}</dd></div>)}</dl>
                  {!p.redacted && facts.length === 0 && <p className="text-muted">{t('common.unknown')}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditor({ mode: 'edit' })}><Pencil className="h-4 w-4" />{t(auth.isModerator ? 'person.edit' : 'person.suggestEdit')}</Button>
                    {['addSpouse', 'addChild', ...(marriedIn ? [] : ['addParent'])].map((mode) => <Button key={mode} size="sm" variant="ghost" onClick={() => setEditor({ mode })}><Plus className="h-4 w-4" />{t(`person.${mode}`)}</Button>)}
                  </div>
                </Card>
                {!marriedIn && pick(p, 'biography', lang) && <Section title={t('person.biography')}><p className="whitespace-pre-line">{pick(p, 'biography', lang)}</p></Section>}
                {p.research_notes && <Section title={t('person.researchNotes')}><p className="whitespace-pre-line text-sm text-muted">{p.research_notes}</p></Section>}
                <RelationshipFinder person={p} />
                {(!marriedIn || sources.length > 0) && <Section title={t('person.sources')}>
                  {sources.length === 0 ? <p className="text-sm text-muted">{t('person.noSources')}</p> : (
                    <ul className="space-y-2 text-sm">{sources.map((s) => <li key={s.id} className="rounded-xl border border-line bg-white/70 p-3"><strong>{pick(s, 'title', lang)}</strong><div className="text-muted">{[s.author, fuzzyDate(s.source_date, lang), s.citation_detail].filter(Boolean).join(' · ')}</div></li>)}</ul>
                  )}
                </Section>}
              </div>

              <div className="min-w-0 space-y-8 lg:col-span-2">
                {!marriedIn && <Section title={t('person.parents')}>
                  {parents.length === 0 && <p className="text-muted">{t('common.unknown')}</p>}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {parents.map((r) => <PersonCard key={r.relationship_id} person={r.person} subtitle={REL_LABEL[r.relationship_type] && t(REL_LABEL[r.relationship_type])}
                      right={<IconButton icon={Trash2} label={t('editor.removeLink')} onClick={() => setEditor({ mode: 'remove', link: { entity: 'parent_child', id: r.relationship_id } })} />} />)}
                  </div>
                </Section>}

                {/* Every spouse is shown together; each child only with their actual parents. */}
                <Section title={`${t('person.spouses')} · ${t('person.children')}`}>
                  {groups.length === 0 && <EmptyState title={t('person.noChildren')} />}
                  <div className="space-y-4">
                    {groups.map((g, i) => {
                      const marriages = g.co_parent ? marriagesOf(g.co_parent.id) : [];
                      return (
                        <Card key={g.co_parent?.id ?? 'unknown'} className="border-l-4 p-4" style={{ borderLeftColor: g.co_parent ? UNION_COLORS[i % UNION_COLORS.length] : '#9b9384' }}>
                          {g.co_parent ? (
                            <>
                              {(marriages.length ? marriages : [null]).map((m, k) => <MarriageHeading key={m?.marriage_id ?? k} marriage={m} spouse={g.co_parent} index={i} lang={lang} t={t} onEdit={() => setEditor({ mode: 'editMarriage', marriage: m })} />)}
                              <PersonCard person={g.co_parent} />
                            </>
                          ) : <p className="font-medium text-muted">{t('person.otherParentUnknown')}</p>}
                          <div className="mt-3 pl-4 sm:pl-8">
                            {g.children.length === 0 && <p className="text-sm text-muted">{t('person.noChildren')}</p>}
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {g.children.map((c) => <PersonCard key={c.person.id} person={c.person} subtitle={REL_LABEL[c.relationship_type] && t(REL_LABEL[c.relationship_type])} />)}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </Section>

                {siblings.length > 0 && (
                  <Section title={t('person.siblings')}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{siblings.map((s) => <PersonCard key={s.person.id} person={s.person} subtitle={s.half ? t('person.half') : null} />)}</div>
                  </Section>
                )}
              </div>
            </div>
            {editor && <PersonEditor key={JSON.stringify(editor)} {...editor} profile={profile} onClose={() => setEditor(null)} />}
          </>
        );
      }}
    </QueryState>
  );
}
