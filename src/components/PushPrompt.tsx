import { useEffect, useState } from 'react';
import { BellRing, BellOff, X } from 'lucide-react';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push';
import { TONES } from '../lib/tones';
import { Button, useToast } from './ui';

const DISMISS_KEY = 'ap-push-later';

function usePushState() {
  const [state, setState] = useState<PushState | null>(null);
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')); }, []);
  return [state, setState] as const;
}

/** Bandeau discret en haut de l'appli tant que les notifications ne sont pas activées sur ce téléphone. */
export function PushBanner() {
  const toast = useToast();
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now(); } catch { return false; } });
  if (hidden || !state || (state !== 'off' && state !== 'ios-install')) return null;

  const later = () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now() + 3 * 86400000)); } catch { /* ignoré */ } setHidden(true); };
  const enable = async () => {
    setBusy(true);
    try {
      const s = await enablePush(); setState(s);
      if (s === 'on') toast('Notifications activées sur ce téléphone');
      else if (s === 'denied') toast('Notifications refusées : autorisez-les dans les réglages du navigateur', 'err');
    } catch (e) { toast((e as Error).message || 'Activation impossible', 'err'); }
    setBusy(false);
  };

  return (
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl border p-3 md:mx-8" style={{ background: TONES.orange.bg + '66', borderColor: TONES.orange.bg }}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: TONES.orange.fg }}><BellRing className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-bold">Recevoir les alertes sur ce téléphone</div>
        <div className="text-muted">{state === 'ios-install' ? "Sur iPhone : touchez Partager puis « Sur l'écran d'accueil », ouvrez AtelierPro depuis l'icône, puis activez." : 'Même quand l\'appli est fermée.'}</div>
      </div>
      {state === 'off' && <Button size="sm" onClick={enable} loading={busy}>Activer</Button>}
      <button type="button" aria-label="Plus tard" onClick={later} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-white"><X className="h-4 w-4" /></button>
    </div>
  );
}

/** Carte de réglage (page Notifications, espace client…). */
export function NotifSettings() {
  const toast = useToast();
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  if (!state) return null;
  const on = state === 'on';
  const toggle = async () => {
    setBusy(true);
    try {
      if (on) { await disablePush(); setState('off'); toast('Notifications désactivées sur ce téléphone'); }
      else { const s = await enablePush(); setState(s); if (s === 'on') toast('Notifications activées sur ce téléphone'); if (s === 'denied') toast('Notifications refusées par le navigateur', 'err'); }
    } catch (e) { toast((e as Error).message || 'Opération impossible', 'err'); }
    setBusy(false);
  };
  const text: Record<PushState, string> = {
    on: 'Activées : vous êtes alerté même quand l\'appli est fermée.',
    off: 'Désactivées sur ce téléphone.',
    denied: 'Bloquées par le navigateur. Ouvrez les réglages du site (icône à gauche de l\'adresse) et autorisez les notifications.',
    'ios-install': "Sur iPhone, ajoutez d'abord AtelierPro à l'écran d'accueil (Partager → Sur l'écran d'accueil), puis ouvrez-le depuis l'icône.",
    unsupported: 'Ce navigateur ne permet pas les notifications. Utilisez Chrome sur Android, ou Safari sur iPhone avec l\'appli installée.'
  };
  const t = on ? TONES.green : TONES.orange;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: t.bg, color: t.fg }}>{on ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}</span>
      <div className="min-w-0 flex-1 text-sm"><div className="font-bold">Notifications sur ce téléphone</div><div className="text-muted">{text[state]}</div></div>
      {(state === 'on' || state === 'off') && <Button size="sm" variant={on ? 'ghost' : 'primary'} onClick={toggle} loading={busy}>{on ? 'Désactiver' : 'Activer'}</Button>}
    </div>
  );
}
