import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { supabase, errMsg } from '../../lib/supabase';
import { must, useAuth, useLoad } from '../../lib/auth';
import { dateFr, MEASURES, money, STEPS } from '../../lib/format';
import { paidOf, type Client, type Measurement, type Order, type OrderPayment, type Quote, type Workshop } from '../../lib/types';
import { Button, Card, Empty, KV, List, Loading, Notice, Pill, Row, Section, Steps, TopBar, useToast } from '../../components/ui';
import { quotePill, Timeline } from '../tailor/Orders';
import { stepPill } from '../tailor/Home';
import { ChangePassword } from '../auth/AuthPages';

/** Toutes les données visibles par le client connecté (la base filtre déjà). */
function useMine() {
  const { session } = useAuth();
  return useLoad(async () => {
    const [c, w, o, q, p, m] = await Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('workshops').select('*'),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('quotes').select('*').order('created_at', { ascending: false }),
      supabase.from('order_payments').select('*').order('paid_at', { ascending: false }),
      supabase.from('measurements').select('*').order('taken_at', { ascending: false })
    ]);
    return { clients: must(c) as Client[], workshops: must(w) as Workshop[], orders: must(o) as Order[], quotes: must(q) as Quote[], pays: must(p) as OrderPayment[], measures: must(m) as Measurement[] };
  }, [session?.user.id]);
}

