import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Button, InlineError, QueryState, Section, Textarea } from '../components/ui.jsx';
import { PostCard, ReportButton } from '../features/community/PostCard.jsx';
import { api } from '../lib/api.js';
import { pick, relativeTime } from '../lib/format.js';

export default function PostDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const query = useQuery({ queryKey: ['post', id], queryFn: () => api.get(`/community/posts/${id}`) });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['post', id] }); queryClient.invalidateQueries({ queryKey: ['posts'] }); };
  const add = useMutation({ mutationFn: () => api.post(`/community/posts/${id}/comments`, { body }), onSuccess: () => { setBody(''); refresh(); } });
  const remove = useMutation({ mutationFn: (cid) => api.del(`/community/comments/${cid}`), onSuccess: refresh });
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Link to="/community" className="inline-flex items-center gap-1 text-forest-700 hover:underline"><ArrowLeft className="h-4 w-4" />{t('community.title')}</Link>
      <QueryState query={query}>
        {(post) => (
          <>
            <PostCard post={post} full onDeleted={() => navigate('/community')} />
            <Section title={t('community.comments')}>
              <ul className="space-y-3">
                {post.comments.filter((c) => c.status === 'visible').map((c) => (
                  <li key={c.id} className="flex gap-3 rounded-xl border border-line bg-white/70 p-3">
                    <div className="min-w-0 flex-1"><span className="font-medium">{pick(c, 'author_name', lang)}</span> <span className="text-xs text-muted">{relativeTime(c.created_at, lang)}</span><p className="whitespace-pre-line break-words">{c.body}</p></div>
                    {c.author_id !== auth.user?.id && <ReportButton type="comment" id={c.id} />}
                    {(c.author_id === auth.user?.id || auth.isModerator) && <button type="button" aria-label={t('common.delete')} onClick={() => { if (window.confirm(t('common.confirm'))) remove.mutate(c.id); }} className="self-start rounded-lg p-1.5 text-clay-700 hover:bg-clay-100"><Trash2 className="h-4 w-4" /></button>}
                  </li>
                ))}
              </ul>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
                <Textarea required value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('community.writeComment')} aria-label={t('community.writeComment')} />
                <InlineError error={add.error ?? remove.error} />
                <Button type="submit" loading={add.isPending}>{t('common.submit')}</Button>
              </form>
            </Section>
          </>
        )}
      </QueryState>
    </div>
  );
}
