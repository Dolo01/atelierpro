import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile, Workshop } from './types';
import { forgetDevicePush } from './push';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  workshop: Workshop | null;
  /** L'atelier a plus de comptes que son forfait ne le permet : les employés sont en lecture seule. */
  overLimit: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [overLimit, setOverLimit] = useState(false);
  const [loading, setLoading] = useState(true);

  const seq = useRef(0);
  const load = useCallback(async (s: Session | null) => {
    const id = ++seq.current; // seul le chargement le plus récent est appliqué
    if (!s) { setProfile(null); setWorkshop(null); setLoading(false); return; }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
    let w: Workshop | null = null; let over = false;
    if (p?.workshop_id) {
      const [r, o] = await Promise.all([
        supabase.from('workshops').select('*').eq('id', p.workshop_id).maybeSingle(),
        supabase.rpc('workshop_over_limit', { wid: p.workshop_id })
      ]);
      w = r.data as Workshop | null; over = o.data === true;
    }
    if (id !== seq.current) return;
    setProfile(p as Profile | null);
    setWorkshop(w); setOverLimit(over);
    setLoading(false);
  }, []);

  // Utilisateur actuellement chargé : on ne recharge le profil que s'il change.
  // (Supabase renvoie « SIGNED_IN » à chaque retour sur l'onglet / l'appli : avant, toute
  // l'application se rechargeait et affichait le sablier à chaque fois.)
  const userRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      setSession(s);
      const uid = s?.user.id ?? null;
      if (uid === userRef.current && evt !== 'USER_UPDATED') return;
      const first = userRef.current === undefined;
      userRef.current = uid;
      if (!first) setLoading(true);
      setTimeout(() => load(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  // Relit toujours la session actuelle (évite une session périmée juste après l'inscription)
  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    userRef.current = data.session?.user.id ?? null;
    await load(data.session);
  }, [load]);
  // Déconnexion immédiate : on efface la session sur l'appareil sans attendre le serveur
  // (sur une connexion mobile lente, l'appel réseau pouvait bloquer longtemps).
  const signOut = useCallback(async () => {
    try {
      // ce téléphone ne doit plus recevoir les alertes de ce compte (au plus 0,8 s d'attente)
      await Promise.race([forgetDevicePush(), new Promise((r) => setTimeout(r, 800))]);
    } catch { /* ignoré */ }
    setSession(null); setProfile(null); setWorkshop(null);
    try {
      await Promise.race([supabase.auth.signOut({ scope: 'local' }), new Promise((r) => setTimeout(r, 1500))]);
    } catch { /* ignoré : la session locale est effacée juste après */ }
    try { Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)); } catch { /* stockage indisponible */ }
    window.location.replace('/connexion');
  }, []);

  return <Ctx.Provider value={{ session, profile, workshop, overLimit, loading, refresh, signOut }}>{children}</Ctx.Provider>;
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
  const loaded = useRef(false);
  // Premier chargement : sablier. Rechargements suivants (après une action) : en silence,
  // l'écran reste affiché et se met à jour, sans clignoter.
  const run = useCallback(async (silent = false) => {
    if (!silent || !loaded.current) setLoading(true);
    try { setData(await fn()); setError(null); loaded.current = true; }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  const reload = useCallback(() => run(true), [run]);
  return { data, error, loading, reload, setData };
}

/** Lève l'erreur Supabase si présente, sinon renvoie les données. */
export function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
