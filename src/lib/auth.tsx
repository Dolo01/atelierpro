import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile, Workshop } from './types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  workshop: Workshop | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [loading, setLoading] = useState(true);

  const seq = useRef(0);
  const load = useCallback(async (s: Session | null) => {
    const id = ++seq.current; // seul le chargement le plus récent est appliqué
    if (!s) { setProfile(null); setWorkshop(null); setLoading(false); return; }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
    let w: Workshop | null = null;
    if (p?.workshop_id) {
      const r = await supabase.from('workshops').select('*').eq('id', p.workshop_id).maybeSingle();
      w = r.data as Workshop | null;
    }
    if (id !== seq.current) return;
    setProfile(p as Profile | null);
    setWorkshop(w);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); load(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      if (evt === 'TOKEN_REFRESHED') { setSession(s); return; }
      setSession(s); setLoading(true); setTimeout(() => load(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  // Relit toujours la session actuelle (évite une session périmée juste après l'inscription)
  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await load(data.session);
  }, [load]);
  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, []);

  return <Ctx.Provider value={{ session, profile, workshop, loading, refresh, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth hors AuthProvider');
  return v;
}

/** Petit hook de chargement de données avec rechargement. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const run = useCallback(async () => {
    setLoading(true);
    try { setData(await fn()); setError(null); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { data, error, loading, reload: run, setData };
}

/** Lève l'erreur Supabase si présente, sinon renvoie les données. */
export function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
