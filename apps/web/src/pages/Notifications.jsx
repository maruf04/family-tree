import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, EmptyState, PageHeader, QueryState, cx } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { pick, relativeTime } from '../lib/format.js';

export default function Notifications() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['notifications'] }); queryClient.invalidateQueries({ queryKey: ['me'] }); };
  const query = useQuery({ queryKey: ['notifications'], queryFn: () => api.get('/notifications') });
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: refresh });
  const read = useMutation({ mutationFn: (id) => api.post(`/notifications/${id}/read`), onSuccess: refresh });
  return (
    <>
      <PageHeader title={t('notifications.title')} actions={<Button variant="secondary" onClick={() => readAll.mutate()}>{t('notifications.markAll')}</Button>} />
      <div className="mx-auto max-w-3xl space-y-2 px-4 py-8">
        <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState icon={Bell} title={t('notifications.empty')} />}>
          {({ items }) => items.map((n) => (
            <Link key={n.id} to={n.link ?? '/notifications'} onClick={() => read.mutate(n.id)} className={cx('flex items-center gap-3 rounded-xl border border-line p-4 hover:border-forest-300', n.read_at ? 'bg-white/50 text-muted' : 'bg-forest-50')}>
              {!n.read_at && <span className="h-2 w-2 rounded-full bg-clay-600" />}
              <span className="flex-1">{pick(n, 'title', lang)}</span><span className="text-xs text-muted">{relativeTime(n.created_at, lang)}</span>
            </Link>
          ))}
        </QueryState>
      </div>
    </>
  );
}
