import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, InlineError, Input, PageHeader, QueryState, Select, Tabs, Textarea, cx } from '../components/ui.jsx';
import { PostCard } from '../features/community/PostCard.jsx';
import { AddContentButton } from '../features/content/AddContent.jsx';
import { api } from '../lib/api.js';
import { dateTime, num, pick } from '../lib/format.js';

// Photo posts need file storage, which is not configured yet.
const TYPES = ['discussion', 'video', 'buy_sell', 'help_request', 'achievement', 'celebration'];

function Composer({ groupId }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const empty = { post_type: 'discussion', title: '', body: '', price: '', video_url: '' };
  const [form, setForm] = useState(empty);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const post = useMutation({
    mutationFn: () => api.post('/community/posts', {
      post_type: form.post_type, title: form.title || null, body: form.body, group_id: groupId || null,
      price_bdt: form.post_type === 'buy_sell' && form.price !== '' ? Number(form.price) : null,
      video_url: form.post_type === 'video' && form.video_url ? form.video_url : null,
    }),
    onSuccess: () => { setForm(empty); queryClient.invalidateQueries({ queryKey: ['posts'] }); },
  });
  return (
    <Card as="form" className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); post.mutate(); }}>
      <Textarea required value={form.body} onChange={set('body')} placeholder={t('community.placeholder')} aria-label={t('community.newPost')} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input value={form.title} onChange={set('title')} placeholder={t('community.titleOptional')} aria-label={t('community.titleOptional')} />
        <Select aria-label={t('affairs.category')} value={form.post_type} onChange={set('post_type')} options={TYPES.map((v) => ({ value: v, label: t(`community.postTypes.${v}`) }))} />
        {form.post_type === 'buy_sell' && <Input type="number" min="0" value={form.price} onChange={set('price')} placeholder={t('community.price')} aria-label={t('community.price')} />}
        {form.post_type === 'video' && <Input type="url" value={form.video_url} onChange={set('video_url')} placeholder={t('community.videoUrl')} aria-label={t('community.videoUrl')} />}
      </div>
      <InlineError error={post.error} />
      <Button type="submit" loading={post.isPending}>{t('community.post')}</Button>
    </Card>
  );
}

