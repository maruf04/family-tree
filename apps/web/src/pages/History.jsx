import { useQuery } from '@tanstack/react-query';
import { FileText, Image, Mic } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { AddContentButton } from '../features/content/AddContent.jsx';
import { RequireMember } from '../auth/guards.jsx';
import { Badge, Card, EmptyState, Modal, PageHeader, QueryState, Tabs } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { fuzzyDate, personName, pick } from '../lib/format.js';

const isEmpty = (d) => d.items.length === 0;

function Articles() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user } = useAuth();
  const [open, setOpen] = useState(null);
  const query = useQuery({ queryKey: ['history-articles', user?.id], queryFn: () => api.get('/history/articles', { limit: 100 }) });
  return (
    <QueryState query={query} isEmpty={isEmpty}>
      {({ items }) => (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((a) => (
              <Card key={a.id} as="article" className="p-6">
                <Badge tone="clay">{t(`history.categories.${a.category}`)}</Badge>
                <h2 className="mt-3 text-xl font-semibold text-forest-900">{pick(a, 'title', lang)}</h2>
                <p className="mt-2 text-muted">{pick(a, 'summary', lang)}</p>
                <button type="button" onClick={() => setOpen(a)} className="mt-3 font-medium text-forest-700 hover:underline">{t('history.readMore')} →</button>
              </Card>
            ))}
          </div>
          <Modal wide open={Boolean(open)} onClose={() => setOpen(null)} title={pick(open, 'title', lang)}>
            <div className="whitespace-pre-line leading-8">{pick(open, 'body', lang)}</div>
          </Modal>
        </>
      )}
    </QueryState>
  );
}

function Timeline() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['history-events', user?.id], queryFn: () => api.get('/history/events', { limit: 100 }) });
  return (
    <QueryState query={query} isEmpty={isEmpty}>
      {({ items }) => (
        <ol className="relative ml-3 space-y-8 border-l-2 border-dashed border-clay-600/50 pl-8">
          {items.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[41px] top-1.5 h-4 w-4 rounded-full border-4 border-paper bg-clay-600" aria-hidden />
              <div className="font-display text-lg font-semibold text-clay-700">{fuzzyDate(e.event_date, lang) || t('date.unknown')}</div>
              <h2 className="text-xl font-semibold text-forest-900">{pick(e, 'title', lang)}</h2>
              {pick(e, 'description', lang) && <p className="mt-1 max-w-2xl text-muted">{pick(e, 'description', lang)}</p>}
              <Badge className="mt-2">{t(`history.eventCategories.${e.category}`)}</Badge>
            </li>
          ))}
        </ol>
      )}
    </QueryState>
  );
}

function OralHistories() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const query = useQuery({ queryKey: ['oral'], queryFn: () => api.get('/history/oral-histories') });
  return (
    <QueryState query={query} isEmpty={isEmpty} empty={<EmptyState icon={Mic} />}>
      {({ items }) => (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((o) => (
            <Card key={o.id} className="p-5">
              <Mic className="h-6 w-6 text-clay-600" aria-hidden />
              <h2 className="mt-2 text-lg font-semibold">{pick(o, 'title', lang)}</h2>
              <p className="mt-1 text-muted">{pick(o, 'summary', lang)}</p>
              <dl className="mt-3 space-y-0.5 text-sm">
                <div><dt className="inline text-muted">{t('history.narrator')}: </dt><dd className="inline">{o.narrator ? <Link className="text-forest-700 underline" to={`/people/${o.narrator.id}`}>{personName(o.narrator, lang)}</Link> : o.narrator_name}</dd></div>
                {o.interviewer && <div><dt className="inline text-muted">{t('history.interviewer')}: </dt><dd className="inline">{o.interviewer}</dd></div>}
                {o.recorded_date && <div><dt className="inline text-muted">{t('history.recorded')}: </dt><dd className="inline">{fuzzyDate(o.recorded_date, lang)}</dd></div>}
              </dl>
            </Card>
          ))}
        </div>
      )}
    </QueryState>
  );
}

function Documents() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const query = useQuery({ queryKey: ['documents'], queryFn: () => api.get('/history/documents') });
  return (
    <QueryState query={query} isEmpty={isEmpty} empty={<EmptyState icon={FileText} />}>
      {({ items }) => (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((d) => (
            <Card key={d.id} className="flex gap-4 p-5">
              <FileText className="h-8 w-8 shrink-0 text-turmeric-600" aria-hidden />
              <div>
                <Badge tone="gold">{t(`history.documentTypes.${d.document_type}`)}</Badge>
                <h2 className="mt-2 text-lg font-semibold">{pick(d, 'title', lang)}</h2>
                <p className="text-sm text-muted">{[fuzzyDate(d.document_date, lang), d.repository && `${t('history.repository')}: ${d.repository}`].filter(Boolean).join(' · ')}</p>
                <p className="mt-1 text-muted">{pick(d, 'description', lang)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </QueryState>
  );
}

export default function History() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'overview';
  const gated = (el) => <RequireMember>{el}</RequireMember>;
  return (
    <>
      <PageHeader title={t('history.title')} subtitle={t('history.subtitle')}
        actions={tab === 'timeline' ? <AddContentButton kind="event" /> : tab === 'overview' ? <AddContentButton kind="article" /> : null}>
        <Tabs value={tab} onChange={(v) => setParams({ tab: v })} tabs={['overview', 'timeline', 'oral', 'documents', 'photos'].map((v) => ({ value: v, label: t(`history.tabs.${v}`) }))} />
      </PageHeader>
      <div className="mx-auto max-w-6xl px-4 py-10">
        {tab === 'overview' && <Articles />}
        {tab === 'timeline' && <Timeline />}
        {tab === 'oral' && gated(<OralHistories />)}
        {tab === 'documents' && gated(<Documents />)}
        {tab === 'photos' && gated(<EmptyState icon={Image} text={t('history.photosEmpty')} />)}
      </div>
    </>
  );
}