export function ClientHome() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const { data, loading } = useMine();
  if (loading || !data) return <Loading />;
  const open = data.orders.filter((o) => o.step < 5);
  const pendingQ = data.quotes.filter((q) => q.status === 'sent');
  const due = data.orders.reduce((s, o) => s + Math.max(0, o.price - paidOf(data.pays, o.id)), 0);
  return (
    <div className="flex flex-col gap-5">
      <div><div className="text-sm text-muted">{data.workshops.map((w) => w.name).join(' · ')}</div><h1 className="text-2xl font-extrabold md:text-3xl">Bonjour {profile?.full_name?.split(' ')[0]}</h1></div>
      {pendingQ.map((q) => (
        <Card key={q.id} onClick={() => nav(`/espace/devis/${q.id}`)} className="!border-amber-200 !bg-amber-50">
          <div className="flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Devis à valider</span><Pill tone="warn">{q.number}</Pill></div>
          <div className="mt-1 text-lg font-bold">{q.title}</div>
          <div className="flex justify-between text-sm"><span className="font-semibold tabular-nums">{money(q.total)}</span><span className="font-semibold text-brand-700">Voir et répondre ›</span></div>
        </Card>
      ))}
      <div className="grid gap-3 md:grid-cols-2">
        {open.map((o) => (
          <button key={o.id} onClick={() => nav(`/espace/commandes/${o.id}`)} className="rounded-2xl bg-brand-600 p-5 text-left text-white">
            <div className="text-[11px] font-bold uppercase tracking-wider text-white/80">Commande en cours · {o.number}</div>
            <div className="mt-1 text-xl font-extrabold">{o.title}</div>
            <div className="mt-3"><Steps step={o.step} light /></div>
            <div className="mt-2 flex justify-between text-sm"><span>{STEPS[o.step]}</span>{o.due_date && <span>Prévu le {dateFr(o.due_date, { day: 'numeric', month: 'short' })}</span>}</div>
          </button>
        ))}
      </div>
      {!open.length && !pendingQ.length && <Empty>Aucune commande en cours pour le moment.</Empty>}
      <div className="grid grid-cols-2 gap-3">
        <Card><div className="text-[11px] font-bold uppercase tracking-wider text-muted">Reste à payer</div><div className="text-xl font-extrabold tabular-nums">{money(due)}</div></Card>
        <Card onClick={() => nav('/espace/mesures')}><div className="text-[11px] font-bold uppercase tracking-wider text-muted">Mes mesures</div><div className="text-sm font-semibold">{data.measures[0] ? `Mises à jour le ${dateFr(data.measures[0].taken_at)}` : 'Pas encore relevées'}</div></Card>
      </div>
      <Section title="Mon atelier">
        <List>{data.workshops.map((w) => <Row key={w.id} left={<span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700"><Phone className="h-5 w-5" /></span>} title={w.name} subtitle={[w.phone, w.city].filter(Boolean).join(' · ')} />)}</List>
      </Section>
    </div>
  );
}

export function ClientQuotes() {
  const nav = useNavigate();
  const { data, loading } = useMine();
  if (loading || !data) return <Loading />;
  return (
    <div className="flex flex-col gap-4">
      <TopBar title="Mes devis" />
      {data.quotes.length ? <List>{data.quotes.map((q) => <Row key={q.id} onClick={() => nav(`/espace/devis/${q.id}`)} title={q.title} subtitle={`${q.number} · ${dateFr(q.created_at)} · ${money(q.total)}`} right={quotePill(q.status)} />)}</List> : <Empty>Aucun devis.</Empty>}
    </div>
  );
}

export function ClientQuote() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState<'' | 'yes' | 'no'>('');
  const { data, loading, reload } = useLoad(async () => {
    const q = must(await supabase.from('quotes').select('*').eq('id', id).single()) as Quote;
    const w = must(await supabase.from('workshops').select('name').eq('id', q.workshop_id).single()) as { name: string };
    return { q, w };
  }, [id]);
  if (loading || !data) return <Loading />;
  const { q } = data;
  const respond = async (accept: boolean) => {
    setBusy(accept ? 'yes' : 'no');
    const { data: orderId, error } = await supabase.rpc('client_respond_quote', { p_quote: q.id, p_accept: accept });
    setBusy('');
    if (error) return toast(errMsg(error), 'err');
    toast(accept ? 'Devis accepté. L\'atelier a été prévenu.' : 'Devis refusé. L\'atelier a été prévenu.');
    if (accept && orderId) nav(`/espace/commandes/${orderId}`); else reload();
  };
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <TopBar title={q.number} back="/espace/devis" />
      <Card>
        <div className="text-xs text-muted">{data.w.name} · {dateFr(q.created_at)}</div>
        <div className="mb-2 text-xl font-extrabold">{q.title}</div>
        {q.lines.map((l, i) => <KV key={i} k={l.label} v={money(l.amount)} />)}
        <KV strong k="Total" v={money(q.total)} />
        <KV k="Avance à verser" v={money(q.deposit)} />
        {q.delay && <KV k="Délai" v={q.delay} />}
      </Card>
      {q.status === 'sent' ? (
        <div className="flex gap-2"><Button variant="danger" className="flex-1" loading={busy === 'no'} onClick={() => respond(false)}>Refuser</Button><Button className="flex-1" loading={busy === 'yes'} onClick={() => respond(true)}>Accepter</Button></div>
      ) : <Notice tone={q.status === 'accepted' ? 'ok' : 'danger'}>{q.status === 'accepted' ? `Devis accepté le ${dateFr(q.responded_at)}. La commande a été créée.` : `Devis refusé le ${dateFr(q.responded_at)}.`}</Notice>}
    </div>
  );
}

export function ClientOrders() {
  const nav = useNavigate();
  const { data, loading } = useMine();
  if (loading || !data) return <Loading />;
  return (
    <div className="flex flex-col gap-4">
      <TopBar title="Mes commandes" />
      {data.orders.length ? <List>{data.orders.map((o) => <Row key={o.id} onClick={() => nav(`/espace/commandes/${o.id}`)} title={o.title} subtitle={`${o.number} · ${money(o.price)}`} right={stepPill(o.step)} />)}</List> : <Empty>Aucune commande.</Empty>}
    </div>
  );
}

