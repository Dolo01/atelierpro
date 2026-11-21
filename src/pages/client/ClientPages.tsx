import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Phone, FileText, MessageCircle, Ruler, Scissors, ShoppingBag, Store, Wallet } from 'lucide-react';
import { supabase, errMsg } from '../../lib/supabase';
import { must, useAuth, useLoad } from '../../lib/auth';
import { dateFr, displayPhone, MEASURES, money, normalizePhone, STEPS } from '../../lib/format';
import { paidOf, type Client, type Measurement, type Order, type OrderPayment, type Quote, type Workshop } from '../../lib/types';
import { avatarTone, TONES } from '../../lib/tones';
import { Button, Card, Chips, IconTile, Empty, KV, List, Loading, Notice, Pill, Row, Section, Steps, TopBar, useToast } from '../../components/ui';
import { quotePill, Timeline } from '../tailor/Orders';
import { stepPill } from '../tailor/Home';
import { ChangePassword } from '../auth/AuthPages';
import { orderReceipt, ReceiptSheet } from '../../components/ReceiptSheet';
import { NotifSettings } from '../../components/PushPrompt';

/** Toutes les données visibles par le client connecté (la base filtre déjà), tous ateliers confondus. */
function useMine() {
  const { session } = useAuth();
  return useLoad(async () => {
    const [c, w, o, q, p, m] = await Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('workshops').select('*').order('name'),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('quotes').select('*').order('created_at', { ascending: false }),
      supabase.from('order_payments').select('*').order('paid_at', { ascending: false }),
      supabase.from('measurements').select('*').order('taken_at', { ascending: false })
    ]);
    return { clients: must(c) as Client[], workshops: must(w) as Workshop[], orders: must(o) as Order[], quotes: must(q) as Quote[], pays: must(p) as OrderPayment[], measures: must(m) as Measurement[] };
  }, [session?.user.id]);
}
type Mine = NonNullable<ReturnType<typeof useMine>['data']>;

const FILTER_KEY = 'ap-espace-atelier';

/**
 * Un client peut être suivi par plusieurs ateliers : filtre « Tous / Atelier A / Atelier B »,
 * mémorisé sur ce téléphone, et étiquette colorée du nom de l'atelier sur chaque élément.
 */
function useAtelierFilter(data: Mine | null) {
  const [sel, setSel] = useState<string>(() => { try { return localStorage.getItem(FILTER_KEY) || 'all'; } catch { return 'all'; } });
  const ws = data?.workshops ?? [];
  const current = sel !== 'all' && ws.some((w) => w.id === sel) ? sel : 'all';
  const choose = (v: string) => { setSel(v); try { localStorage.setItem(FILTER_KEY, v); } catch { /* ignoré */ } };
  const keep = <T extends { workshop_id: string }>(list: T[]) => (current === 'all' ? list : list.filter((x) => x.workshop_id === current));
  const multi = ws.length > 1;
  const name = (id: string) => ws.find((w) => w.id === id)?.name ?? 'Atelier';
  const chips = multi ? <Chips value={current} onChange={choose} options={[['all', 'Tous mes ateliers'], ...ws.map((w) => [w.id, w.name] as [string, string])]} /> : null;
  return { current, keep, multi, name, chips };
}

/** Étiquette colorée « nom de l'atelier » (stable : même couleur partout pour un atelier). */
function WsTag({ name }: { name: string }) {
  const t = TONES[avatarTone(name)];
  return <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: t.bg, color: t.text }}><Store className="h-3 w-3 shrink-0" />{name}</span>;
}

function contactLinks(w: Workshop) {
  const d = w.phone ? normalizePhone(w.phone) : '';
  return d ? { call: `tel:+${d}`, wa: `https://wa.me/${d}` } : null;
}

