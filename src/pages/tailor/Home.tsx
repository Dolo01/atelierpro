import { useNavigate } from 'react-router-dom';
import { Plus, Ruler, FileText, CalendarDays } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { must, useAuth, useLoad } from '../../lib/auth';
import { dateFr, daysLeft, money, STEPS } from '../../lib/format';
import { accessOf, paidOf, type Appointment, type Client, type Order, type OrderPayment } from '../../lib/types';
import { Avatar, Button, Empty, List, Loading, Pill, Row, Section, Stat } from '../../components/ui';

export function stepPill(step: number) {
  if (step >= 5) return <Pill>Livré</Pill>;
  if (step === 4) return <Pill tone="ok">Prêt</Pill>;
  return <Pill tone="blue">{STEPS[step]}</Pill>;
}

export function SubscriptionBanner() {
  const { workshop } = useAuth();
  const nav = useNavigate();
  if (!workshop) return null;
  const a = accessOf(workshop);
  if (a === 'active') return null;
  if (a === 'trial') {
    const d = daysLeft(workshop.trial_ends_at);
    return (
      <button onClick={() => nav('/plus/abonnement')} className="w-full rounded-2xl bg-brand-100 p-4 text-left">
        <div className="flex justify-between text-sm"><span className="text-[11px] font-bold uppercase tracking-wider text-brand-700">Essai gratuit</span><span className="font-bold tabular-nums">{d} j restants</span></div>
        <div className="mt-2 flex gap-1"><span className="h-1.5 rounded-full bg-brand-600" style={{ flex: Math.max(1, 30 - d) }} /><span className="h-1.5 rounded-full bg-white" style={{ flex: Math.max(1, d) }} /></div>
        <div className="mt-2 text-sm font-semibold text-brand-700">Choisir un forfait ›</div>
      </button>
    );
  }
  return (
    <button onClick={() => nav('/plus/abonnement')} className="w-full rounded-2xl bg-amber-100 p-4 text-left text-amber-900">
      <div className="font-bold">Votre accès est expiré</div>
      <div className="text-sm">Vous pouvez consulter vos données, mais plus en ajouter. Choisissez un forfait pour continuer ›</div>
    </button>
  );
}

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

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-sm text-muted">{dateFr(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{workshop?.name}</h1>
        <div className="text-sm text-muted">Bonjour {profile?.full_name?.split(' ')[0]}</div>
      </div>
      <SubscriptionBanner />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat tone="blue" label="En cours" value={open.length} sub="commandes" />
        <Stat label="Prêtes à retirer" value={data.orders.filter((o) => o.step === 4).length} />
        <Stat label="Encaissé ce mois" value={money(month)} />
        <Stat label="Soldes à encaisser" value={money(due)} />
      </div>
      <div className="grid grid-cols-3 gap-2 md:max-w-xl">
        <Button variant="ghost" onClick={() => nav('/devis/nouveau')}><FileText className="h-4 w-4" />Devis</Button>
        <Button variant="ghost" onClick={() => nav('/commandes/nouvelle')}><Plus className="h-4 w-4" />Commande</Button>
        <Button variant="ghost" onClick={() => nav('/clients/nouveau')}><Ruler className="h-4 w-4" />Client</Button>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Rendez-vous du jour" action={<button className="text-sm font-semibold text-brand-700" onClick={() => nav('/agenda')}>Agenda</button>}>
          {data.rdv.length ? <List>{data.rdv.map((r) => (
            <Row key={r.id} left={<span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-xs font-bold text-brand-700">{new Date(r.starts_at).toTimeString().slice(0, 5)}</span>}
              title={name(r.client_id)} subtitle={r.purpose} />
          ))}</List> : <Empty><CalendarDays className="mx-auto mb-1 h-5 w-5" />Aucun rendez-vous aujourd'hui.</Empty>}
        </Section>
        <Section title="Commandes en cours" action={<button className="text-sm font-semibold text-brand-700" onClick={() => nav('/commandes')}>Tout voir</button>}>
          {open.length ? <List>{open.slice(0, 5).map((o, i) => (
            <Row key={o.id} onClick={() => nav(`/commandes/${o.id}`)} left={<Avatar name={name(o.client_id)} tone={i} />}
              title={name(o.client_id)} subtitle={`${o.number} · ${o.title}`} right={stepPill(o.step)} />
          ))}</List> : <Empty>Aucune commande en cours. Créez un devis ou une commande pour commencer.</Empty>}
        </Section>
      </div>
    </div>
  );
}
