import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Flag, Frown, HandHeart, Heart, MessageCircle, PartyPopper, ThumbsUp, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Badge, Button, Card, Field, InlineError, Modal, Select, cx } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { money, num, pick, relativeTime } from '../../lib/format.js';

const REACTIONS = { like: ThumbsUp, love: Heart, celebrate: PartyPopper, support: HandHeart, sad: Frown };
const TONE = { buy_sell: 'gold', help_request: 'clay', achievement: 'river', celebration: 'river' };

export function ReportButton({ type, id }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('spam');
  const send = useMutation({ mutationFn: () => api.post('/community/reports', { target_type: type, target_id: id, reason }) });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={t('community.report')} aria-label={t('community.report')} className="rounded-lg p-1.5 text-muted hover:bg-paper-200"><Flag className="h-4 w-4" /></button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('community.report')}>
        {send.isSuccess ? <p>{t('community.reported')}</p> : (
          <div className="space-y-4">
            <Field>{(fid) => <Select id={fid} value={reason} onChange={(e) => setReason(e.target.value)} options={Object.entries(t('community.reportReasons', { returnObjects: true })).map(([value, label]) => ({ value, label }))} />}</Field>
            <InlineError error={send.error} />
            <Button onClick={() => send.mutate()} loading={send.isPending}>{t('common.submit')}</Button>
          </div>
        )}
      </Modal>
    </>
  );
}

export function PostCard({ post, full, onDeleted }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const auth = useAuth();
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['posts'] });
    queryClient.invalidateQueries({ queryKey: ['post', post.id] });
  };
  const react = useMutation({
    mutationFn: (reaction) => (post.my_reaction === reaction ? api.del(`/community/posts/${post.id}/reaction`) : api.put(`/community/posts/${post.id}/reaction`, { reaction })),
    onSuccess: refresh,
  });
  const resolve = useMutation({ mutationFn: () => api.patch(`/community/posts/${post.id}`, { is_resolved: true }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => api.del(`/community/posts/${post.id}`), onSuccess: () => { refresh(); onDeleted?.(); } });
  const mine = post.author_id === auth.user?.id;
  const author = pick(post, 'author_name', lang);
  return (
    <Card as="article" className="p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-100 font-display text-forest-800" aria-hidden>{[...(author || '?')][0]}</span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{author}</div>
          <div className="text-xs text-muted">{relativeTime(post.created_at, lang)}{post.group_id && ` · ${pick(post, 'group_name', lang)}`}</div>
        </div>
        <Badge tone={TONE[post.post_type] ?? 'green'}>{t(`community.postTypes.${post.post_type}`)}</Badge>
        {post.is_resolved && <Badge tone="green"><CheckCircle2 className="h-3 w-3" />{t('community.resolved')}</Badge>}
      </div>
      {post.title && <h2 className="mt-3 text-lg font-semibold"><Link className="hover:underline" to={`/community/posts/${post.id}`}>{post.title}</Link></h2>}
      <p className={cx('mt-2 whitespace-pre-line break-words', !full && 'line-clamp-6')}>{post.body}</p>
      {post.price_bdt != null && <p className="mt-2 text-lg font-semibold text-clay-700">{money(post.price_bdt, lang)}</p>}
      {post.video_url && <a href={post.video_url} target="_blank" rel="noreferrer noopener" className="mt-2 inline-block break-all text-river-600 underline">{post.video_url}</a>}
      <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-line pt-3">
        {Object.entries(REACTIONS).map(([key, Icon]) => (
          <button key={key} type="button" disabled={react.isPending} aria-pressed={post.my_reaction === key} title={t(`community.reactions.${key}`)} aria-label={t(`community.reactions.${key}`)} onClick={() => react.mutate(key)}
            className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm', post.my_reaction === key ? 'bg-forest-100 text-forest-800' : 'text-muted hover:bg-paper-200')}>
            <Icon className="h-4 w-4" />{post.reactions?.[key] > 0 && num(post.reactions[key], lang)}
          </button>
        ))}
        <Link to={`/community/posts/${post.id}`} className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm text-muted hover:bg-paper-200"><MessageCircle className="h-4 w-4" />{num(post.comment_count, lang)}</Link>
        {mine && !post.is_resolved && ['help_request', 'buy_sell'].includes(post.post_type) && <Button size="sm" variant="ghost" onClick={() => resolve.mutate()}>{t('community.markResolved')}</Button>}
        {!mine && <ReportButton type="post" id={post.id} />}
        {(mine || auth.isModerator) && <button type="button" title={t('common.delete')} aria-label={t('common.delete')} onClick={() => { if (window.confirm(t('common.confirm'))) remove.mutate(); }} className="rounded-lg p-1.5 text-clay-700 hover:bg-clay-100"><Trash2 className="h-4 w-4" /></button>}
      </div>
      <InlineError error={react.error ?? remove.error ?? resolve.error} />
    </Card>
  );
}