export function ClientOrder() {
  const { id = '' } = useParams();
  const { data, loading } = useLoad(async () => {
    const o = must(await supabase.from('orders').select('*').eq('id', id).single()) as Order;
    const p = must(await supabase.from('order_payments').select('*').eq('order_id', id).order('paid_at')) as OrderPayment[];
    return { o, p };
  }, [id]);
  if (loading || !data) return <Loading />;
  const { o, p } = data;
  const paid = paidOf(p, o.id);
  return (
    <div className="flex flex-col gap-4">
      <TopBar title={o.number} back="/espace/commandes" />
      <div className="rounded-2xl bg-brand-600 p-5 text-white">
        <div className="text-2xl font-extrabold">{o.title}</div>
        {o.fabric && <div className="text-sm text-white/85">{o.fabric}</div>}
        <div className="mt-4"><Steps step={o.step} light /></div>
        <div className="mt-2 flex justify-between text-sm"><span>{STEPS[o.step]}</span>{o.due_date && <span>Prévu le {dateFr(o.due_date, { day: 'numeric', month: 'short' })}</span>}</div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><h2 className="mb-3 font-bold">Suivi de fabrication</h2><Timeline step={o.step} /></Card>
        <Card>
          <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">Paiements</h2>{o.price - paid > 0 ? <Pill tone="warn">Reste {money(o.price - paid)}</Pill> : <Pill tone="ok">Soldé</Pill>}</div>
          <KV k="Total" v={money(o.price)} />
          {p.map((x) => <KV key={x.id} k={`${x.note || 'Paiement'} · ${dateFr(x.paid_at, { day: 'numeric', month: 'short' })}`} v={money(x.amount)} />)}
        </Card>
      </div>
    </div>
  );
}

export function ClientMeasures() {
  const { data, loading } = useMine();
  if (loading || !data) return <Loading />;
  const m = data.measures[0];
  return (
    <div className="flex flex-col gap-4">
      <TopBar title="Mes mesures" />
      {m ? (
        <>
          <div className="text-sm text-muted">Relevées par l'atelier le {dateFr(m.taken_at)}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MEASURES.filter(([k]) => m.values[k] != null).map(([k, l]) => <div key={k} className="rounded-xl border border-line bg-white p-3"><div className="text-xs text-muted">{l}</div><div className="text-lg font-extrabold tabular-nums">{m.values[k]} <span className="text-xs font-medium text-muted">cm</span></div></div>)}
          </div>
        </>
      ) : <Empty>Votre atelier n'a pas encore enregistré vos mesures.</Empty>}
      <Notice>Vos mesures sont privées : seuls vous et votre atelier y avez accès. Pour les modifier, demandez une nouvelle prise de mesures.</Notice>
    </div>
  );
}

export function ClientPayments() {
  const { signOut } = useAuth();
  const { data, loading } = useMine();
  if (loading || !data) return <Loading />;
  const due = data.orders.reduce((s, o) => s + Math.max(0, o.price - paidOf(data.pays, o.id)), 0);
  const num = (id: string) => data.orders.find((o) => o.id === id)?.number ?? '';
  return (
    <div className="flex flex-col gap-5">
      <TopBar title="Paiements" />
      <div className="rounded-2xl bg-brand-100 p-4"><div className="text-[11px] font-bold uppercase tracking-wider text-brand-700">Reste à payer</div><div className="text-2xl font-extrabold tabular-nums">{money(due)}</div></div>
      {data.pays.length ? <List>{data.pays.map((p) => <Row key={p.id} title={`${p.note || 'Paiement'} · ${num(p.order_id)}`} subtitle={`${dateFr(p.paid_at)} · ${p.method}`} right={<span className="font-semibold tabular-nums">{money(p.amount)}</span>} />)}</List> : <Empty>Aucun paiement enregistré.</Empty>}
      <Section title="Mon compte"><ChangePassword /><Button variant="ghost" className="max-w-md" onClick={signOut}>Se déconnecter</Button></Section>
    </div>
  );
}
