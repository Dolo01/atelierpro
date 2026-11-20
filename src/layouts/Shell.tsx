import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { initials } from '../lib/format';
import { TONES, type Tone } from '../lib/tones';
import { syncPush } from '../lib/push';
import { PushBanner } from '../components/PushPrompt';

export interface NavItem { to: string; label: string; icon: LucideIcon; tone: Tone; end?: boolean }

/** Pastille d'icône : claire au repos, pleine quand l'onglet est actif. */
function NavTile({ item, active, size }: { item: NavItem; active: boolean; size: number }) {
  const t = TONES[item.tone];
  return (
    <span className="grid shrink-0 place-items-center transition-colors"
      style={{ width: size, height: size, borderRadius: size * 0.32, background: active ? t.fg : t.bg, color: active ? '#FFFFFF' : t.fg,
        boxShadow: active ? `0 6px 12px -6px ${t.fg}` : 'none' }}>
      <item.icon style={{ width: size * 0.52, height: size * 0.52 }} strokeWidth={2.2} />
    </span>
  );
}

/** Coque commune : barre latérale sur ordinateur, barre d'onglets sur téléphone. */
export function Shell({ items, notifPath, subtitle, banner }: { items: NavItem[]; notifPath: string; subtitle: string; banner?: React.ReactNode }) {
  const { profile, session } = useAuth();
  const nav = useNavigate();
  const [unread, setUnread] = useState(0);

  // Ce téléphone a déjà autorisé les notifications : on le rattache au compte connecté
  const uid = session?.user.id;
  useEffect(() => { if (uid) syncPush(); }, [uid]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    const load = async () => {
      const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
      if (alive) setUnread(count ?? 0);
    };
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [session]);

  return (
    <div className="min-h-full bg-canvas md:flex">
      {/* Barre latérale (ordinateur) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-white p-4 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2"><img src="/logo.svg" alt="" className="h-10 w-10 rounded-xl" /><div><div className="font-extrabold leading-tight">AtelierPro</div><div className="text-xs text-muted">{subtitle}</div></div></div>
        <nav className="flex flex-col gap-1">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm ${isActive ? 'font-extrabold text-ink' : 'font-semibold text-slate-600 hover:bg-canvas hover:text-ink'}`}
              style={({ isActive }) => (isActive ? { background: TONES[i.tone].bg + '80' } : undefined)}>
              {({ isActive }) => <><NavTile item={i} active={isActive} size={34} />{i.label}</>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-3 rounded-xl bg-canvas p-3 text-sm">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{initials(profile?.full_name || 'A')}</span>
          <div className="min-w-0"><div className="truncate font-bold">{profile?.full_name || 'Mon compte'}</div><div className="truncate text-xs text-muted">{profile?.phone}</div></div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white/95 px-4 py-3 backdrop-blur md:px-8" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
          <img src="/logo.svg" alt="AtelierPro" className="h-9 w-9 rounded-xl md:hidden" />
          <div className="min-w-0 flex-1 truncate text-sm font-bold text-muted">{subtitle}</div>
          <button onClick={() => nav(notifPath)} aria-label={unread ? `Notifications, ${unread} non lues` : 'Notifications'}
            className="relative grid h-11 w-11 place-items-center rounded-2xl transition hover:brightness-95"
            style={{ background: TONES.orange.bg, color: TONES.orange.fg }}>
            <Bell className="h-5 w-5" strokeWidth={2.2} />
            {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-white px-1 text-[11px] font-extrabold text-white" style={{ background: TONES.orange.fg }}>{unread > 9 ? '9+' : unread}</span>}
          </button>
        </header>
        <PushBanner />
        {banner}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-32 pt-4 md:px-8 md:pb-10 md:pt-6">
          <Outlet />
        </main>
      </div>

      {/* Onglets (téléphone) : chaque onglet a sa couleur */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-white px-1.5 pt-2 md:hidden"
        style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)`, paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className="flex flex-col items-center gap-1 text-[11px]">
            {({ isActive }) => <>
              <NavTile item={i} active={isActive} size={36} />
              <span className={isActive ? 'font-extrabold' : 'font-semibold text-slate-600'} style={isActive ? { color: TONES[i.tone].text } : undefined}>{i.label}</span>
            </>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
