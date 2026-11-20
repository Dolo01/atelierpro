import { supabase } from './supabase';

/** Clé publique VAPID (publique par nature : elle identifie le serveur d'envoi). */
export const VAPID_PUBLIC = 'BDr0WbTObUuJ06gJGgfYUGm2izQyoKjPL6Y7AfVLaBHKEp42SO6OM7tt-g3Z6fd5_96D02sAfCV_XatdAM3LvI4';

export type PushState = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 5000))
  ]);
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

async function save(sub: PushSubscription) {
  const j = sub.toJSON();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint, p_p256dh: j.keys?.p256dh ?? '', p_auth: j.keys?.auth ?? '', p_ua: navigator.userAgent
  });
  if (error) throw error;
}

/** Demande l'autorisation puis enregistre ce téléphone pour l'utilisateur connecté. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return pushState();
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  if (!reg) throw new Error('Rechargez la page puis réessayez.');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) });
  await save(sub);
  return 'on';
}

export async function disablePush() {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/** Au démarrage : si l'autorisation est déjà donnée, on rattache l'appareil au compte connecté. */
export async function syncPush() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return;
    const reg = await registration();
    let sub = await reg?.pushManager.getSubscription();
    if (!sub && reg) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) });
    if (sub) await save(sub);
  } catch { /* silencieux */ }
}

/** À la déconnexion : ce téléphone ne reçoit plus les notifications de ce compte. */
export async function forgetDevicePush() {
  try {
    if (!pushSupported()) return;
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
  } catch { /* silencieux */ }
}
