import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, clearTokens, saveTokens } from './auth-api';

type Profile = { id: string; name: string; email: string; isEmailVerified: boolean };
type AuthContextValue = { user: Profile | null; loading: boolean; acceptTokens: (tokens: Parameters<typeof saveTokens>[0]) => Promise<void>; signOut: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    authApi.me().then((profile) => { if (alive) setUser(profile); }).catch(async () => { await clearTokens(); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const acceptTokens = useCallback(async (tokens: Parameters<typeof saveTokens>[0]) => {
    await saveTokens(tokens);
    const profile = await authApi.me();
    setUser(profile);
  }, []);
  const signOut = useCallback(async () => { const currentUser = user; setUser(null); if (currentUser) await authApi.logout(); else await clearTokens(); }, [user]);
  const value = useMemo(() => ({ user, loading, acceptTokens, signOut }), [user, loading, acceptTokens, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
