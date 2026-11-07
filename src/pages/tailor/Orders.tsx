import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { supabase, errMsg } from '../../lib/supabase';
import { must, useAuth, useLoad } from '../../lib/auth';
import { appUrl, dateFr, money, STEPS } from '../../lib/format';
import { paidOf, type Client, type Order, type OrderPayment, type Quote } from '../../lib/types';
import { Avatar, Button, Card, Chips, Empty, Field, Input, KV, List, Loading, Notice, Pill, Row, Section, Select, Sheet, Steps, TopBar, WhatsAppSheet, useToast } from '../../components/ui';
import { stepPill } from './Home';
import { useCanWrite } from './Clients';

export function quotePill(s: Quote['status']) {
  return s === 'accepted' ? <Pill tone="ok">Accepté</Pill> : s === 'refused' ? <Pill tone="danger">Refusé</Pill> : s === 'draft' ? <Pill>Brouillon</Pill> : <Pill tone="warn">En attente</Pill>;
}

export function Timeline({ step }: { step: number }) {
  return (
    <ol className="flex flex-col">
      {STEPS.map((s, i) => {
        const done = i < step || step === 5; const now = i === step && step < 5;
        return (
          <li key={s} className="relative flex gap-3 pb-4 last:pb-0">
            {i < STEPS.length - 1 && <span className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-line" />}
            <span className={`z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${done ? 'border-brand-600 bg-brand-600 text-white' : now ? 'border-brand-600 bg-white' : 'border-line bg-white'}`}>
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : now ? <span className="h-2 w-2 rounded-full bg-brand-600" /> : null}
            </span>
            <div><div className={now ? 'font-bold' : 'font-medium'}>{s}</div>{now && <div className="text-xs text-muted">Étape en cours</div>}</div>
          </li>
        );
      })}
    </ol>
  );
}

export function OrdersList() {
  const nav = useNavigate();
  const canWrite = useCanWrite();
  const [f, setF] = useState<'cours' | 'pret' | 'livre'>('cours');
  const { data, loading } = useLoad(async () => {
    const [o, q, c] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('quotes').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('clients').select('id, full_name')
    ]);
    return { o: must(o) as Order[], q: must(q) as Quote[], c: must(c) as Pick<Client, 'id' | 'full_name'>[] };
  });
  if (loading || !data) return <Loading />;
  const name = (id: string) => data.c.find((c) => c.id === id)?.full_name ?? '—';
  const list = data.o.filter((o) => (f === 'cours' ? o.step < 4 : f === 'pret' ? o.step === 4 : o.step === 5));
  return (
    <div className="flex flex-col gap-4">
      <TopBar title="Commandes" right={canWrite ? <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => nav('/devis/nouveau')}>Devis</Button><Button size="sm" onClick={() => nav('/commandes/nouvelle')}><Plus className="h-4 w-4" />Commande</Button></div> : undefined} />
      <Chips value={f} onChange={setF} options={[['cours', 'En fabrication'], ['pret', 'Prêtes'], ['livre', 'Livrées']]} />
      {list.length ? <List>{list.map((o, i) => (
        <Row key={o.id} onClick={() => nav(`/commandes/${o.id}`)} left={<Avatar name={name(o.client_id)} tone={i} />} title={name(o.client_id)}
          subtitle={`${o.number} · ${o.title}${o.due_date ? ' · ' + dateFr(o.due_date, { day: 'numeric', month: 'short' }) : ''}`} right={stepPill(o.step)} />
      ))}</List> : <Empty>Rien dans cette liste.</Empty>}
      <Section title="Derniers devis">
        {data.q.length ? <List>{data.q.map((q) => <Row key={q.id} title={name(q.client_id)} subtitle={`${q.number} · ${q.title} · ${money(q.total)}`} right={quotePill(q.status)} />)}</List> : <Empty>Aucun devis envoyé.</Empty>}
      </Section>
    </div>
  );
}

