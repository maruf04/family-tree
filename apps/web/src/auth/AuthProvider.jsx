// Authentication state. Uses Supabase Auth when configured; otherwise, in
// development, a "dev login" that signs in as a sample user (the API refuses
// dev tokens in production).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, setTokenProvider } from '../lib/api.js';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);
const DEV_KEY = 'heritage.devUser';

function readDevUser() {
  try { return localStorage.getItem(DEV_KEY); } catch { return null; }
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState(null);       // Supabase session
  const [devUserId, setDevUserId] = useState(() => (supabase ? null : readDevUser()));
  const [ready, setReady] = useState(!supabase);
  const tokenRef = useRef(null);

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const token = session?.access_token ?? (devUserId ? `dev:${devUserId}` : null);
  tokenRef.current = token;
  // Registered during the first render: child effects (data fetching) run
  // before this component's effects, so an effect here would be too late.
  useState(() => { setTokenProvider(() => tokenRef.current); });

  const meQuery = useQuery({
    queryKey: ['me', token],
    queryFn: () => api.get('/auth/me'),
    enabled: Boolean(token) && ready,
    retry: false,
    staleTime: 60_000,
  });

  const signInDev = useCallback((userId) => {
    try { localStorage.setItem(DEV_KEY, userId); } catch { /* ignore */ }
    tokenRef.current = `dev:${userId}`;
    setDevUserId(userId);
    queryClient.clear();
  }, [queryClient]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    try { localStorage.removeItem(DEV_KEY); } catch { /* ignore */ }
    tokenRef.current = null;
    setDevUserId(null);
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(() => {
    const user = meQuery.data?.user ?? null;
    const mustChangePassword = Boolean(user?.must_change_password);
    const verified = user?.membership_status === 'verified' && !mustChangePassword;
    return {
      ready: ready && (!token || !meQuery.isLoading),
      signedIn: Boolean(token) && !meQuery.isError,
      user,
      person: meQuery.data?.person ?? null,
      needsProfile: Boolean(token) && meQuery.isSuccess && !user,
      verified,
      mustChangePassword,
      sessionEmail: session?.user?.email ?? null,
      isModerator: verified && ['moderator', 'admin'].includes(user?.role),
      isAdmin: verified && user?.role === 'admin',
      supabaseEnabled: Boolean(supabase),
      signInDev,
      signOut,
      refresh: () => meQuery.refetch(),
    };
  }, [meQuery, ready, token, session, signInDev, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