function Feed() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const groupId = params.get('group') ?? '';
  const [type, setType] = useState('');
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => api.get('/community/groups') });
  const group = groups.data?.items.find((g) => g.id === groupId);
  const query = useInfiniteQuery({
    queryKey: ['posts', type, groupId],
    queryFn: ({ pageParam }) => api.get('/community/posts', { type, groupId, before: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {group && <div className="flex items-center justify-between rounded-xl bg-forest-100 px-4 py-2"><strong>{pick(group, 'name', i18n.language)}</strong><button type="button" className="text-sm underline" onClick={() => setParams({})}>{t('common.all')}</button></div>}
      {(!groupId || group?.joined) && <Composer groupId={groupId} />}
      <div className="flex flex-wrap gap-2">
        {['', ...TYPES].map((v) => <button key={v} type="button" aria-pressed={type === v} onClick={() => setType(v)} className={cx('rounded-full border px-3 py-1 text-sm', type === v ? 'border-forest-700 bg-forest-700 text-paper' : 'border-line bg-white/70 hover:border-forest-300')}>{v ? t(`community.postTypes.${v}`) : t('common.all')}</button>)}
      </div>
      <QueryState query={query} isEmpty={(d) => d.pages[0].items.length === 0}>
        {({ pages }) => (
          <>
            {pages.flatMap((p) => p.items).map((p) => <PostCard key={p.id} post={p} />)}
            {query.hasNextPage && <Button variant="secondary" className="w-full" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{t('common.loadMore')}</Button>}
          </>
        )}
      </QueryState>
    </div>
  );
}

function Events() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const [scope, setScope] = useState('upcoming');
  const query = useQuery({ queryKey: ['events', scope], queryFn: () => api.get('/community/events', { scope }) });
  const rsvp = useMutation({ mutationFn: ({ id, status }) => api.put(`/community/events/${id}/rsvp`, { status }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] }) });
  return (
    <div className="space-y-4">
      <div className="flex gap-2">{['upcoming', 'past'].map((s) => <Button key={s} size="sm" variant={scope === s ? 'primary' : 'secondary'} onClick={() => setScope(s)}>{t(s === 'past' ? 'community.pastEvents' : 'home.upcoming')}</Button>)}</div>
      <InlineError error={rsvp.error} />
      <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState icon={CalendarDays} title={t('community.noEvents')} />}>
        {({ items }) => (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((e) => (
              <Card key={e.id} className="p-5">
                <div className="flex items-center gap-2 font-medium text-clay-700"><CalendarDays className="h-5 w-5" />{dateTime(e.starts_at, lang)}</div>
                <h2 className="mt-1 text-xl font-semibold text-forest-900">{pick(e, 'title', lang)}</h2>
                {e.location_text && <p className="flex items-center gap-1 text-sm text-muted"><MapPin className="h-4 w-4" />{e.location_text}</p>}
                <p className="mt-2">{pick(e, 'description', lang)}</p>
                <p className="mt-2 text-sm text-muted">{t('community.going')}: {num(e.going_count, lang)} · {t('community.interested')}: {num(e.interested_count, lang)}</p>
                {scope === 'upcoming' && <div className="mt-3 flex flex-wrap gap-2">{[['going', 'going'], ['interested', 'interested'], ['not_going', 'notGoing']].map(([status, key]) => <Button key={status} size="sm" aria-pressed={e.my_status === status} variant={e.my_status === status ? 'primary' : 'secondary'} onClick={() => rsvp.mutate({ id: e.id, status })}>{t(`community.${key}`)}</Button>)}</div>}
              </Card>
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}

function Groups() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const [, setParams] = useSearchParams();
  const query = useQuery({ queryKey: ['groups'], queryFn: () => api.get('/community/groups') });
  const toggle = useMutation({ mutationFn: (g) => (g.joined ? api.del(`/community/groups/${g.id}/join`) : api.post(`/community/groups/${g.id}/join`)), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['groups'] }) });
  return (
    <QueryState query={query} isEmpty={(d) => d.items.length === 0}>
      {({ items }) => (
        <div className="grid gap-4 md:grid-cols-2">
          <InlineError error={toggle.error} />
          {items.map((g) => (
            <Card key={g.id} className="p-5">
              <div className="flex items-start justify-between gap-2"><h2 className="text-xl font-semibold text-forest-900">{pick(g, 'name', lang)}</h2><Badge tone={g.visibility === 'open' ? 'green' : 'gray'}>{t(`community.${g.visibility}`)}</Badge></div>
              <p className="mt-1 text-muted">{pick(g, 'description', lang)}</p>
              <p className="mt-2 flex items-center gap-1 text-sm text-muted"><Users className="h-4 w-4" />{num(g.member_count, lang)} {t('community.members')}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setParams({ group: g.id })}>{t('common.open')}</Button>
                {(g.joined || g.visibility === 'open') && <Button size="sm" variant={g.joined ? 'ghost' : 'primary'} onClick={() => toggle.mutate(g)}>{t(g.joined ? 'community.leave' : 'community.join')}</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </QueryState>
  );
}

export default function Community() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'feed';
  return (
    <>
      <PageHeader title={t('community.title')} subtitle={t('community.subtitle')} actions={tab === 'events' ? <AddContentButton kind="villageEvent" /> : tab === 'groups' ? <AddContentButton kind="group" /> : null}>
        <Tabs value={tab} onChange={(v) => setParams({ tab: v })} tabs={['feed', 'events', 'groups'].map((v) => ({ value: v, label: t(`community.tabs.${v}`) }))} />
      </PageHeader>
      <div className="mx-auto max-w-6xl px-4 py-8">
        {tab === 'feed' && <Feed />}
        {tab === 'events' && <Events />}
        {tab === 'groups' && <Groups />}
      </div>
    </>
  );
}
