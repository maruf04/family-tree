// Complete profile → request membership verification.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Badge, Button, Card, Field, InlineError, Input, PageHeader, Spinner, Textarea } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { dateOnly } from '../lib/format.js';

function ProfileForm() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const [form, setForm] = useState({ display_name_bn: '', display_name_en: '' });
  const save = useMutation({ mutationFn: () => api.post('/auth/profile', { ...form, preferred_language: i18n.language }), onSuccess: () => auth.refresh() });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <h2 className="text-lg font-semibold">{t('auth.completeProfile')}</h2>
      {['bn', 'en'].map((l) => (
        <Field key={l} label={t(l === 'bn' ? 'auth.displayNameBn' : 'auth.displayNameEn')}>
          {(id) => <Input id={id} value={form[`display_name_${l}`]} onChange={(e) => setForm({ ...form, [`display_name_${l}`]: e.target.value })} />}
        </Field>
      ))}
      <InlineError error={save.error} />
      <Button type="submit" loading={save.isPending}>{t('common.save')}</Button>
    </form>
  );
}

function RequestForm() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({});
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const send = useMutation({
    mutationFn: () => api.post('/auth/verification-requests', form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-verification'] }),
  });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
      <p className="text-muted">{t('auth.verifyIntro')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {[['father_name', 'admin.father'], ['mother_name', 'admin.mother'], ['neighbourhood', 'admin.neighbourhood'], ['current_residence', 'admin.residence']].map(([k, label]) => (
          <Field key={k} label={t(label)}>{(id) => <Input id={id} value={form[k] ?? ''} onChange={set(k)} />}</Field>
        ))}
      </div>
      <Field label={t('admin.details')}>{(id) => <Textarea id={id} value={form.relationship_details ?? ''} onChange={set('relationship_details')} />}</Field>
      <InlineError error={send.error} />
      <Button type="submit" loading={send.isPending}>{t('common.submit')}</Button>
    </form>
  );
}

export default function Verify() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const mine = useQuery({ queryKey: ['my-verification'], queryFn: () => api.get('/auth/verification-requests'), enabled: Boolean(auth.user) });
  const pending = mine.data?.items.find((r) => r.status === 'pending');
  let body;
  if (!auth.ready) body = <Spinner />;
  else if (!auth.signedIn) body = <Link to="/login" className="text-forest-700 underline">{t('auth.loginToContinue')}</Link>;
  else if (auth.needsProfile) body = <ProfileForm />;
  else if (auth.verified) body = <Badge tone="green">{t('admin.membership.verified')}</Badge>;
  else if (pending) body = <p>{t('auth.pending')} <span className="text-muted">({dateOnly(pending.created_at, i18n.language)})</span></p>;
  else body = <RequestForm />;
  return (
    <>
      <PageHeader title={t('auth.verifyTitle')} />
      <div className="mx-auto max-w-2xl px-4 py-8"><Card className="p-6">{body}</Card></div>
    </>
  );
}
