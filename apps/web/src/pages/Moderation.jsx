import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, InlineError, PageHeader, QueryState, Section, Tabs } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { pick, relativeTime } from '../lib/format.js';
import { ProposalRow } from './Proposals.jsx';

const isEmpty = (d) => d.items.length === 0;

function useAction(fn) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries() });
}

function ProposalsTab() {
  const { t } = useTranslation();
  const pending = useQuery({ queryKey: ['proposals', 'pending'], queryFn: () => api.get('/proposals/pending') });
  const reviewed = useQuery({ queryKey: ['proposals', 'reviewed'], queryFn: () => api.get('/proposals/reviewed') });
  return (
    <div className="space-y-10">
      <Section title={t('proposals.review')}><QueryState query={pending} isEmpty={isEmpty} empty={<EmptyState title={t('proposals.noPending')} />}>{({ items }) => <div className="space-y-3">{items.map((p) => <ProposalRow key={p.id} p={p} />)}</div>}</QueryState></Section>
      <Section title={t('proposals.reviewed')}><QueryState query={reviewed} isEmpty={isEmpty}>{({ items }) => <div className="space-y-3">{items.map((p) => <ProposalRow key={p.id} p={p} />)}</div>}</QueryState></Section>
    </div>
  );
}

function NewsTab() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const query = useQuery({ queryKey: ['news', 'pending'], queryFn: () => api.get('/affairs/news/pending') });
  const review = useAction(({ id, decision }) => api.post(`/affairs/news/${id}/review`, { decision }));
  return (
    <QueryState query={query} isEmpty={isEmpty} empty={<EmptyState title={t('moderation.nothing')} />}>
      {({ items }) => (
        <div className="space-y-4">
          <InlineError error={review.error} />
          {items.map((n) => (
            <Card key={n.id} className="p-5">
              <Badge tone="river">{pick(n, 'category_name', lang)}</Badge>
              <h2 className="mt-2 text-lg font-semibold">{pick(n, 'title', lang)}</h2>
              <p className="text-sm text-muted">{pick(n, 'author_name', lang)} · {relativeTime(n.submitted_at, lang)}</p>
              <p className="mt-2 whitespace-pre-line">{pick(n, 'body', lang)}</p>
              <div className="mt-4 flex gap-2"><Button onClick={() => review.mutate({ id: n.id, decision: 'publish' })}>{t('moderation.publish')}</Button><Button variant="danger" onClick={() => review.mutate({ id: n.id, decision: 'reject' })}>{t('moderation.reject')}</Button></div>
            </Card>
          ))}
        </div>
      )}
    </QueryState>
  );
}

function ReportsTab() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const query = useQuery({ queryKey: ['reports'], queryFn: () => api.get('/admin/reports') });
  const resolve = useAction(({ id, ...body }) => api.post(`/admin/reports/${id}/resolve`, body));
  return (
    <QueryState query={query} isEmpty={isEmpty} empty={<EmptyState title={t('moderation.nothing')} />}>
      {({ items }) => (
        <div className="space-y-4">
          <InlineError error={resolve.error} />
          {items.map((r) => {
            const link = r.post_id ? `/community/posts/${r.post_id}` : r.news_article_id ? `/affairs/news/${r.news_article_id}` : r.person_id ? `/people/${r.person_id}` : null;
            const content = r.post_body ?? r.comment_body ?? r.news_title_bn ?? r.reported_user_name_bn ?? pick(r, 'person_name', lang);
            return (
              <Card key={r.id} className="p-5">
                <Badge tone="clay">{t(`community.reportReasons.${r.reason}`)}</Badge>
                <p className="mt-2">{link ? <Link className="underline" to={link}>{content}</Link> : content}</p>
                {r.details && <p className="text-muted">{r.details}</p>}
                <p className="text-sm text-muted">{t('moderation.reportedBy')}: {pick(r, 'reporter_name', lang)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(r.post_id || r.comment_id) && <Button size="sm" variant="danger" onClick={() => resolve.mutate({ id: r.id, decision: 'resolved', hide_content: true })}>{t('moderation.hideContent')}</Button>}
                  <Button size="sm" onClick={() => resolve.mutate({ id: r.id, decision: 'resolved' })}>{t('moderation.resolve')}</Button>
                  <Button size="sm" variant="secondary" onClick={() => resolve.mutate({ id: r.id, decision: 'dismissed' })}>{t('moderation.dismiss')}</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </QueryState>
  );
}

export default function Moderation() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'proposals';
  const summary = useQuery({ queryKey: ['admin-summary'], queryFn: () => api.get('/admin/summary') }).data;
  const counts = { proposals: summary?.pending_proposals, news: summary?.pending_news, reports: summary?.open_reports };
  return (
    <>
      <PageHeader title={t('moderation.title')} subtitle={t('moderation.subtitle')}>
        <Tabs value={tab} onChange={(v) => setParams({ tab: v })} tabs={['proposals', 'news', 'reports'].map((v) => ({ value: v, label: t(`moderation.tabs.${v}`), count: counts[v] }))} />
      </PageHeader>
      <div className="mx-auto max-w-4xl px-4 py-8">{tab === 'news' ? <NewsTab /> : tab === 'reports' ? <ReportsTab /> : <ProposalsTab />}</div>
    </>
  );
}
