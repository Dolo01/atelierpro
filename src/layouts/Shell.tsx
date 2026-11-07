import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

export interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }

/** Coque commune : barre latérale sur ordinateur, barre d'onglets sur téléphone. */
export function Shell({ items, notifPath, subtitle, banner }: { items: NavItem[]; notifPath: string; subtitle: string; banner?: React.ReactNode }) {
  const { profile, session } = useAuth();
  const nav = useNavigate();
  const [unread, setUnread] = useState(0);

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

  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${isActive ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-canvas hover:text-ink'}`;

  return (
    <div className="min-h-full bg-canvas md:flex">
      {/* Barre latérale (ordinateur) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-white p-4 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2"><img src="/logo.svg" alt="" className="h-9 w-9 rounded-lg" /><div><div className="font-extrabold leading-tight">AtelierPro</div><div className="text-xs text-muted">{subtitle}</div></div></div>
        <nav className="flex flex-col gap-1">
          {items.map((i) => <NavLink key={i.to} to={i.to} end={i.end} className={link}><i.icon className="h-5 w-5" />{i.label}</NavLink>)}
        </nav>
        <div className="mt-auto rounded-xl bg-canvas p-3 text-sm"><div className="truncate font-semibold">{profile?.full_name || 'Mon compte'}</div><div className="truncate text-xs text-muted">{profile?.phone}</div></div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white/95 px-4 py-3 backdrop-blur md:px-8" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
          <img src="/logo.svg" alt="AtelierPro" className="h-8 w-8 rounded-lg md:hidden" />
          <div className="min-w-0 flex-1 truncate text-sm font-semibold text-muted">{subtitle}</div>
          <button onClick={() => nav(notifPath)} aria-label="Notifications" className="relative grid h-10 w-10 place-items-center rounded-xl border border-line hover:bg-canvas">
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
          </button>
        </header>
        {banner}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-6">
          <Outlet />
        </main>
      </div>

      {/* Onglets (téléphone) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-white md:hidden" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)`, paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `flex flex-col items-center gap-0.5 pt-2 text-[11px] font-semibold ${isActive ? 'text-brand-600' : 'text-muted'}`}>
            <i.icon className="h-5 w-5" />{i.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
