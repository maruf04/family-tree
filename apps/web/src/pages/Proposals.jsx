import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge, Card, EmptyState, PageHeader, QueryState } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { pick, relativeTime } from '../lib/format.js';

export const STATUS_TONE = { pending: 'gold', approved: 'green', rejected: 'clay', withdrawn: 'gray' };

export function ProposalRow({ p }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <Link to={`/proposals/${p.id}`}>
      <Card className="flex flex-wrap items-center gap-3 p-4 hover:border-forest-300">
        <div className="min-w-0 flex-1"><div className="font-medium">{p.summary}</div><div className="text-sm text-muted">{[pick(p, 'proposer_name', lang), pick(p, 'family_name', lang), relativeTime(p.created_at, lang)].filter(Boolean).join(' · ')}</div></div>
        <Badge tone={STATUS_TONE[p.status]}>{t(`proposals.status.${p.status}`)}</Badge>
      </Card>
    </Link>
  );
}

export default function Proposals() {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ['proposals', 'mine'], queryFn: () => api.get('/proposals/mine') });
  return (
    <>
      <PageHeader title={t('proposals.mine')} subtitle={t('proposals.memberNote')} />
      <div className="mx-auto max-w-4xl space-y-3 px-4 py-8">
        <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title={t('proposals.noMine')} />}>
          {({ items }) => items.map((p) => <ProposalRow key={p.id} p={p} />)}
        </QueryState>
      </div>
    </>
  );
}
