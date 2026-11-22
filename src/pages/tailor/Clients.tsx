import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { UserPlus, Ruler, FileText, Plus, Send, Users, ShoppingBag, UserCog, Lock, Check } from 'lucide-react';
import { supabase, errMsg } from '../../lib/supabase';
import { must, useAuth, useLoad } from '../../lib/auth';
import { appUrl, dateFr, displayPhone, MEASURES, money } from '../../lib/format';
import { accessOf, type Client, type Measurement, type Order, type Profile, type Quote } from '../../lib/types';
import { Avatar, Button, Card, Chips, Empty, Field, Input, List, Loading, Notice, Pill, Row, Section, Sheet, Textarea, TopBar, WhatsAppSheet, useToast } from '../../components/ui';
import { stepPill } from './Home';
import { quotePill } from './Orders';

/** Membres de l'atelier (patron + employés), pour afficher les noms. */
export function useTeam() {
  const { workshop } = useAuth();
  const { data } = useLoad(async () => must(await supabase.from('profiles').select('id, full_name, role').eq('workshop_id', workshop!.id)) as Pick<Profile, 'id' | 'full_name' | 'role'>[], [workshop?.id]);
  const team = data ?? [];
  const owner = team.find((t) => t.role === 'tailor_owner');
  /** Nom du responsable d'un client (null = le patron). */
  const responsible = (assigned?: string | null) => assigned ? (team.find((t) => t.id === assigned)?.full_name || 'Employé') : `${owner?.full_name || 'le patron'} (patron)`;
  return { team, owner, responsible };
}

/** Peut-on modifier ce client et ce qui le concerne ? Le patron, ou l'employé responsable. */
export function useCanManage(client?: Pick<Client, 'assigned_to'> | null) {
  const { profile } = useAuth();
  const canWrite = useCanWrite();
  if (!canWrite || !client) return false;
  return profile?.role === 'tailor_owner' || client.assigned_to === profile?.id;
}

/** « par Awa » : auteur d'un enregistrement. */
export function By({ name, prefix = 'par' }: { name?: string | null; prefix?: string }) {
  if (!name) return null;
  return <span className="whitespace-nowrap">{prefix} {name}</span>;
}

export function useCanWrite() {
  const { workshop, profile, overLimit } = useAuth();
  if (!workshop || !['trial', 'active'].includes(accessOf(workshop))) return false;
  // employé d'un atelier qui dépasse son nombre de comptes : lecture seule
  return !(overLimit && profile?.role === 'tailor_staff');
}

