import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Badge, Button, Card, Field, InlineError, PageHeader, QueryState, Section, Textarea } from '../components/ui.jsx';
import { ProposalItems } from '../features/proposals/ProposalItems.jsx';
import { api } from '../lib/api.js';
import { dateTime, pick } from '../lib/format.js';
import { STATUS_TONE } from './Proposals.jsx';

export default function ProposalDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const query = useQuery({ queryKey: ['proposals', id], queryFn: () => api.get(`/proposals/${id}`) });
  const act = useMutation({ mutationFn: (action) => api.post(`/proposals/${id}/${action}`, action === 'withdraw' ? {} : { note }), onSuccess: () => queryClient.invalidateQueries() });
  return (
    <QueryState query={query}>
      {(p) => {
        const mine = p.proposer_id === auth.user?.id;
        return (
          <>
            <PageHeader title={p.summary} subtitle={[pick(p, 'proposer_name', lang), pick(p, 'family_name', lang), dateTime(p.created_at, lang)].filter(Boolean).join(' · ')} actions={<Badge tone={STATUS_TONE[p.status]}>{t(`proposals.status.${p.status}`)}</Badge>} />
            <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
              {p.rationale && <Section title={t('proposals.rationale')}><p className="whitespace-pre-line">{p.rationale}</p></Section>}
              <Section title={t('proposals.items')}><ProposalItems items={p.items} /></Section>
              {p.reviewed_at && <Card className="p-4"><div className="text-sm text-muted">{t('proposals.reviewer')}: {pick(p, 'reviewer_name', lang)} · {dateTime(p.reviewed_at, lang)}</div>{p.review_note && <p className="mt-1">{p.review_note}</p>}</Card>}
              <InlineError error={act.error} />
              {p.status === 'pending' && mine && <Button variant="secondary" loading={act.isPending} onClick={() => act.mutate('withdraw')}>{t('proposals.withdraw')}</Button>}
              {p.status === 'pending' && !mine && auth.isModerator && (
                <Card className="space-y-3 p-5">
                  <Field label={t('proposals.reviewNote')}>{(fid) => <Textarea id={fid} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
                  <div className="flex gap-2"><Button loading={act.isPending} onClick={() => act.mutate('approve')}>{t('proposals.approve')}</Button><Button variant="danger" disabled={act.isPending} onClick={() => act.mutate('reject')}>{t('proposals.reject')}</Button></div>
                </Card>
              )}
            </div>
          </>
        );
      }}
    </QueryState>
  );
}