export function ClientHome() {
  const nav = useNavigate();
  const toast = useToast();
  const loc = useLocation() as { state?: { welcome?: string } };
  const { profile } = useAuth();
  const { data, loading } = useMine();
  const f = useAtelierFilter(data ?? null);
  useEffect(() => { if (loc.state?.welcome) toast(`${loc.state.welcome} a été ajouté à votre espace`); }, [loc.state, toast]);
  if (loading || !data) return <Loading />;
  const orders = f.keep(data.orders);
  const open = orders.filter((o) => o.step < 5);
  const pendingQ = f.keep(data.quotes).filter((q) => q.status === 'sent');
  const dueOf = (list: Order[]) => list.reduce((s, o) => s + Math.max(0, o.price - paidOf(data.pays, o.id)), 0);
  const due = dueOf(orders);
  const lastM = f.keep(data.measures)[0];
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-sm text-muted">{f.multi ? `${data.workshops.length} ateliers vous suivent` : data.workshops[0]?.name}</div>
        <h1 className="text-2xl font-extrabold md:text-3xl">Bonjour {profile?.full_name?.split(' ')[0]}</h1>
      </div>
      {f.chips}
      {pendingQ.map((q) => (
        <Card key={q.id} onClick={() => nav(`/espace/devis/${q.id}`)} className="!border-amber-200 !bg-amber-50">
          <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Devis à valider</span><Pill tone="warn">{q.number}</Pill></div>
          {f.multi && <div className="mt-1"><WsTag name={f.name(q.workshop_id)} /></div>}
          <div className="mt-1 text-lg font-bold">{q.title}</div>
          <div className="flex justify-between text-sm"><span className="font-semibold tabular-nums">{money(q.total)}</span><span className="font-semibold text-brand-700">Voir et répondre ›</span></div>
        </Card>
      ))}
      <div className="grid gap-3 md:grid-cols-2">
        {open.map((o) => (
          <button key={o.id} onClick={() => nav(`/espace/commandes/${o.id}`)} className="rounded-2xl bg-brand-600 p-5 text-left text-white">
            <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-white/80"><span className="shrink-0">{f.multi ? o.number : `Commande en cours · ${o.number}`}</span>{f.multi && <span className="min-w-0 truncate rounded-full bg-white/20 px-2 py-0.5 normal-case tracking-normal text-white">{f.name(o.workshop_id)}</span>}</div>
            <div className="mt-1 text-xl font-extrabold">{o.title}</div>
            <div className="mt-3"><Steps step={o.step} light /></div>
            <div className="mt-2 flex justify-between text-sm"><span>{STEPS[o.step]}</span>{o.due_date && <span>Prévu le {dateFr(o.due_date, { day: 'numeric', month: 'short' })}</span>}</div>
          </button>
        ))}
      </div>
      {!open.length && !pendingQ.length && <Empty icon={Scissors} tone="indigo">Aucune commande en cours pour le moment.</Empty>}
      <div className="grid grid-cols-2 gap-3">
        <Card onClick={() => nav('/espace/paiements')}><div className="mb-2"><IconTile icon={Wallet} tone="orange" /></div><div className="text-[11px] font-bold uppercase tracking-wider text-muted">Reste à payer</div><div className="text-xl font-extrabold tabular-nums">{money(due)}</div></Card>
        <Card onClick={() => nav('/espace/mesures')}><div className="mb-2"><IconTile icon={Ruler} tone="teal" /></div><div className="text-[11px] font-bold uppercase tracking-wider text-muted">Mes mesures</div><div className="text-sm font-semibold">{lastM ? `Mises à jour le ${dateFr(lastM.taken_at)}` : 'Pas encore relevées'}</div></Card>
      </div>
      <Section title={f.multi ? 'Mes ateliers' : 'Mon atelier'}>
        <div className="flex flex-col gap-2">
          {data.workshops.map((w) => {
            const wo = data.orders.filter((o) => o.workshop_id === w.id);
            const c = contactLinks(w); const t = TONES[avatarTone(w.name)];
            return (
              <div key={w.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: t.bg, color: t.fg }}><Store className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{w.name}</div>
                  <div className="truncate text-xs text-muted">{[w.city, `${wo.filter((o) => o.step < 5).length} en cours`, dueOf(wo) > 0 ? `reste ${money(dueOf(wo))}` : null].filter(Boolean).join(' · ')}</div>
                </div>
                {c && <a href={c.call} aria-label={`Appeler ${w.name}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-canvas text-slate-600 hover:text-ink"><Phone className="h-4 w-4" /></a>}
                {c && <a href={c.wa} target="_blank" rel="noopener" aria-label={`WhatsApp ${w.name}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: '#25D366' }}><MessageCircle className="h-4 w-4" /></a>}
              </div>
            );
          })}
        </div>
        {f.multi && <div className="mt-2 text-xs text-muted">Un seul compte pour tous vos ateliers. Chaque atelier ne voit que ce qui le concerne.</div>}
      </Section>
    </div>
  );
}

