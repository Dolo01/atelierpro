import { createClient } from '@supabase/supabase-js';

// Valeurs par défaut : projet Supabase « atelierpro ». La clé publishable peut être publique
// (la sécurité repose sur les règles RLS de la base). Un fichier .env peut les remplacer.
const url = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://yukdbvkqnpdukfvzeozw.supabase.co';
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || 'sb_publishable_tL8XLze5sxzT3aVRX62waA_tXaiIri3';

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.error('Variables VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY manquantes (fichier .env).');
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

/** Transforme une erreur Supabase en message lisible en français. */
export function errMsg(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/Invalid login credentials/i.test(m)) return 'Identifiant ou mot de passe incorrect.';
  if (/User already registered/i.test(m)) return 'Un compte existe déjà avec ce numéro. Connectez-vous.';
  if (/Password should be at least/i.test(m)) return 'Le mot de passe doit contenir au moins 6 caractères.';
  if (/Email not confirmed/i.test(m)) return 'Compte non confirmé : désactivez « Confirm email » dans Supabase (voir README).';
  if (/row-level security/i.test(m)) return "Action non autorisée. Votre abonnement est peut-être inactif.";
  if (/Failed to fetch/i.test(m)) return 'Connexion impossible. Vérifiez votre accès internet.';
  return m;
}
