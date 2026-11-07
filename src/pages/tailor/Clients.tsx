import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { UserPlus, Ruler, FileText, Plus, Send } from 'lucide-react';
import { supabase, errMsg } from '../../lib/supabase';
import { must, useAuth, useLoad } from '../../lib/auth';
import { appUrl, dateFr, displayPhone, MEASURES, money } from '../../lib/format';
import { accessOf, type Client, type Measurement, type Order, type Quote } from '../../lib/types';
import { Avatar, Button, Card, Empty, Field, Input, List, Loading, Notice, Pill, Row, Section, Textarea, TopBar, WhatsAppSheet, useToast } from '../../components/ui';
import { stepPill } from './Home';
import { quotePill } from './Orders';

export function useCanWrite() {
  const { workshop } = useAuth();
  return !!workshop && ['trial', 'active'].includes(accessOf(workshop));
}

export function ClientsList() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const { data, loading } = useLoad(async () => must(await supabase.from('clients').select('*').order('full_name')) as Client[]);
  const list = (data ?? []).filter((c) => (c.full_name + c.phone).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex flex-col gap-4">
      <TopBar title="Clients" right={<Button size="sm" onClick={() => nav('/clients/nouveau')}><UserPlus className="h-4 w-4" />Nouveau</Button>} />
      <Input placeholder="Rechercher par nom ou téléphone" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading ? <Loading /> : !list.length ? <Empty>{data?.length ? 'Aucun client trouvé.' : 'Ajoutez votre premier client.'}</Empty> : (
        <List>{list.map((c, i) => (
          <Row key={c.id} onClick={() => nav(`/clients/${c.id}`)} left={<Avatar name={c.full_name} tone={i} />} title={c.full_name} subtitle={c.phone || 'Pas de numéro'}
            right={c.user_id ? <Pill tone="ok">Espace actif</Pill> : <Pill>Sans espace</Pill>} />
        ))}</List>
      )}
    </div>
  );
}

export function ClientNew() {
  const nav = useNavigate();
  const { workshop } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ name: '', phone: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { data, error } = await supabase.from('clients').insert({ workshop_id: workshop!.id, full_name: f.name.trim(), phone: f.phone ? displayPhone(f.phone) : '', notes: f.notes }).select().single();
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast('Client ajouté');
    nav(`/clients/${data.id}`, { replace: true });
  };
  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
      <TopBar title="Nouveau client" back />
      <Field label="Nom complet"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
      <Field label="Numéro WhatsApp"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" placeholder="+223 ..." /></Field>
      <Field label="Notes (préférences, tissus...)"><Textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <Button type="submit" loading={busy}>Enregistrer le client</Button>
    </form>
  );
}

export function ClientDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const canWrite = useCanWrite();
  const { workshop } = useAuth();
  const [wa, setWa] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const { data, loading } = useLoad(async () => {
    const [c, m, o, q] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      supabase.from('measurements').select('*').eq('client_id', id).order('taken_at', { ascending: false }).limit(1),
      supabase.from('orders').select('*').eq('client_id', id).order('created_at', { ascending: false }),
      supabase.from('quotes').select('*').eq('client_id', id).order('created_at', { ascending: false })
    ]);
    return { c: must(c) as Client, m: (must(m) as Measurement[])[0], o: must(o) as Order[], q: must(q) as Quote[] };
  }, [id]);

  if (loading || !data) return <Loading />;
  const { c, m } = data;

  const invite = async () => {
    setInviting(true);
    const { data: token, error } = await supabase.rpc('create_invitation', { p_kind: 'client', p_client_id: c.id });
    setInviting(false);
    if (error) return toast(errMsg(error), 'err');
    setWa(`Bonjour ${c.full_name.split(' ')[0]}, ${workshop?.name} vous invite sur AtelierPro pour suivre vos commandes, vos devis et vos mesures.\n\nActivez votre espace (lien personnel valable 48 h) :\n${appUrl()}/invitation/${token}`);
  };

  return (
    <div className="flex flex-col gap-5">
      <TopBar title={c.full_name} back="/clients" />
      <Card>
        <div className="flex items-center gap-3">
          <Avatar name={c.full_name} />
          <div className="min-w-0 flex-1"><div className="font-bold">{c.phone || 'Pas de numéro'}</div><div className="text-xs text-muted">Client depuis {dateFr(c.created_at, { month: 'long', year: 'numeric' })}</div></div>
          {c.user_id ? <Pill tone="ok">Espace actif</Pill> : <Pill>Sans espace</Pill>}
        </div>
        {c.notes && <p className="mt-3 text-sm text-muted">{c.notes}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button size="sm" variant="ghost" onClick={() => nav(`/devis/nouveau?client=${c.id}`)} disabled={!canWrite}><FileText className="h-4 w-4" />Devis</Button>
          <Button size="sm" variant="ghost" onClick={() => nav(`/commandes/nouvelle?client=${c.id}`)} disabled={!canWrite}><Plus className="h-4 w-4" />Commande</Button>
          <Button size="sm" variant="ghost" onClick={() => nav(`/clients/${c.id}/mesures`)}><Ruler className="h-4 w-4" />Mesures</Button>
          {!c.user_id && <Button size="sm" variant="soft" onClick={invite} loading={inviting} disabled={!canWrite || !c.phone}><Send className="h-4 w-4" />Inviter</Button>}
        </div>
        {!c.user_id && !c.phone && <p className="mt-2 text-xs text-muted">Ajoutez un numéro WhatsApp pour pouvoir inviter ce client.</p>}
      </Card>

      <Section title="Mesures" action={<span className="text-xs text-muted">{m ? `Prises le ${dateFr(m.taken_at)}` : ''}</span>}>
        {m ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MEASURES.filter(([k]) => m.values[k] != null).slice(0, 8).map(([k, l]) => (
                <div key={k} className="rounded-xl border border-line bg-white p-3"><div className="text-xs text-muted">{l}</div><div className="text-lg font-extrabold tabular-nums">{m.values[k]} <span className="text-xs font-medium text-muted">cm</span></div></div>
              ))}
            </div>
            <button className="self-start text-sm font-semibold text-brand-700" onClick={() => nav(`/clients/${c.id}/mesures`)}>Toutes les mesures et l'historique ›</button>
          </>
        ) : <Empty>Pas encore de mesures. <button className="font-semibold text-brand-700" onClick={() => nav(`/clients/${c.id}/mesures`)}>Saisir les mesures</button></Empty>}
      </Section>

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Commandes">
          {data.o.length ? <List>{data.o.map((o) => <Row key={o.id} onClick={() => nav(`/commandes/${o.id}`)} title={o.title} subtitle={`${o.number} · ${money(o.price)}`} right={stepPill(o.step)} />)}</List> : <Empty>Aucune commande.</Empty>}
        </Section>
        <Section title="Devis">
          {data.q.length ? <List>{data.q.map((q) => <Row key={q.id} title={q.title} subtitle={`${q.number} · ${money(q.total)}`} right={quotePill(q.status)} />)}</List> : <Empty>Aucun devis.</Empty>}
        </Section>
      </div>
      <WhatsAppSheet open={!!wa} onClose={() => setWa(null)} to={c.full_name} phone={c.phone} text={wa ?? ''} />
    </div>
  );
}

