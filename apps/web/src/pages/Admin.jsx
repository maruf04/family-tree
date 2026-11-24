import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Badge, Button, Card, EmptyState, InlineError, PageHeader, QueryState, Select, Tabs } from '../components/ui.jsx';
import { NewAccountButton, ResetPasswordButton } from '../features/account/Accounts.jsx';
import { ImportFamily } from '../features/import/ImportFamily.jsx';
import { api } from '../lib/api.js';
import { dateTime, pick } from '../lib/format.js';

const isEmpty = (d) => d.items.length === 0;
const TONE = { verified: 'green', pending: 'gold', rejected: 'clay', suspended: 'clay' };

function Users() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const auth = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin-users'], queryFn: () => api.get('/admin/users') });
  const update = useMutation({ mutationFn: ({ id, ...body }) => api.patch(`/admin/users/${id}`, body), onSuccess: () => queryClient.invalidateQueries() });
  return (
    <QueryState query={query}>
      {({ items }) => (
        <div className="space-y-3">
          {!auth.isAdmin && <p className="text-sm text-muted">{t('admin.adminOnlyRoles')}</p>}
          <InlineError error={update.error} />
          {items.map((u) => {
            // Moderators manage members; only admins manage moderators and admins.
            const manageable = auth.isAdmin || u.role === 'member';
            return (
              <Card key={u.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-[200px] flex-1"><div className="font-medium">{pick(u, 'display_name', lang)}</div><div className="text-sm text-muted">{u.username ?? u.email ?? u.phone}{u.must_change_password && ` · ${t('account.notYet')}`}</div></div>
                <Badge tone={TONE[u.membership_status]}>{t(`admin.membership.${u.membership_status}`)}</Badge>
                {auth.isAdmin ? (
                  <div className="w-36"><Select aria-label={t('admin.role')} value={u.role} onChange={(e) => update.mutate({ id: u.id, role: e.target.value })} options={['member', 'moderator', 'admin'].map((v) => ({ value: v, label: t(`admin.roles.${v}`) }))} /></div>
                ) : <Badge>{t(`admin.roles.${u.role}`)}</Badge>}
                {manageable && u.id !== auth.user.id && u.username && <ResetPasswordButton user={u} />}
                {manageable && u.id !== auth.user.id && (u.membership_status === 'verified'
                  ? <Button size="sm" variant="danger" onClick={() => update.mutate({ id: u.id, membership_status: 'suspended' })}>{t('admin.suspend')}</Button>
                  : <Button size="sm" onClick={() => update.mutate({ id: u.id, membership_status: 'verified' })}>{t(u.membership_status === 'suspended' ? 'admin.reinstate' : 'admin.verify')}</Button>)}
              </Card>
            );
          })}
        </div>
      )}
    </QueryState>
  );
}

function Verification() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['verification-requests'], queryFn: () => api.get('/admin/verification-requests') });
  const review = useMutation({ mutationFn: ({ id, decision }) => api.post(`/admin/verification-requests/${id}/review`, { decision }), onSuccess: () => queryClient.invalidateQueries() });
  return (
    <QueryState query={query} isEmpty={isEmpty} empty={<EmptyState title={t('admin.noRequests')} />}>
      {({ items }) => (
        <div className="space-y-4">
          <InlineError error={review.error} />
          {items.map((r) => (
            <Card key={r.id} className="p-5">
              <h2 className="text-lg font-semibold">{pick(r, 'display_name', lang)}</h2>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
                {[['admin.father', r.father_name], ['admin.mother', r.mother_name], ['admin.neighbourhood', r.neighbourhood], ['admin.residence', r.current_residence], ['admin.details', r.relationship_details]].filter(([, v]) => v).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{t(k)}</dt><dd>{v}</dd></div>)}
                {r.claimed_person_id && <><dt className="text-muted">{t('admin.claimedPerson')}</dt><dd><Link className="underline" to={`/people/${r.claimed_person_id}`}>{pick(r, 'claimed_person_name', lang)}</Link></dd></>}
              </dl>
              <div className="mt-4 flex gap-2"><Button onClick={() => review.mutate({ id: r.id, decision: 'approve' })}>{t('admin.approve')}</Button><Button variant="danger" onClick={() => review.mutate({ id: r.id, decision: 'reject' })}>{t('admin.reject')}</Button></div>
            </Card>
          ))}
        </div>
      )}
    </QueryState>
  );
}

function Audit() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [limit, setLimit] = useState(50);
  const query = useQuery({ queryKey: ['audit', limit], queryFn: () => api.get('/admin/audit-logs', { limit }) });
  return (
    <QueryState query={query} isEmpty={isEmpty}>
      {({ items }) => (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-line bg-white/70">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper-200 text-muted"><tr>{['when', 'actor', 'table', 'changed'].map((k) => <th key={k} className="px-4 py-2 font-medium">{t(`admin.${k}`)}</th>)}</tr></thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="border-t border-line align-top">
                    <td className="whitespace-nowrap px-4 py-2">{dateTime(a.occurred_at, lang)}</td>
                    <td className="px-4 py-2">{pick(a, 'actor_name', lang) || '—'}</td>
                    <td className="px-4 py-2"><code>{a.table_name}</code> <Badge tone={a.action === 'delete' ? 'clay' : a.action === 'insert' ? 'green' : 'gold'}>{i18n.exists(`proposals.action.${{ insert: 'create', update: 'update', delete: 'delete' }[a.action]}`) ? t(`proposals.action.${{ insert: 'create', update: 'update', delete: 'delete' }[a.action]}`) : a.action}</Badge></td>
                    <td className="px-4 py-2 text-muted">{a.changed_fields?.join(', ')}{a.proposal_id && <> <Link className="underline" to={`/proposals/${a.proposal_id}`}>{t('proposals.title')}</Link></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {items.length === limit && limit < 200 && <Button variant="secondary" onClick={() => setLimit(200)}>{t('common.loadMore')}</Button>}
        </div>
      )}
    </QueryState>
  );
}

export default function Admin() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'users';
  const summary = useQuery({ queryKey: ['admin-summary'], queryFn: () => api.get('/admin/summary') }).data;
  return (
    <>
      <PageHeader title={t('admin.title')} actions={tab === 'users' ? <NewAccountButton /> : null}>
        <Tabs value={tab} onChange={(v) => setParams({ tab: v })} tabs={['users', 'import', 'verification', 'audit'].filter((v) => v !== 'verification' || summary?.pending_verifications > 0 || tab === v).map((v) => ({ value: v, label: t(`admin.tabs.${v}`), count: v === 'verification' ? summary?.pending_verifications : 0 }))} />
      </PageHeader>
      <div className="mx-auto max-w-5xl px-4 py-8">{tab === 'verification' ? <Verification /> : tab === 'import' ? <ImportFamily /> : tab === 'audit' ? <Audit /> : <Users />}</div>
    </>
  );
}
