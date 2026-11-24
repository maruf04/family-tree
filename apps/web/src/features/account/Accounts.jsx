// Create accounts and hand over temporary passwords (moderators and admins).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Button, Field, InlineError, Input, Modal, Select } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { PersonPicker } from '../person/PersonPicker.jsx';

function Handover({ result }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const message = `${t('account.site')}: ${window.location.origin}\n${t('account.username')}: ${result.username}\n${t('account.temporary')}: ${result.temporaryPassword}`;
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-turmeric-100 px-3 py-2 text-sm text-turmeric-600">{t('account.onceOnly')}</p>
      <pre className="whitespace-pre-wrap rounded-xl border border-line bg-white p-4 font-mono text-sm">{message}</pre>
      <Button onClick={async () => { await navigator.clipboard.writeText(message); setCopied(true); }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{t(copied ? 'account.copied' : 'account.copy')}</Button>
    </div>
  );
}

export function NewAccountButton() {
  const { t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [person, setPerson] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const create = useMutation({
    mutationFn: () => api.post('/accounts', { ...form, username: (form.username ?? '').trim().toLowerCase(), person_id: person?.id ?? null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });
  const choose = (p) => {
    setPerson(p);
    if (p) setForm({ ...form, display_name_bn: p.full_name_bn ?? '', display_name_en: p.full_name_en ?? '', username: form.username || (p.full_name_en ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 30) });
  };
  const close = () => { setOpen(false); setForm({}); setPerson(null); create.reset(); };
  return (
    <>
      <Button onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" />{t('account.create')}</Button>
      <Modal open={open} onClose={close} title={t('account.create')}>
        {create.data ? <Handover result={create.data} /> : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <Field label={t('account.person')} hint={t('account.personHint')}><PersonPicker value={person} onChange={choose} /></Field>
            <Field label={t('common.nameBn')}>{(id) => <Input id={id} value={form.display_name_bn ?? ''} onChange={set('display_name_bn')} />}</Field>
            <Field label={t('common.nameEn')}>{(id) => <Input id={id} value={form.display_name_en ?? ''} onChange={set('display_name_en')} />}</Field>
            <Field label={t('account.username')} hint={t('account.usernameRule')}>{(id) => <Input id={id} required minLength={3} maxLength={30} pattern="[A-Za-z0-9][A-Za-z0-9._\-]+" autoComplete="off" autoCapitalize="none" value={form.username ?? ''} onChange={set('username')} />}</Field>
            {auth.isAdmin && <Field label={t('admin.role')}>{(id) => <Select id={id} value={form.role ?? 'member'} onChange={set('role')} options={['member', 'moderator', 'admin'].map((v) => ({ value: v, label: t(`admin.roles.${v}`) }))} />}</Field>}
            <InlineError error={create.error} />
            <Button type="submit" loading={create.isPending}>{t('common.submit')}</Button>
          </form>
        )}
      </Modal>
    </>
  );
}

export function ResetPasswordButton({ user }) {
  const { t } = useTranslation();
  const reset = useMutation({ mutationFn: () => api.post(`/accounts/${user.id}/reset-password`) });
  return (
    <>
      <Button size="sm" variant="secondary" loading={reset.isPending} onClick={() => { if (window.confirm(t('account.resetConfirm'))) reset.mutate(); }}><KeyRound className="h-4 w-4" />{t('account.reset')}</Button>
      <Modal open={Boolean(reset.data || reset.error)} onClose={() => reset.reset()} title={t('account.reset')}>{reset.data ? <Handover result={reset.data} /> : <InlineError error={reset.error} />}</Modal>
    </>
  );
}