export function OrderDetail() {
  const { id = '' } = useParams();
  const toast = useToast();
  const canWrite = useCanWrite();
  const { workshop } = useAuth();
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [wa, setWa] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Espèces');
  const { data, loading, reload } = useLoad(async () => {
    const o = must(await supabase.from('orders').select('*').eq('id', id).single()) as Order;
    const [c, p] = await Promise.all([
      supabase.from('clients').select('*').eq('id', o.client_id).single(),
      supabase.from('order_payments').select('*').eq('order_id', id).order('paid_at')
    ]);
    return { o, c: must(c) as Client, p: must(p) as OrderPayment[] };
  }, [id]);
  if (loading || !data) return <Loading />;
  const { o, c, p } = data;
  const paid = paidOf(p, o.id); const rest = Math.max(0, o.price - paid);
  const first = c.full_name.split(' ')[0];

  const next = async () => {
    setBusy(true);
    const { error } = await supabase.from('orders').update({ step: o.step + 1 }).eq('id', o.id);
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast(`Étape « ${STEPS[o.step + 1]} » enregistrée${c.user_id ? ', client notifié' : ''}`); reload();
  };
  const savePay = async (e: FormEvent) => {
    e.preventDefault();
    const a = parseInt(amount.replace(/\D/g, ''), 10);
    if (!a || a <= 0) return toast('Montant invalide', 'err');
    setBusy(true);
    const { error } = await supabase.from('order_payments').insert({ workshop_id: workshop!.id, order_id: o.id, amount: a, method, note: paid + a >= o.price ? 'Solde' : paid === 0 ? 'Avance' : 'Acompte' });
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    setPayOpen(false); toast(`${money(a)} enregistrés`); reload();
  };
  const message = () => o.step === 4
    ? `Bonjour ${first}, votre ${o.title.toLowerCase()} (${o.number}) est prêt ! Vous pouvez passer le récupérer à l'atelier.${rest > 0 ? `\nReste à régler : ${money(rest)}.` : ''}\n${workshop?.name}`
    : `Bonjour ${first}, votre commande ${o.number} (${o.title}) avance : étape « ${STEPS[o.step]} ».${o.due_date ? ` Livraison prévue le ${dateFr(o.due_date, { day: 'numeric', month: 'long' })}.` : ''}${c.user_id ? `\nSuivi : ${appUrl()}/espace/commandes/${o.id}` : ''}\n${workshop?.name}`;

  return (
    <div className="flex flex-col gap-5">
      <TopBar title={o.number} back="/commandes" />
      <div className="rounded-2xl bg-brand-600 p-5 text-white">
        <div className="text-xs font-bold uppercase tracking-wider text-white/80">{c.full_name}</div>
        <div className="mt-1 text-2xl font-extrabold">{o.title}</div>
        {o.fabric && <div className="text-sm text-white/85">{o.fabric}</div>}
        <div className="mt-4"><Steps step={o.step} light /></div>
        <div className="mt-2 flex justify-between text-sm"><span>{STEPS[o.step]}</span>{o.due_date && <span>Livraison {dateFr(o.due_date, { day: 'numeric', month: 'short' })}</span>}</div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">Fabrication</h2>
          <Timeline step={o.step} />
          <div className="mt-4 flex flex-col gap-2">
            {o.step < 5 && canWrite && <Button onClick={next} loading={busy}>Passer à « {STEPS[o.step + 1]} »</Button>}
            {c.phone && <Button variant="ghost" onClick={() => setWa(message())}><MessageCircle className="h-4 w-4" />Informer {first} sur WhatsApp</Button>}
          </div>
        </Card>
        <Card>
          <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">Paiements</h2>{rest > 0 ? <Pill tone="warn">Reste {money(rest)}</Pill> : <Pill tone="ok">Soldé</Pill>}</div>
          <KV k="Prix convenu" v={money(o.price)} />
          {p.map((x) => <KV key={x.id} k={<>{x.note || 'Paiement'} <span className="text-xs">· {dateFr(x.paid_at, { day: 'numeric', month: 'short' })} · {x.method}</span></>} v={money(x.amount)} />)}
          <KV strong k="Total payé" v={money(paid)} />
          {rest > 0 && canWrite && <Button variant="soft" className="mt-3 w-full" onClick={() => { setAmount(String(rest)); setPayOpen(true); }}><Plus className="h-4 w-4" />Enregistrer un paiement</Button>}
        </Card>
      </div>
      <Sheet open={payOpen} onClose={() => setPayOpen(false)} title="Enregistrer un paiement">
        <form onSubmit={savePay} className="flex flex-col gap-4">
          <div className="text-sm text-muted">{o.number} · reste {money(rest)}</div>
          <Field label="Montant reçu (FCFA)"><Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
          <Chips value={method} onChange={setMethod} options={[['Espèces', 'Espèces'], ['Orange Money', 'Orange Money'], ['Wave', 'Wave'], ['Moov Money', 'Moov Money']]} />
          <Button type="submit" loading={busy}>Enregistrer</Button>
        </form>
      </Sheet>
      <WhatsAppSheet open={!!wa} onClose={() => setWa(null)} to={c.full_name} phone={c.phone} text={wa ?? ''} />
    </div>
  );
}

