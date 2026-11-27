import { useQuery } from '@tanstack/react-query';
import { Megaphone, Star } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Card, EmptyState, PageHeader, QueryState, Tabs, cx } from '../components/ui.jsx';
import { AddContentButton } from '../features/content/AddContent.jsx';
import { api } from '../lib/api.js';
import { dateOnly, pick } from '../lib/format.js';

const isEmpty = (d) => d.items.length === 0;
const STATUS_TONE = { published: 'green', submitted: 'gold', rejected: 'clay' };

function NewsCard({ n, showStatus }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <Link to={`/affairs/news/${n.id}`}>
      <Card as="article" className={cx('h-full p-5 transition-colors hover:border-forest-300', n.is_featured && 'border-turmeric-500/60 bg-turmeric-100/40')}>
        <div className="flex flex-wrap items-center gap-2"><Badge tone="river">{pick(n, 'category_name', lang)}</Badge>{n.is_featured && <Badge tone="gold"><Star className="h-3 w-3" />{t('affairs.featured')}</Badge>}{showStatus && <Badge tone={STATUS_TONE[n.status] ?? 'gray'}>{t(`affairs.status.${n.status}`)}</Badge>}</div>
        <h2 className="mt-2 text-lg font-semibold text-forest-900">{pick(n, 'title', lang)}</h2>
        <p className="mt-1 line-clamp-3 text-muted">{pick(n, 'summary', lang)}</p>
        <p className="mt-3 text-xs text-muted">{[pick(n, 'author_name', lang), dateOnly(n.published_at ?? n.submitted_at, lang)].filter(Boolean).join(' · ')}</p>
      </Card>
    </Link>
  );
}

function News({ categories }) {
  const { t, i18n } = useTranslation();
  const [category, setCategory] = useState('');
  const query = useQuery({ queryKey: ['news', category], queryFn: () => api.get('/affairs/news', { category, limit: 50 }) });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">{[{ slug: '' }, ...categories].map((c) => <button key={c.slug} type="button" aria-pressed={category === c.slug} onClick={() => setCategory(c.slug)} className={cx('rounded-full border px-3 py-1 text-sm', category === c.slug ? 'border-forest-700 bg-forest-700 text-paper' : 'border-line bg-white/70 hover:border-forest-300')}>{c.slug ? pick(c, 'name', i18n.language) : t('common.all')}</button>)}</div>
      <QueryState query={query} isEmpty={isEmpty}>{({ items }) => <div className="grid gap-4 md:grid-cols-2">{items.map((n) => <NewsCard key={n.id} n={n} />)}</div>}</QueryState>
    </div>
  );
}

function Announcements() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const query = useQuery({ queryKey: ['announcements'], queryFn: () => api.get('/affairs/announcements/active') });
  return (
    <QueryState query={query} isEmpty={isEmpty} empty={<EmptyState icon={Megaphone} />}>
      {({ items }) => (
        <div className="space-y-4">
          {items.map((a) => (
            <Card key={a.id} className="flex gap-4 p-5">
              <Megaphone className="h-6 w-6 shrink-0 text-turmeric-600" aria-hidden />
              <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{pick(a, 'title', lang)}</h2><Badge tone={a.priority === 'urgent' ? 'clay' : a.priority === 'important' ? 'gold' : 'gray'}>{t(`affairs.priority.${a.priority}`)}</Badge></div><p className="mt-1 whitespace-pre-line">{pick(a, 'body', lang)}</p></div>
            </Card>
          ))}
        </div>
      )}
    </QueryState>
  );
}

function Mine() {
  const query = useQuery({ queryKey: ['news', 'mine'], queryFn: () => api.get('/affairs/news/mine') });
  return <QueryState query={query} isEmpty={isEmpty}>{({ items }) => <div className="grid gap-4 md:grid-cols-2">{items.map((n) => <NewsCard key={n.id} n={n} showStatus />)}</div>}</QueryState>;
}

export default function Affairs() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'news';
  const categories = useQuery({ queryKey: ['news-categories'], queryFn: () => api.get('/affairs/news-categories') }).data?.items ?? [];
  const options = { category_slug: categories.map((c) => ({ value: c.slug, label: pick(c, 'name', i18n.language) })) };
  return (
    <>
      <PageHeader title={t('affairs.title')} subtitle={t('affairs.subtitle')}
        actions={tab === 'announcements' ? <AddContentButton kind="announcement" /> : <AddContentButton kind="news" options={options} doneMessage={t('affairs.submitted')} />}>
        <Tabs value={tab} onChange={(v) => setParams({ tab: v })} tabs={['news', 'announcements', 'mine'].map((v) => ({ value: v, label: t(`affairs.tabs.${v}`) }))} />
      </PageHeader>
      <div className="mx-auto max-w-6xl px-4 py-8">
        {tab === 'news' && <News categories={categories} />}
        {tab === 'announcements' && <Announcements />}
        {tab === 'mine' && <Mine />}
      </div>
    </>
  );
}
