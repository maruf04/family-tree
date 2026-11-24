import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Badge, Button, Card, Field, InlineError, Input } from '../components/ui.jsx';
import { api, ApiError } from '../lib/api.js';
import { pick } from '../lib/format.js';
import { supabase } from '../lib/supabase.js';
import { loginEmail } from '../lib/username.js';

function PasswordLogin() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ username: '', password: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const run = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(form.username), password: form.password });
      if (error) throw error.status === 429 ? new ApiError(429, { error: { code: 'too_many_attempts' } }) : error.status === 400 ? new ApiError(400, { error: { code: 'wrong_login' } }) : error;
    },
  });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run.mutate(); }}>
      <Field label={t('account.username')}>{(id) => <Input id={id} required autoComplete="username" autoCapitalize="none" spellCheck={false} value={form.username} onChange={set('username')} />}</Field>
      <Field label={t('auth.password')}>{(id) => <Input id={id} type="password" required autoComplete="current-password" value={form.password} onChange={set('password')} />}</Field>
      <InlineError error={run.error} />
      <Button type="submit" loading={run.isPending} className="w-full">{t('auth.signIn')}</Button>
      <p className="text-sm text-muted">{t('account.noAccount')}</p>
    </form>
  );
}

function DevLogin() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const users = useQuery({ queryKey: ['dev-users'], queryFn: () => api.get('/auth/dev-users'), retry: false });
  if (!users.data) return <p className="text-sm text-muted">{t('auth.notConfigured')}</p>;
  return (
    <div>
      <h2 className="text-lg font-semibold text-forest-900">{t('auth.devTitle')}</h2>
      <p className="mt-1 text-sm text-muted">{t('auth.devNote')}</p>
      <div className="mt-4 grid gap-2">
        {users.data.items.map((u) => (
          <button key={u.id} type="button" onClick={() => auth.signInDev(u.id)} className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-left hover:border-forest-500 hover:bg-forest-50">
            <span className="font-medium">{pick(u, 'display_name', i18n.language)}</span>
            <Badge tone={u.role === 'admin' ? 'gold' : u.role === 'moderator' ? 'river' : 'green'}>{t(`admin.roles.${u.role}`)}</Badge>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Login() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (auth.user) navigate('/', { replace: true });
  }, [auth.user, navigate]);
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-3xl font-semibold text-forest-900">{t('auth.loginTitle')}</h1>
      <p className="mb-6 mt-1 text-muted">{t('auth.loginIntro')}</p>
      <Card className="p-6">
        {auth.needsProfile
          ? <div className="space-y-3"><p>{t('account.notMember')}</p><Button variant="secondary" onClick={auth.signOut}>{t('nav.logout')}</Button></div>
          : auth.supabaseEnabled ? <PasswordLogin /> : <DevLogin />}
      </Card>
    </div>
  );
}
