import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Badge, QueryState } from '../components/ui.jsx';
import { ReportButton } from '../features/community/PostCard.jsx';
import { api } from '../lib/api.js';
import { dateOnly, pick } from '../lib/format.js';

export default function NewsArticle() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const query = useQuery({ queryKey: ['news', id], queryFn: () => api.get(`/affairs/news/${id}`) });
  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/affairs" className="inline-flex items-center gap-1 text-forest-700 hover:underline"><ArrowLeft className="h-4 w-4" />{t('affairs.title')}</Link>
      <QueryState query={query}>
        {(n) => (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-2"><Badge tone="river">{pick(n, 'category_name', lang)}</Badge>{n.status !== 'published' && <Badge tone="gold">{t(`affairs.status.${n.status}`)}</Badge>}</div>
            <h1 className="mt-3 text-3xl font-semibold text-forest-900 sm:text-4xl">{pick(n, 'title', lang)}</h1>
            <div className="mt-2 flex items-center gap-2 text-sm text-muted">{[pick(n, 'author_name', lang), dateOnly(n.published_at ?? n.submitted_at, lang)].filter(Boolean).join(' · ')}<ReportButton type="news_article" id={n.id} /></div>
            {n.review_note && <p className="mt-4 rounded-lg bg-clay-100 p-3 text-clay-700">{n.review_note}</p>}
            <div className="stitch-divider my-6" />
            <div className="whitespace-pre-line text-lg leading-9">{pick(n, 'body', lang)}</div>
          </>
        )}
      </QueryState>
    </article>
  );
}
