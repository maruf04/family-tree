import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Button, Card, Field, InlineError, Input } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { supabase } from '../../lib/supabase.js';

/** Voluntary change, or the forced change after signing in with a temporary password. */
export function ChangePassword({ forced }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [form, setForm] = useState({ current: '', next: '', repeat: '' });
  const bind = (k) => ({ type: 'password', required: true, value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });
  const mismatch = form.repeat !== '' && form.next !== form.repeat;
  const save = useMutation({
    mutationFn: async () => {
      const email = auth.sessionEmail;
      await api.post('/accounts/me/password', { current_password: form.current, new_password: form.next });
      // Changing the password ends the old session, so sign in again quietly.
      if (supabase && email) {
        const { error } = await supabase.auth.signInWithPassword({ email, password: form.next });
        if (error) { await auth.signOut(); return; }
      }
      setForm({ current: '', next: '', repeat: '' });
      await auth.refresh();
    },
  });
  return (
    <Card className="mx-auto max-w-md p-6">
      <h2 className="text-xl font-semibold text-forest-900">{t(forced ? 'account.forcedTitle' : 'account.changePassword')}</h2>
      {forced && <p className="mt-1 text-muted">{t('account.forcedText')}</p>}
      <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); if (form.next === form.repeat) save.mutate(); }}>
        <Field label={t(forced ? 'account.temporary' : 'account.current')}>{(id) => <Input id={id} autoComplete="current-password" {...bind('current')} />}</Field>
        <Field label={t('account.new')} hint={t('account.rule')}>{(id) => <Input id={id} minLength={8} maxLength={72} autoComplete="new-password" {...bind('next')} />}</Field>
        <Field label={t('account.repeat')} error={mismatch ? t('account.mismatch') : null}>{(id) => <Input id={id} autoComplete="new-password" {...bind('repeat')} />}</Field>
        <InlineError error={save.error} />
        {save.isSuccess && <p className="rounded-lg bg-forest-100 px-3 py-2 text-forest-800">{t('account.changed')}</p>}
        <div className="flex gap-2">
          <Button type="submit" loading={save.isPending} disabled={mismatch}>{t('common.save')}</Button>
          {forced && <Button variant="ghost" onClick={auth.signOut}>{t('nav.logout')}</Button>}
        </div>
      </form>
    </Card>
  );
}