export function ClientMeasures() {
  const { id = '' } = useParams();
  const toast = useToast();
  const canWrite = useCanWrite();
  const { workshop } = useAuth();
  const [edit, setEdit] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { data, loading, reload } = useLoad(async () => {
    const [c, m] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      supabase.from('measurements').select('*').eq('client_id', id).order('taken_at', { ascending: false })
    ]);
    return { c: must(c) as Client, list: must(m) as Measurement[] };
  }, [id]);

  if (loading || !data) return <Loading />;
  const [cur, prev] = data.list;

  const startEdit = () => {
    const v: Record<string, string> = {};
    MEASURES.forEach(([k]) => { v[k] = cur?.values[k] != null ? String(cur.values[k]) : ''; });
    setVals(v); setEdit(true);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const values: Record<string, number> = {};
    for (const [k] of MEASURES) { const n = parseFloat((vals[k] ?? '').replace(',', '.')); if (!isNaN(n) && n > 0) values[k] = n; }
    if (!Object.keys(values).length) return toast('Saisissez au moins une mesure.', 'err');
    setBusy(true);
    const { error } = await supabase.from('measurements').insert({ workshop_id: workshop!.id, client_id: id, values });
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast('Mesures enregistrées. L\'ancienne fiche reste dans l\'historique.');
    setEdit(false); reload();
  };

  if (!cur && !canWrite) return <div className="flex flex-col gap-4"><TopBar title={`Mesures · ${data.c.full_name}`} back /><Empty>Aucune mesure enregistrée.</Empty></div>;
  if (edit || !cur) {
    return (
      <form onSubmit={save} className="flex max-w-2xl flex-col gap-4">
        <TopBar title={`Mesures · ${data.c.full_name}`} back />
        <Notice>Valeurs en centimètres. Laissez vide ce qui ne s'applique pas.</Notice>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {MEASURES.map(([k, l]) => <Field key={k} label={l}><Input inputMode="decimal" value={vals[k] ?? ''} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} /></Field>)}
        </div>
        <div className="flex gap-2">{cur && <Button type="button" variant="ghost" onClick={() => setEdit(false)}>Annuler</Button>}<Button type="submit" loading={busy} className="flex-1">Enregistrer les mesures</Button></div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TopBar title={`Mesures · ${data.c.full_name}`} back right={canWrite ? <Button size="sm" variant="ghost" onClick={startEdit}>Nouvelle prise</Button> : undefined} />
      <div className="text-sm text-muted">Fiche du {dateFr(cur.taken_at)}{prev ? ` · comparée au ${dateFr(prev.taken_at)}` : ''}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MEASURES.filter(([k]) => cur.values[k] != null).map(([k, l]) => {
          const d = prev?.values[k] != null ? Math.round((cur.values[k] - prev.values[k]) * 10) / 10 : 0;
          return (
            <div key={k} className="rounded-xl border border-line bg-white p-3">
              <div className="text-xs text-muted">{l}</div>
              <div className="text-lg font-extrabold tabular-nums">{cur.values[k]} <span className="text-xs font-medium text-muted">cm</span></div>
              {d !== 0 && <div className={`text-xs font-bold ${d > 0 ? 'text-amber-700' : 'text-brand-700'}`}>{d > 0 ? '+' : ''}{d} cm</div>}
            </div>
          );
        })}
      </div>
      <Notice tone="warn">Ces mesures sont visibles uniquement par votre atelier et par le client dans son espace.</Notice>
      {data.list.length > 1 && (
        <Section title="Historique">
          <List>{data.list.slice(1).map((m) => <Row key={m.id} title={`Fiche du ${dateFr(m.taken_at)}`} subtitle={MEASURES.filter(([k]) => m.values[k] != null).slice(0, 4).map(([k, l]) => `${l.replace('Tour de ', '').replace('Longueur ', 'L. ')} ${m.values[k]}`).join(' · ')} />)}</List>
        </Section>
      )}
    </div>
  );
}
