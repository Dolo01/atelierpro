import { useNavigate } from 'react-router-dom';
import { Plus, FileText, CalendarDays, Scissors, CheckCheck, Wallet, Clock, UserPlus, type LucideIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { must, useAuth, useLoad } from '../../lib/auth';
import { dateFr, daysLeft, money, STEPS } from '../../lib/format';
import { accessOf, paidOf, type Appointment, type Client, type Order, type OrderPayment } from '../../lib/types';
import { TONES, STEP_TONES, type Tone } from '../../lib/tones';
import { Avatar, Empty, Loading, Section, Stat } from '../../components/ui';

/** Étiquette colorée de l'étape de fabrication. */
export function stepPill(step: number) {
  const t = TONES[STEP_TONES[Math.min(step, 5)]];
  const label = step >= 5 ? 'Livré' : step === 4 ? 'Prêt' : STEPS[step];
  return <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: t.bg, color: t.text }}>{label}</span>;
}

/** Barre d'avancement colorée selon l'étape. */
export function StepBar({ step }: { step: number }) {
  const t = TONES[STEP_TONES[Math.min(step, 5)]];
  return <div className="h-1.5 w-full rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.min(100, ((step + 1) / 5) * 100)}%`, background: t.fg }} /></div>;
}

export function SubscriptionBanner() {
  const { workshop } = useAuth();
  const nav = useNavigate();
  if (!workshop) return null;
  const a = accessOf(workshop);
  if (a === 'active') return null;
  if (a === 'trial') {
    const d = daysLeft(workshop.trial_ends_at);
    const pct = Math.max(0, Math.min(100, (d / 30) * 100));
    return (
      <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#F7D774 0 ${pct}%, rgba(255,255,255,0.22) ${pct}% 100%)` }}>
          <div className="grid h-11 w-11 place-items-center rounded-full bg-brand-600 text-base font-extrabold tabular-nums">{d}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-brand-100">Essai gratuit</div>
          <div className="text-sm font-bold">{d} jour{d > 1 ? 's' : ''} restant{d > 1 ? 's' : ''}</div>
        </div>
        <button onClick={() => nav('/plus/abonnement')} className="h-10 shrink-0 rounded-xl bg-white px-4 text-sm font-extrabold text-brand-700 hover:bg-brand-50">Forfaits</button>
      </div>
    );
  }
  return (
    <button onClick={() => nav('/plus/abonnement')} className="w-full rounded-2xl bg-amber-100 p-4 text-left text-amber-900">
      <div className="font-bold">Votre accès est expiré</div>
      <div className="text-sm">Vous pouvez consulter vos données, mais plus en ajouter. Choisissez un forfait pour continuer ›</div>
    </button>
  );
}

function QuickAction({ icon: I, label, tone, onClick }: { icon: LucideIcon; label: string; tone: Tone; onClick: () => void }) {
  const t = TONES[tone];
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 rounded-2xl py-1 text-xs font-bold text-ink transition hover:-translate-y-0.5">
      <span className="grid h-12 w-12 place-items-center rounded-2xl text-white" style={{ background: t.fg, boxShadow: `0 6px 12px -6px ${t.fg}` }}><I className="h-[22px] w-[22px]" strokeWidth={2.1} /></span>
      {label}
    </button>
  );
}

const RDV_TONES: Tone[] = ['orange', 'teal', 'pink', 'indigo'];