function useClients() {
  return useLoad(async () => must(await supabase.from('clients').select('*').order('full_name')) as Client[]);
}

export function OrderNew() {
  const nav = useNavigate();
  const toast = useToast();
  const { workshop } = useAuth();
  const [sp] = useSearchParams();
  const { data: clients, loading } = useClients();
  const [f, setF] = useState({ client: sp.get('client') ?? '', title: '', fabric: '', price: '', due: '', deposit: '', method: 'Espèces' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  if (loading) return <Loading />;
  if (!clients?.length) return <div className="flex flex-col gap-4"><TopBar title="Nouvelle commande" back /><Empty>Ajoutez d'abord un client. <button className="font-semibold text-brand-700" onClick={() => nav('/clients/nouveau')}>Nouveau client</button></Empty></div>;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const price = parseInt(f.price.replace(/\D/g, ''), 10) || 0;
    const { data, error } = await supabase.from('orders').insert({ workshop_id: workshop!.id, client_id: f.client, title: f.title, fabric: f.fabric, price, due_date: f.due || null }).select().single();
    if (error) { setBusy(false); return toast(errMsg(error), 'err'); }
    const dep = parseInt(f.deposit.replace(/\D/g, ''), 10) || 0;
    if (dep > 0) await supabase.from('order_payments').insert({ workshop_id: workshop!.id, order_id: data.id, amount: dep, method: f.method, note: 'Avance' });
    setBusy(false); toast(`Commande ${data.number} créée`);
    nav(`/commandes/${data.id}`, { replace: true });
  };
  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
      <TopBar title="Nouvelle commande" back />
      <Field label="Client"><Select value={f.client} onChange={set('client')} required><option value="">Choisir un client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</Select></Field>
      <Field label="Modèle"><Input value={f.title} onChange={set('title')} placeholder="Ex. Grand boubou bazin brodé" required /></Field>
      <Field label="Tissu"><Input value={f.fabric} onChange={set('fabric')} placeholder="Ex. Bazin riche indigo, fourni par le client" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prix convenu (FCFA)"><Input inputMode="numeric" value={f.price} onChange={set('price')} required /></Field>
        <Field label="Date de livraison"><Input type="date" value={f.due} onChange={set('due')} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Avance reçue (FCFA)"><Input inputMode="numeric" value={f.deposit} onChange={set('deposit')} placeholder="0" /></Field>
        <Field label="Moyen"><Select value={f.method} onChange={set('method')}>{['Espèces', 'Orange Money', 'Wave', 'Moov Money'].map((m) => <option key={m}>{m}</option>)}</Select></Field>
      </div>
      <Button type="submit" loading={busy}>Créer la commande</Button>
    </form>
  );
}