export function ClientsList() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const { team, responsible } = useTeam();
  const isOwner = profile?.role === 'tailor_owner';
  const [q, setQ] = useState('');
  const [who, setWho] = useState<'all' | 'mine'>('all');
  const { data, loading } = useLoad(async () => must(await supabase.from('clients').select('*').order('full_name')) as Client[]);
  const mine = (c: Client) => (isOwner ? !c.assigned_to : c.assigned_to === profile?.id);
  const list = (data ?? []).filter((c) => (who === 'all' || mine(c)) && (c.full_name + c.phone).toLowerCase().includes(q.toLowerCase()));
  const hasTeam = team.length > 1;
  return (
    <div className="flex flex-col gap-4">
      <TopBar icon={Users} tone="green" title="Clients" right={<Button size="sm" onClick={() => nav('/clients/nouveau')}><UserPlus className="h-4 w-4" />Nouveau</Button>} />
      <Input placeholder="Rechercher par nom ou téléphone" value={q} onChange={(e) => setQ(e.target.value)} />
      {hasTeam && <Chips value={who} onChange={setWho} options={[['all', 'Tous les clients'], ['mine', isOwner ? 'Suivis par moi' : 'Mes clients']]} />}
      {loading ? <Loading /> : !list.length ? <Empty icon={Users} tone="green">{data?.length ? 'Aucun client trouvé.' : 'Ajoutez votre premier client.'}</Empty> : (
        <List>{list.map((c, i) => (
          <Row key={c.id} onClick={() => nav(`/clients/${c.id}`)} left={<Avatar name={c.full_name} tone={i} />} title={c.full_name}
            subtitle={hasTeam ? <><span className={c.assigned_to === profile?.id || (isOwner && !c.assigned_to) ? 'font-bold text-brand-700' : ''}>Suivi par {c.assigned_to === profile?.id || (isOwner && !c.assigned_to) ? 'vous' : responsible(c.assigned_to).replace(' (patron)', '')}</span>{c.phone ? ` · ${c.phone}` : ''}</> : (c.phone || 'Pas de numéro')}
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
      <TopBar icon={UserPlus} tone="green" title="Nouveau client" back />
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
  const { workshop, profile } = useAuth();
  const { team, responsible } = useTeam();
  const [wa, setWa] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data, loading, reload } = useLoad(async () => {
    const [c, m, o, q] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      supabase.from('measurements').select('*').eq('client_id', id).order('taken_at', { ascending: false }).limit(1),
      supabase.from('orders').select('*').eq('client_id', id).order('created_at', { ascending: false }),
      supabase.from('quotes').select('*').eq('client_id', id).order('created_at', { ascending: false })
    ]);
    return { c: must(c) as Client, m: (must(m) as Measurement[])[0], o: must(o) as Order[], q: must(q) as Quote[] };
  }, [id]);

  const canManage = useCanManage(data?.c);
  if (loading || !data) return <Loading />;
  const { c, m } = data;
  const isOwner = profile?.role === 'tailor_owner';
  const hasTeam = team.length > 1;
  const assign = async (pid: string | null) => {
    setBusy(true);
    const { error } = await supabase.rpc('assign_client', { p_client_id: c.id, p_profile_id: pid });
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    setAssignOpen(false); toast(`${c.full_name} est maintenant suivi par ${pid ? responsible(pid) : 'vous'}`); reload();
  };

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
          <div className="min-w-0 flex-1"><div className="font-bold">{c.phone || 'Pas de numéro'}</div><div className="text-xs text-muted">Client depuis {dateFr(c.created_at, { month: 'long', year: 'numeric' })}{c.created_by_name ? ` · enregistré par ${c.created_by_name}` : ''}</div></div>
          {c.user_id ? <Pill tone="ok">Espace actif</Pill> : <Pill>Sans espace</Pill>}
        </div>
        {c.notes && <p className="mt-3 text-sm text-muted">{c.notes}</p>}
        {hasTeam && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm">
            <UserCog className="h-4 w-4 shrink-0 text-brand-700" />
            <span className="min-w-0 flex-1">Suivi par <b>{c.assigned_to === profile?.id ? 'vous' : responsible(c.assigned_to)}</b></span>
            {isOwner && <button type="button" className="shrink-0 font-semibold text-brand-700" onClick={() => setAssignOpen(true)}>Changer</button>}
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button size="sm" variant="ghost" className="!border-transparent !bg-[#EDE9FE] !text-[#5B21B6]" onClick={() => nav(`/devis/nouveau?client=${c.id}`)} disabled={!canManage}><FileText className="h-4 w-4" />Devis</Button>
          <Button size="sm" variant="ghost" className="!border-transparent !bg-[#DBEAFE] !text-[#1E40AF]" onClick={() => nav(`/commandes/nouvelle?client=${c.id}`)} disabled={!canManage}><Plus className="h-4 w-4" />Commande</Button>
          <Button size="sm" variant="ghost" className="!border-transparent !bg-[#CCFBF1] !text-[#115E59]" onClick={() => nav(`/clients/${c.id}/mesures`)}><Ruler className="h-4 w-4" />Mesures</Button>
          {!c.user_id && <Button size="sm" variant="whatsapp" onClick={invite} loading={inviting} disabled={!canManage || !c.phone}><Send className="h-4 w-4" />Inviter</Button>}
        </div>
        {!c.user_id && !c.phone && <p className="mt-2 text-xs text-muted">Ajoutez un numéro WhatsApp pour pouvoir inviter ce client.</p>}
      </Card>
      {!canManage && hasTeam && <Notice><Lock className="mr-1 inline h-4 w-4" />Ce client est suivi par {responsible(c.assigned_to)}. Vous pouvez consulter sa fiche ; seuls {responsible(c.assigned_to)} et le patron peuvent la modifier.</Notice>}

      <Section title="Mesures" action={<span className="text-xs text-muted">{m ? `Prises le ${dateFr(m.taken_at)}${m.created_by_name ? ` par ${m.created_by_name}` : ''}` : ''}</span>}>
        {m ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MEASURES.filter(([k]) => m.values[k] != null).slice(0, 8).map(([k, l]) => (
                <div key={k} className="rounded-xl border border-[#CCFBF1] bg-[#F0FDFA] p-3"><div className="text-xs text-muted">{l}</div><div className="text-lg font-extrabold tabular-nums">{m.values[k]} <span className="text-xs font-medium text-muted">cm</span></div></div>
              ))}
            </div>
            <button className="self-start text-sm font-semibold text-brand-700" onClick={() => nav(`/clients/${c.id}/mesures`)}>Toutes les mesures et l'historique ›</button>
          </>
        ) : <Empty>Pas encore de mesures. <button className="font-semibold text-brand-700" onClick={() => nav(`/clients/${c.id}/mesures`)}>Saisir les mesures</button></Empty>}
      </Section>

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Commandes">
          {data.o.length ? <List>{data.o.map((o) => <Row key={o.id} onClick={() => nav(`/commandes/${o.id}`)} title={o.title} subtitle={`${o.number} · ${money(o.price)}${o.created_by_name ? ` · par ${o.created_by_name}` : ''}`} right={stepPill(o.step)} />)}</List> : <Empty icon={ShoppingBag} tone="indigo">Aucune commande.</Empty>}
        </Section>
        <Section title="Devis">
          {data.q.length ? <List>{data.q.map((q) => <Row key={q.id} onClick={() => nav(`/devis/${q.id}`)} title={q.title} subtitle={`${q.number} · ${money(q.total)}${q.created_by_name ? ` · par ${q.created_by_name}` : ''}`} right={quotePill(q.status)} />)}</List> : <Empty icon={FileText} tone="violet">Aucun devis.</Empty>}
        </Section>
      </div>
      <WhatsAppSheet open={!!wa} onClose={() => setWa(null)} to={c.full_name} phone={c.phone} text={wa ?? ''} />
      <Sheet open={assignOpen} onClose={() => setAssignOpen(false)} title={`Qui suit ${c.full_name} ?`}>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Seuls la personne choisie et vous pourrez modifier ce client, ses mesures, devis, commandes et paiements. Les autres employés pourront seulement le consulter.</p>
          <List>{[{ id: null as string | null, label: `Moi (${team.find((t) => t.role === 'tailor_owner')?.full_name || 'patron'})` }, ...team.filter((t) => t.role === 'tailor_staff').map((t) => ({ id: t.id as string | null, label: t.full_name || 'Employé' }))].map((o) => (
            <Row key={o.id ?? 'owner'} onClick={busy ? undefined : () => assign(o.id)} left={<Avatar name={o.label} />} title={o.label}
              right={(c.assigned_to ?? null) === o.id ? <Check className="h-5 w-5 text-brand-600" /> : undefined} />
          ))}</List>
        </div>
      </Sheet>
    </div>
  );
}