export default function TailorHome() {
  const { workshop, profile } = useAuth();
  const nav = useNavigate();
  const { data, loading } = useLoad(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const [orders, pays, clients, rdv] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('order_payments').select('*'),
      supabase.from('clients').select('id, full_name'),
      supabase.from('appointments').select('*').gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString()).order('starts_at')
    ]);
    return { orders: must(orders) as Order[], pays: must(pays) as OrderPayment[], clients: must(clients) as Pick<Client, 'id' | 'full_name'>[], rdv: must(rdv) as Appointment[] };
  }, [workshop?.id]);

  if (loading || !data) return <Loading />;
  const name = (id: string | null) => data.clients.find((c) => c.id === id)?.full_name ?? '—';
  const open = data.orders.filter((o) => o.step < 5);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const month = data.pays.filter((p) => new Date(p.paid_at) >= monthStart).reduce((s, p) => s + p.amount, 0);
  const due = data.orders.reduce((s, o) => s + Math.max(0, o.price - paidOf(data.pays, o.id)), 0);

  // Encaissements des 7 derniers jours
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i));
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const v = data.pays.filter((p) => { const t = new Date(p.paid_at); return t >= d && t < next; }).reduce((s, p) => s + p.amount, 0);
    return { label: dateFr(d, { weekday: 'short' }).replace('.', ''), v, today: i === 6 };
  });
  const week = days.reduce((s, d) => s + d.v, 0);
  const max = Math.max(1, ...days.map((d) => d.v));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-sm text-muted first-letter:uppercase">{dateFr(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Bonjour {profile?.full_name?.split(' ')[0] || ''}</h1>
        <div className="text-sm text-muted">{workshop?.name}</div>
      </div>
      <SubscriptionBanner />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={Scissors} iconTone="blue" label="En fabrication" value={data.orders.filter((o) => o.step < 4).length} />
        <Stat icon={CheckCheck} iconTone="green" label="Prêtes à retirer" value={data.orders.filter((o) => o.step === 4).length} />
        <Stat icon={Wallet} iconTone="violet" label="Encaissé ce mois" value={money(month)} />
        <Stat icon={Clock} iconTone="orange" label="Reste à encaisser" value={money(due)} />
      </div>

      <div className="grid grid-cols-4 gap-2 rounded-2xl border border-line bg-white px-2 py-3 md:max-w-xl">
        <QuickAction icon={FileText} label="Devis" tone="violet" onClick={() => nav('/devis/nouveau')} />
        <QuickAction icon={Plus} label="Commande" tone="blue" onClick={() => nav('/commandes/nouvelle')} />
        <QuickAction icon={UserPlus} label="Client" tone="green" onClick={() => nav('/clients/nouveau')} />
        <QuickAction icon={CalendarDays} label="Rendez-vous" tone="orange" onClick={() => nav('/agenda')} />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="flex items-baseline justify-between"><h2 className="text-base font-bold">Encaissements des 7 derniers jours</h2></div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums">{money(week)}</div>
          <div className="mt-3 flex h-28 items-end gap-2.5">
            {days.map((d, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <div className="w-full rounded-t-lg rounded-b-[3px]" title={money(d.v)}
                  style={{ height: `${d.v ? Math.max(8, (d.v / max) * 100) : 4}%`, background: d.today ? TONES.blue.fg : d.v ? TONES.blue.bg : '#EEF2F7' }} />
                <span className={`text-[11px] capitalize ${d.today ? 'font-extrabold text-ink' : 'font-semibold text-muted'}`}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        <Section title="Rendez-vous du jour" action={<button className="text-sm font-semibold text-brand-700" onClick={() => nav('/agenda')}>Agenda</button>}>
          {data.rdv.length ? (
            <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
              {data.rdv.map((r, i) => { const t = TONES[RDV_TONES[i % RDV_TONES.length]]; return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-11 w-14 shrink-0 place-items-center rounded-xl text-sm font-extrabold tabular-nums" style={{ background: t.bg, color: t.text }}>{new Date(r.starts_at).toTimeString().slice(0, 5)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{name(r.client_id)}</span><span className="block truncate text-xs text-muted">{r.purpose}</span></span>
                </div>
              ); })}
            </div>
          ) : <Empty><CalendarDays className="mx-auto mb-1 h-5 w-5" />Aucun rendez-vous aujourd'hui.</Empty>}
        </Section>
      </div>

      <Section title="Commandes en cours" action={<button className="text-sm font-semibold text-brand-700" onClick={() => nav('/commandes')}>Tout voir</button>}>
        {open.length ? (
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
            {open.slice(0, 6).map((o) => (
              <button key={o.id} onClick={() => nav(`/commandes/${o.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas">
                <Avatar name={name(o.client_id)} />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{name(o.client_id)}</span>{stepPill(o.step)}</span>
                  <span className="truncate text-xs text-muted">{o.number} · {o.title}{o.due_date ? ` · ${dateFr(o.due_date, { day: 'numeric', month: 'short' })}` : ''}</span>
                  <StepBar step={o.step} />
                </span>
              </button>
            ))}
          </div>
        ) : <Empty>Aucune commande en cours. Créez un devis ou une commande pour commencer.</Empty>}
      </Section>
    </div>
  );
}