export function ClientQuotes() {
  const nav = useNavigate();
  const { data, loading } = useMine();
  const f = useAtelierFilter(data ?? null);
  if (loading || !data) return <Loading />;
  const list = f.keep(data.quotes);
  return (
    <div className="flex flex-col gap-4">
      <TopBar icon={FileText} tone="violet" title="Mes devis" />
      {f.chips}
      {list.length ? <List>{list.map((q) => <Row key={q.id} onClick={() => nav(`/espace/devis/${q.id}`)} title={q.title}
        subtitle={<>{f.multi && <><WsTag name={f.name(q.workshop_id)} /> </>}{`${q.number} · ${dateFr(q.created_at)} · ${money(q.total)}`}</>} right={quotePill(q.status)} />)}</List> : <Empty icon={FileText} tone="violet">Aucun devis.</Empty>}
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
      <TopBar icon={FileText} tone="violet" title={q.number} back="/espace/devis" />
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
  const f = useAtelierFilter(data ?? null);
  if (loading || !data) return <Loading />;
  const list = f.keep(data.orders);
  return (
    <div className="flex flex-col gap-4">
      <TopBar icon={ShoppingBag} tone="indigo" title="Mes commandes" />
      {f.chips}
      {list.length ? <List>{list.map((o) => <Row key={o.id} onClick={() => nav(`/espace/commandes/${o.id}`)} title={o.title}
        subtitle={<>{f.multi && <><WsTag name={f.name(o.workshop_id)} /> </>}{`${o.number} · ${money(o.price)}`}</>} right={stepPill(o.step)} />)}</List> : <Empty icon={ShoppingBag} tone="indigo">Aucune commande.</Empty>}
    </div>
  );
}

export function ClientOrder() {
  const { id = '' } = useParams();
  const { data, loading } = useLoad(async () => {
    const o = must(await supabase.from('orders').select('*').eq('id', id).single()) as Order;
    const [p, w] = await Promise.all([
      supabase.from('order_payments').select('*').eq('order_id', id).order('paid_at'),
      supabase.from('workshops').select('*').eq('id', o.workshop_id).single()
    ]);
    return { o, p: must(p) as OrderPayment[], w: must(w) as Workshop };
  }, [id]);
  if (loading || !data) return <Loading />;
  const { o, p, w } = data;
  const paid = paidOf(p, o.id);
  const c = contactLinks(w);
  return (
    <div className="flex flex-col gap-4">
      <TopBar icon={Scissors} tone="indigo" title={o.number} back="/espace/commandes" />
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-5 text-white shadow-[0_16px_30px_-20px_rgba(29,78,216,0.9)]">
        <div className="text-xs font-bold uppercase tracking-wider text-white/80">{w.name}</div>
        <div className="mt-1 text-2xl font-extrabold">{o.title}</div>
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
      {c && (
        <div className="grid grid-cols-2 gap-2">
          <a href={c.call}><Button variant="ghost" className="w-full"><Phone className="h-4 w-4" />Appeler</Button></a>
          <a href={c.wa} target="_blank" rel="noopener"><Button variant="whatsapp" className="w-full"><MessageCircle className="h-4 w-4" />WhatsApp</Button></a>
        </div>
      )}
      {w.phone && <div className="-mt-2 text-center text-xs text-muted">{w.name} · {displayPhone(w.phone)}</div>}
    </div>
  );
}

export function ClientMeasures() {
  const { data, loading } = useMine();
  const f = useAtelierFilter(data ?? null);
  if (loading || !data) return <Loading />;
  // Les dernières mesures relevées par chaque atelier
  const ws = data.workshops.filter((w) => f.current === 'all' || w.id === f.current);
  const blocks = ws.map((w) => ({ w, m: data.measures.find((x) => x.workshop_id === w.id) })).filter((b) => b.m || !f.multi);
  return (
    <div className="flex flex-col gap-4">
      <TopBar icon={Ruler} tone="teal" title="Mes mesures" />
      {f.chips}
      {blocks.some((b) => b.m) ? blocks.map(({ w, m }) => m && (
        <div key={w.id} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">{f.multi && <WsTag name={w.name} />}<span>Relevées le {dateFr(m.taken_at)}</span></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MEASURES.filter(([k]) => m.values[k] != null).map(([k, l]) => <div key={k} className="rounded-xl border border-[#CCFBF1] bg-[#F0FDFA] p-3"><div className="text-xs text-muted">{l}</div><div className="text-lg font-extrabold tabular-nums">{m.values[k]} <span className="text-xs font-medium text-muted">cm</span></div></div>)}
          </div>
        </div>
      )) : <Empty icon={Ruler} tone="teal">{f.multi ? 'Aucun de vos ateliers n\'a encore enregistré vos mesures.' : 'Votre atelier n\'a pas encore enregistré vos mesures.'}</Empty>}
      <Notice>Vos mesures sont privées : chaque atelier ne voit que celles qu'il a prises. Pour les modifier, demandez une nouvelle prise de mesures.</Notice>
    </div>
  );
}

export function ClientPayments() {
  const { signOut } = useAuth();
  const { data, loading } = useMine();
  const f = useAtelierFilter(data ?? null);
  const [rid, setRid] = useState<string | null>(null);
  if (loading || !data) return <Loading />;
  const pays = f.keep(data.pays);
  const rp = data.pays.find((x) => x.id === rid);
  const ro = rp && data.orders.find((o) => o.id === rp.order_id);
  const rc = ro && data.clients.find((c) => c.id === ro.client_id);
  const rw = ro && data.workshops.find((w) => w.id === ro.workshop_id);
  const due = f.keep(data.orders).reduce((s, o) => s + Math.max(0, o.price - paidOf(data.pays, o.id)), 0);
  const num = (id: string) => data.orders.find((o) => o.id === id)?.number ?? '';
  return (
    <div className="flex flex-col gap-5">
      <TopBar icon={Wallet} tone="green" title="Paiements" />
      {f.chips}
      <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white"><IconTile icon={Wallet} tone="gold" solid size={48} /><div><div className="text-[11px] font-bold uppercase tracking-wider text-brand-100">Reste à payer{f.current !== 'all' ? ` · ${f.name(f.current)}` : ''}</div><div className="text-2xl font-extrabold tabular-nums">{money(due)}</div></div></div>
      {pays.length ? <List>{pays.map((p) => <Row key={p.id} onClick={() => setRid(p.id)} title={`${p.note || 'Paiement'} · ${num(p.order_id)}`}
        subtitle={<>{f.multi && <><WsTag name={f.name(p.workshop_id)} /> </>}{`${dateFr(p.paid_at)} · ${p.method} · reçu ${p.receipt_no ?? ''}`}</>} right={<span className="font-semibold tabular-nums">{money(p.amount)}</span>} />)}</List> : <Empty icon={Wallet} tone="green">Aucun paiement enregistré.</Empty>}
      {pays.length > 0 && <div className="-mt-2 text-xs text-muted">Touchez un paiement pour voir et télécharger son reçu.</div>}
      <ReceiptSheet data={rp && ro && rc && rw ? orderReceipt(rw, rc, ro, data.pays.filter((x) => x.order_id === ro.id), rp) : null} onClose={() => setRid(null)}
        filename={`Recu-${rp?.receipt_no ?? 'paiement'}`} shareText={rp ? `Reçu ${rp.receipt_no ?? ''} · ${money(rp.amount)}` : ''} />
      <Section title="Notifications"><NotifSettings /></Section>
      <Section title="Mon compte"><ChangePassword /><Button variant="ghost" className="max-w-md" onClick={signOut}>Se déconnecter</Button></Section>
    </div>
  );
}