export function QuoteNew() {
  const nav = useNavigate();
  const toast = useToast();
  const { workshop } = useAuth();
  const [sp] = useSearchParams();
  const { data: clients, loading } = useClients();
  const [client, setClient] = useState(sp.get('client') ?? '');
  const [title, setTitle] = useState('');
  const [lines, setLines] = useState<{ label: string; amount: string }[]>([{ label: 'Façon', amount: '' }]);
  const [deposit, setDeposit] = useState('');
  const [delay, setDelay] = useState('14 jours');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ text: string; c: Client } | null>(null);
  const total = useMemo(() => lines.reduce((s, l) => s + (parseInt(l.amount.replace(/\D/g, ''), 10) || 0), 0), [lines]);

  if (loading) return <Loading />;
  if (!clients?.length) return <div className="flex flex-col gap-4"><TopBar title="Nouveau devis" back /><Empty>Ajoutez d'abord un client. <button className="font-semibold text-brand-700" onClick={() => nav('/clients/nouveau')}>Nouveau client</button></Empty></div>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = lines.filter((l) => l.label.trim()).map((l) => ({ label: l.label.trim(), amount: parseInt(l.amount.replace(/\D/g, ''), 10) || 0 }));
    if (!clean.length || total <= 0) return toast('Ajoutez au moins une ligne avec un montant.', 'err');
    setBusy(true);
    const dep = deposit ? parseInt(deposit.replace(/\D/g, ''), 10) || 0 : Math.round(total / 2);
    const { data, error } = await supabase.from('quotes').insert({ workshop_id: workshop!.id, client_id: client, title, lines: clean, deposit: dep, delay, status: 'sent' }).select().single();
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    const c = clients.find((x) => x.id === client)!;
    const text = `Bonjour ${c.full_name.split(' ')[0]}, voici votre devis ${data.number} – ${title} :\n${clean.map((l) => `• ${l.label} : ${money(l.amount)}`).join('\n')}\nTotal : ${money(data.total)}\nAvance : ${money(dep)} · Délai : ${delay}\n${c.user_id ? `\nAcceptez ou refusez-le dans votre espace : ${appUrl()}/espace/devis/${data.id}` : '\nRépondez à ce message pour confirmer.'}\n${workshop?.name}`;
    if (c.phone) setSent({ text, c }); else { toast(`Devis ${data.number} enregistré`); nav('/commandes'); }
  };

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-4">
      <TopBar title="Nouveau devis" back />
      <Field label="Client"><Select value={client} onChange={(e) => setClient(e.target.value)} required><option value="">Choisir un client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.user_id ? '' : ' (sans espace)'}</option>)}</Select></Field>
      <Field label="Modèle"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Robe de soirée bazin" required /></Field>
      <Card>
        <h2 className="mb-3 font-bold">Lignes du devis</h2>
        <div className="flex flex-col gap-2">
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <Input aria-label="Libellé" value={l.label} placeholder="Libellé" onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <Input aria-label="Montant" className="!w-32" inputMode="numeric" value={l.amount} placeholder="FCFA" onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              {lines.length > 1 && <button type="button" aria-label="Supprimer la ligne" className="grid w-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-canvas" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
        </div>
        <button type="button" className="mt-2 text-sm font-semibold text-brand-700" onClick={() => setLines([...lines, { label: '', amount: '' }])}>+ Ajouter une ligne</button>
        <div className="mt-3"><KV strong k="Total" v={money(total)} /></div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Avance demandée (FCFA)" hint="Par défaut : 50 % du total"><Input inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder={String(Math.round(total / 2))} /></Field>
        <Field label="Délai"><Input value={delay} onChange={(e) => setDelay(e.target.value)} /></Field>
      </div>
      {client && !clients.find((c) => c.id === client)?.user_id && <Notice>Ce client n'a pas encore activé son espace : il recevra le détail du devis sur WhatsApp. Invitez-le depuis sa fiche pour qu'il puisse accepter en ligne.</Notice>}
      <Button type="submit" loading={busy}><MessageCircle className="h-4 w-4" />Enregistrer et envoyer par WhatsApp</Button>
      <WhatsAppSheet open={!!sent} onClose={() => { setSent(null); nav('/commandes'); }} to={sent?.c.full_name ?? ''} phone={sent?.c.phone ?? ''} text={sent?.text ?? ''} />
    </form>
  );
}