export function ClientMeasures() {
  const { id = '' } = useParams();
  const toast = useToast();
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

  const canWrite = useCanManage(data?.c); // patron ou employé responsable du client
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

  if (!cur && !canWrite) return <div className="flex flex-col gap-4"><TopBar icon={Ruler} tone="teal" title={`Mesures · ${data.c.full_name}`} back /><Empty>Aucune mesure enregistrée.</Empty></div>;
  if (edit || !cur) {
    return (
      <form onSubmit={save} className="flex max-w-2xl flex-col gap-4">
        <TopBar icon={Ruler} tone="teal" title={`Mesures · ${data.c.full_name}`} back />
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
      <TopBar icon={Ruler} tone="teal" title={`Mesures · ${data.c.full_name}`} back right={canWrite ? <Button size="sm" variant="ghost" onClick={startEdit}>Nouvelle prise</Button> : undefined} />
      <div className="text-sm text-muted">Fiche du {dateFr(cur.taken_at)}{cur.created_by_name ? `, prise par ${cur.created_by_name}` : ''}{prev ? ` · comparée au ${dateFr(prev.taken_at)}` : ''}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MEASURES.filter(([k]) => cur.values[k] != null).map(([k, l]) => {
          const d = prev?.values[k] != null ? Math.round((cur.values[k] - prev.values[k]) * 10) / 10 : 0;
          return (
            <div key={k} className="rounded-xl border border-[#CCFBF1] bg-[#F0FDFA] p-3">
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
          <List>{data.list.slice(1).map((m) => <Row key={m.id} title={`Fiche du ${dateFr(m.taken_at)}${m.created_by_name ? ` · par ${m.created_by_name}` : ''}`} subtitle={MEASURES.filter(([k]) => m.values[k] != null).slice(0, 4).map(([k, l]) => `${l.replace('Tour de ', '').replace('Longueur ', 'L. ')} ${m.values[k]}`).join(' · ')} />)}</List>
        </Section>
      )}
    </div>
  );
}
