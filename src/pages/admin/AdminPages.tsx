import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExternalLink, Plus, ShieldCheck } from 'lucide-react';
import { supabase, errMsg } from '../../lib/supabase';
import { must, useAuth, useLoad } from '../../lib/auth';
import { dateFr, dateTimeFr, daysLeft, METHODS, money } from '../../lib/format';
import { accessOf, type Access, type AdminLog, type PaymentRequest, type Plan, type Profile, type Settings, type Workshop } from '../../lib/types';
import { Avatar, Button, Card, Chips, Empty, Field, Input, KV, List, Loading, Notice, Pill, Row, Section, Select, Sheet, Stat, Textarea, TopBar, useToast } from '../../components/ui';
import { ChangePassword } from '../auth/AuthPages';

export function accessPill(a: Access) {
  return { active: <Pill tone="ok">Actif</Pill>, trial: <Pill tone="warn">Essai</Pill>, expired: <Pill>Expiré</Pill>, suspended: <Pill tone="danger">Suspendu</Pill> }[a];
}
const accessInfo = (w: Workshop, plans: Plan[]) => {
  const a = accessOf(w);
  if (a === 'active') return `${plans.find((p) => p.id === w.plan_id)?.name ?? 'Forfait'} · jusqu'au ${dateFr(w.subscription_ends_at)}`;
  if (a === 'trial') return `Essai · ${daysLeft(w.trial_ends_at)} j restants`;
  if (a === 'expired') return `Expiré depuis le ${dateFr(w.subscription_ends_at ?? w.trial_ends_at)}`;
  return 'Compte suspendu';
};

function useAdminData() {
  return useLoad(async () => {
    const [w, p, r, pr, c] = await Promise.all([
      supabase.from('workshops').select('*').order('created_at', { ascending: false }),
      supabase.from('plans').select('*').order('sort_order'),
      supabase.from('payment_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').in('role', ['tailor_owner', 'tailor_staff']),
      supabase.from('clients').select('id, workshop_id')
    ]);
    return { ws: must(w) as Workshop[], plans: must(p) as Plan[], reqs: must(r) as PaymentRequest[], profiles: must(pr) as Profile[], clients: must(c) as { id: string; workshop_id: string }[] };
  });
}

export function AdminHome() {
  const nav = useNavigate();
  const { data, loading } = useAdminData();
  const { data: logs } = useLoad(async () => must(await supabase.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(5)) as AdminLog[]);
  if (loading || !data) return <Loading />;
  const cnt = (a: Access) => data.ws.filter((w) => accessOf(w) === a).length;
  const pending = data.reqs.filter((r) => r.status === 'pending');
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const month = data.reqs.filter((r) => r.status === 'validated' && r.reviewed_at && new Date(r.reviewed_at) >= monthStart).reduce((s, r) => s + r.amount, 0);
  const total = data.reqs.filter((r) => r.status === 'validated').reduce((s, r) => s + r.amount, 0);
  const ending = data.ws.filter((w) => accessOf(w) === 'trial' && daysLeft(w.trial_ends_at) <= 7);
  const name = (id: string) => data.ws.find((w) => w.id === id)?.name ?? '—';
  return (
    <div className="flex flex-col gap-5">
      <TopBar title="Tableau de bord" sub="Superadministrateur" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat tone="blue" label="Ateliers" value={data.ws.length} sub={`${cnt('active')} actifs · ${cnt('trial')} en essai`} />
        <Stat label="Clients sur la plateforme" value={data.clients.length} />
        <Stat label="Encaissé ce mois" value={money(month)} />
        <Stat label="Encaissé au total" value={money(total)} />
      </div>
      <Card onClick={() => nav('/admin/paiements')} className={pending.length ? '!border-amber-200 !bg-amber-50' : ''}>
        <div className="flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wider text-muted">Paiements à vérifier</span><span className="text-2xl font-extrabold">{pending.length}</span></div>
        <div className="text-sm text-muted">Aucun accès payant n'est ouvert avant votre validation.</div>
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Demandes en attente">
          {pending.length ? <List>{pending.slice(0, 5).map((r) => <Row key={r.id} onClick={() => nav(`/admin/paiements/${r.id}`)} title={name(r.workshop_id)} subtitle={`${METHODS[r.method].label} · ${dateTimeFr(r.created_at)}`} right={<span className="font-semibold tabular-nums">{money(r.amount)}</span>} />)}</List> : <Empty>Rien à vérifier.</Empty>}
        </Section>
        <Section title="Essais qui se terminent (7 jours)">
          {ending.length ? <List>{ending.map((w) => <Row key={w.id} onClick={() => nav(`/admin/ateliers/${w.id}`)} left={<Avatar name={w.name} />} title={w.name} subtitle={accessInfo(w, data.plans)} />)}</List> : <Empty>Aucun essai ne se termine cette semaine.</Empty>}
        </Section>
      </div>
      <Section title="Journal récent" action={<button className="text-sm font-semibold text-brand-700" onClick={() => nav('/admin/journal')}>Tout voir</button>}>
        {logs?.length ? <List>{logs.map((l) => <Row key={l.id} title={logLabel(l)} subtitle={dateTimeFr(l.created_at)} />)}</List> : <Empty>Aucune opération.</Empty>}
      </Section>
    </div>
  );
}

export function AdminPayments() {
  const nav = useNavigate();
  const [f, setF] = useState<'pending' | 'validated' | 'rejected'>('pending');
  const { data, loading } = useAdminData();
  if (loading || !data) return <Loading />;
  const list = data.reqs.filter((r) => r.status === f);
  const name = (id: string) => data.ws.find((w) => w.id === id)?.name ?? '—';
  return (
    <div className="flex flex-col gap-4">
      <TopBar title="Paiements" />
      <Chips value={f} onChange={setF} options={[['pending', 'À vérifier'], ['validated', 'Validés'], ['rejected', 'Rejetés']]} />
      {list.length ? <List>{list.map((r) => (
        <Row key={r.id} onClick={() => nav(`/admin/paiements/${r.id}`)}
          left={<span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-extrabold" style={{ background: METHODS[r.method].bg, color: METHODS[r.method].fg }}>{METHODS[r.method].short}</span>}
          title={name(r.workshop_id)} subtitle={`${data.plans.find((p) => p.id === r.plan_id)?.name} ${r.months} mois · réf. ${r.reference} · ${dateTimeFr(r.created_at)}`}
          right={<span className="font-semibold tabular-nums">{money(r.amount)}</span>} />
      ))}</List> : <Empty>Aucune demande ici.</Empty>}
    </div>
  );
}

export function AdminPayment() {
  const { id = '' } = useParams();
  const toast = useToast();
  const [rej, setRej] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const { data, loading, reload } = useLoad(async () => {
    const r = must(await supabase.from('payment_requests').select('*').eq('id', id).single()) as PaymentRequest;
    const [w, p, s] = await Promise.all([
      supabase.from('workshops').select('*').eq('id', r.workshop_id).single(),
      supabase.from('plans').select('*').eq('id', r.plan_id).single(),
      supabase.from('platform_settings').select('*').single()
    ]);
    const owner = must(await supabase.from('profiles').select('*').eq('id', (w.data as Workshop).owner_id).maybeSingle()) as Profile | null;
    const signed = await supabase.storage.from('payment-proofs').createSignedUrl(r.proof_path, 600);
    setProofUrl(signed.data?.signedUrl ?? null);
    return { r, w: must(w) as Workshop, p: must(p) as Plan, s: must(s) as Settings, owner };
  }, [id]);
  if (loading || !data) return <Loading />;
  const { r, w, p, s } = data;
  const num = { orange_money: s.number_orange_money, wave: s.number_wave, moov_money: s.number_moov_money }[r.method];
  const review = async (approve: boolean) => {
    setBusy(true);
    const { error } = await supabase.rpc('admin_review_payment', { p_id: r.id, p_approve: approve, p_reason: approve ? null : reason });
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast(approve ? 'Paiement validé, abonnement activé' : 'Paiement rejeté, atelier notifié'); setRej(false); reload();
  };
  const isPdf = r.proof_path.toLowerCase().endsWith('.pdf');
  return (
    <div className="flex flex-col gap-4">
      <TopBar title="Demande de paiement" back="/admin/paiements" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex items-center gap-3"><Avatar name={w.name} /><div className="min-w-0 flex-1"><div className="truncate font-bold">{w.name}</div><div className="text-xs text-muted">{data.owner?.full_name} · {data.owner?.phone} · {w.city}</div></div>{accessPill(accessOf(w))}</div>
          </Card>
          <Card>
            <KV k="Forfait demandé" v={`${p.name} · ${r.months} mois`} />
            <KV k="Montant attendu" v={money(r.amount)} />
            <KV k="Moyen" v={`${METHODS[r.method].label} · ${num}`} />
            <KV strong k="Référence" v={<span className="select-all">{r.reference}</span>} />
            <KV k="Reçue" v={dateTimeFr(r.created_at)} />
            {r.reviewed_at && <KV k="Traitée" v={dateTimeFr(r.reviewed_at)} />}
          </Card>
        </div>
        <Card>
          <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">Preuve jointe</h2>{proofUrl && <a href={proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">Ouvrir <ExternalLink className="h-4 w-4" /></a>}</div>
          {proofUrl ? (isPdf ? <Notice>Document PDF : ouvrez-le avec le lien ci-dessus.</Notice> : <img src={proofUrl} alt="Preuve de paiement" className="max-h-[420px] w-full rounded-xl border border-line object-contain" />) : <Empty>Preuve indisponible.</Empty>}
        </Card>
      </div>
      {r.status === 'pending' ? (
        <>
          <Notice tone="warn"><b>Vérifiez que la référence {r.reference} et le montant de {money(r.amount)} apparaissent bien dans l'historique de votre compte {METHODS[r.method].label}</b> avant de valider. Une capture seule ne suffit pas.</Notice>
          {rej ? (
            <Card>
              <Field label="Motif du rejet">
                <Chips value={reason} onChange={setReason} options={[['Référence introuvable', 'Référence introuvable'], ['Montant incorrect', 'Montant incorrect'], ['Preuve illisible', 'Preuve illisible']]} />
              </Field>
              <Textarea className="mt-3" rows={2} placeholder="Ou précisez le motif" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="mt-3 flex gap-2"><Button variant="ghost" onClick={() => setRej(false)}>Annuler</Button><Button variant="danger" className="flex-1" disabled={!reason.trim()} loading={busy} onClick={() => review(false)}>Confirmer le rejet</Button></div>
            </Card>
          ) : (
            <div className="flex gap-2 md:max-w-lg"><Button variant="danger" className="flex-1" onClick={() => setRej(true)}>Rejeter</Button><Button className="flex-1" loading={busy} onClick={() => review(true)}><ShieldCheck className="h-4 w-4" />Valider et activer</Button></div>
          )}
        </>
      ) : <Notice tone={r.status === 'validated' ? 'ok' : 'danger'}>{r.status === 'validated' ? 'Validé : l\'abonnement a été activé automatiquement.' : `Rejeté : ${r.reject_reason}. L'atelier a été notifié.`}</Notice>}
    </div>
  );
}

export function AdminWorkshops() {
  const nav = useNavigate();
  const [f, setF] = useState<'all' | Access>('all');
  const [q, setQ] = useState('');
  const { data, loading } = useAdminData();
  if (loading || !data) return <Loading />;
  const owner = (w: Workshop) => data.profiles.find((p) => p.id === w.owner_id);
  const list = data.ws.filter((w) => (f === 'all' || accessOf(w) === f) && (w.name + (owner(w)?.full_name ?? '') + w.city).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex flex-col gap-4">
      <TopBar title="Ateliers" />
      <Input placeholder="Rechercher un atelier, un tailleur, une ville" value={q} onChange={(e) => setQ(e.target.value)} />
      <Chips value={f} onChange={setF} options={[['all', 'Tous'], ['trial', 'Essai'], ['active', 'Actifs'], ['expired', 'Expirés'], ['suspended', 'Suspendus']]} />
      {list.length ? <List>{list.map((w, i) => (
        <Row key={w.id} onClick={() => nav(`/admin/ateliers/${w.id}`)} left={<Avatar name={w.name} tone={i} />} title={w.name}
          subtitle={`${owner(w)?.full_name ?? '—'} · ${w.city || '—'} · ${data.clients.filter((c) => c.workshop_id === w.id).length} clients · ${accessInfo(w, data.plans)}`} right={accessPill(accessOf(w))} />
      ))}</List> : <Empty>Aucun atelier.</Empty>}
    </div>
  );
}

export function AdminWorkshop() {
  const { id = '' } = useParams();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [plan, setPlan] = useState('');
  const [months, setMonths] = useState('1');
  const [days, setDays] = useState('7');
  const { data, loading, reload } = useAdminData();
  if (loading || !data) return <Loading />;
  const w = data.ws.find((x) => x.id === id);
  if (!w) return <Empty>Atelier introuvable.</Empty>;
  const team = data.profiles.filter((p) => p.workshop_id === w.id);
  const reqs = data.reqs.filter((r) => r.workshop_id === w.id);
  const a = accessOf(w);
  const run = async (key: string, fn: string, args: Record<string, unknown>, ok: string) => {
    setBusy(key);
    const { error } = await supabase.rpc(fn, args);
    setBusy('');
    if (error) return toast(errMsg(error), 'err');
    toast(ok); reload();
  };
  return (
    <div className="flex flex-col gap-5">
      <TopBar title={w.name} back="/admin/ateliers" />
      <Card>
        <div className="flex items-center gap-3"><Avatar name={w.name} /><div className="min-w-0 flex-1"><div className="font-bold">{w.city || '—'} · {w.phone || '—'}</div><div className="text-xs text-muted">Inscrit le {dateFr(w.created_at)} · {data.clients.filter((c) => c.workshop_id === w.id).length} clients</div></div>{accessPill(a)}</div>
        <div className="mt-3 text-sm">{accessInfo(w, data.plans)}</div>
      </Card>
      <Notice>Vous voyez les informations du compte. Les mesures des clients restent visibles uniquement par l'atelier.</Notice>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">Prolonger l'essai</h2>
          <div className="flex gap-2"><Select value={days} onChange={(e) => setDays(e.target.value)} className="!w-32">{['7', '15', '30'].map((d) => <option key={d} value={d}>{d} jours</option>)}</Select>
            <Button variant="soft" className="flex-1" loading={busy === 'trial'} onClick={() => run('trial', 'admin_extend_trial', { p_workshop: w.id, p_days: Number(days) }, `Essai prolongé de ${days} jours`)}>Prolonger</Button></div>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Activer ou prolonger un abonnement</h2>
          <div className="flex flex-col gap-2">
            <Select value={plan || w.plan_id || ''} onChange={(e) => setPlan(e.target.value)}><option value="">Choisir un forfait</option>{data.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <div className="flex gap-2"><Select value={months} onChange={(e) => setMonths(e.target.value)} className="!w-32">{['1', '3', '6', '12'].map((m) => <option key={m} value={m}>{m} mois</option>)}</Select>
              <Button variant="soft" className="flex-1" disabled={!(plan || w.plan_id)} loading={busy === 'sub'} onClick={() => run('sub', 'admin_extend_subscription', { p_workshop: w.id, p_plan: plan || w.plan_id, p_months: Number(months) }, 'Abonnement prolongé')}>Appliquer</Button></div>
            <p className="text-xs text-muted">Pour un geste commercial. Les paiements déclarés se valident dans Paiements.</p>
          </div>
        </Card>
      </div>
      {w.is_suspended
        ? <Button className="md:max-w-xs" loading={busy === 'sus'} onClick={() => run('sus', 'admin_set_suspended', { p_workshop: w.id, p_suspended: false }, 'Compte réactivé')}>Réactiver le compte</Button>
        : <Button variant="danger" className="md:max-w-xs" loading={busy === 'sus'} onClick={() => run('sus', 'admin_set_suspended', { p_workshop: w.id, p_suspended: true }, 'Compte suspendu')}>Suspendre le compte</Button>}
      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Équipe"><List>{team.map((p) => <Row key={p.id} title={p.full_name || '—'} subtitle={`${p.role === 'tailor_owner' ? 'Propriétaire' : 'Employé'} · ${p.phone}`} />)}</List></Section>
        <Section title="Paiements">{reqs.length ? <List>{reqs.map((r) => <Row key={r.id} title={`${money(r.amount)} · ${r.months} mois`} subtitle={`${dateFr(r.created_at)} · ${METHODS[r.method].label}`} right={r.status === 'validated' ? <Pill tone="ok">Validé</Pill> : r.status === 'rejected' ? <Pill tone="danger">Rejeté</Pill> : <Pill tone="warn">En attente</Pill>} />)}</List> : <Empty>Aucun paiement.</Empty>}</Section>
      </div>
    </div>
  );
}

export function AdminPlans() {
  const toast = useToast();
  const [edit, setEdit] = useState<Partial<Plan> | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, loading, reload } = useLoad(async () => must(await supabase.from('plans').select('*').order('sort_order')) as Plan[]);
  const { data: settings, reload: reloadS } = useLoad(async () => must(await supabase.from('platform_settings').select('*').single()) as Settings);
  const [trial, setTrial] = useState<string>('');
  if (loading || !data) return <Loading />;
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!edit) return;
    setBusy(true);
    const row = { name: edit.name, price_monthly: Number(edit.price_monthly) || 0, max_staff: Number(edit.max_staff) || 1, max_clients: edit.max_clients ? Number(edit.max_clients) : null, perks: edit.perks ?? [], is_active: edit.is_active ?? true, sort_order: Number(edit.sort_order) || data.length + 1 };
    const { error } = edit.id ? await supabase.from('plans').update(row).eq('id', edit.id) : await supabase.from('plans').insert(row);
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    setEdit(null); toast('Forfait enregistré, visible par les tailleurs'); reload();
  };
  const saveTrial = async () => {
    const n = parseInt(trial, 10); if (isNaN(n)) return;
    const { error } = await supabase.from('platform_settings').update({ trial_days: n }).eq('id', 1);
    if (error) return toast(errMsg(error), 'err');
    toast('Durée d\'essai enregistrée pour les nouveaux ateliers'); setTrial(''); reloadS();
  };
  return (
    <div className="flex flex-col gap-4">
      <TopBar title="Forfaits" right={<Button size="sm" onClick={() => setEdit({ name: '', price_monthly: 0, max_staff: 1, perks: [], is_active: true })}><Plus className="h-4 w-4" />Nouveau</Button>} />
      <div className="grid gap-3 md:grid-cols-3">
        {data.map((p) => (
          <Card key={p.id} onClick={() => setEdit(p)} className={p.is_active ? '' : 'opacity-60'}>
            <div className="flex items-center justify-between"><span className="font-bold">{p.name}</span>{!p.is_active && <Pill>Masqué</Pill>}</div>
            <div className="text-xl font-extrabold tabular-nums">{money(p.price_monthly)} <span className="text-sm font-medium text-muted">/ mois</span></div>
            <div className="text-xs text-muted">{p.max_staff} compte(s) max{p.max_clients ? ` · ${p.max_clients} clients max` : ''}</div>
            <ul className="mt-2 list-disc pl-4 text-xs text-muted">{p.perks.map((x) => <li key={x}>{x}</li>)}</ul>
            <div className="mt-2 text-sm font-semibold text-brand-700">Modifier ›</div>
          </Card>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1"><div className="font-bold">Essai gratuit</div><div className="text-sm text-muted">Actuellement {settings?.trial_days ?? '…'} jours, appliqué à chaque nouvel atelier.</div></div>
          <Input className="!w-28" inputMode="numeric" placeholder="Jours" value={trial} onChange={(e) => setTrial(e.target.value)} />
          <Button size="sm" variant="soft" onClick={saveTrial} disabled={!trial}>Enregistrer</Button>
        </div>
      </Card>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Modifier le forfait' : 'Nouveau forfait'}>
        {edit && <form onSubmit={save} className="flex flex-col gap-4">
          <Field label="Nom"><Input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix mensuel (FCFA)"><Input inputMode="numeric" value={edit.price_monthly ?? ''} onChange={(e) => setEdit({ ...edit, price_monthly: Number(e.target.value.replace(/\D/g, '')) })} required /></Field>
            <Field label="Comptes max"><Input inputMode="numeric" value={edit.max_staff ?? ''} onChange={(e) => setEdit({ ...edit, max_staff: Number(e.target.value.replace(/\D/g, '')) })} required /></Field>
          </div>
          <Field label="Clients max (vide = illimité)"><Input inputMode="numeric" value={edit.max_clients ?? ''} onChange={(e) => setEdit({ ...edit, max_clients: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} /></Field>
          <Field label="Avantages (un par ligne)"><Textarea rows={3} value={(edit.perks ?? []).join('\n')} onChange={(e) => setEdit({ ...edit, perks: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} /></Field>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={edit.is_active ?? true} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} className="h-4 w-4" />Proposé aux tailleurs</label>
          <Button type="submit" loading={busy}>Enregistrer</Button>
        </form>}
      </Sheet>
    </div>
  );
}

export function AdminSettings() {
  const toast = useToast();
  const { signOut } = useAuth();
  const nav = useNavigate();
  const { data, loading, reload } = useLoad(async () => must(await supabase.from('platform_settings').select('*').single()) as Settings);
  const [f, setF] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading || !data) return <Loading />;
  const v = f ?? data;
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.from('platform_settings').update({ number_orange_money: v.number_orange_money, number_wave: v.number_wave, number_moov_money: v.number_moov_money, beneficiary_name: v.beneficiary_name, trial_max_staff: v.trial_max_staff }).eq('id', 1);
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast('Réglages enregistrés'); setF(null); reload();
  };
  const set = (k: keyof Settings) => (e: { target: { value: string } }) => setF({ ...v, [k]: k === 'trial_max_staff' ? Number(e.target.value) || 1 : e.target.value });
  return (
    <div className="flex flex-col gap-6">
      <TopBar title="Réglages" />
      <form onSubmit={save} className="flex max-w-xl flex-col gap-4">
        <h2 className="font-bold">Numéros de dépôt affichés aux tailleurs</h2>
        {!data.number_orange_money && !data.number_wave && !data.number_moov_money && <Notice tone="warn">Aucun numéro configuré : les tailleurs ne peuvent pas encore payer leur abonnement.</Notice>}
        <Field label="Orange Money" hint="Laissez vide pour désactiver ce moyen."><Input value={v.number_orange_money} onChange={set('number_orange_money')} inputMode="tel" placeholder="+223 ..." /></Field>
        <Field label="Wave"><Input value={v.number_wave} onChange={set('number_wave')} inputMode="tel" placeholder="+223 ..." /></Field>
        <Field label="Moov Money"><Input value={v.number_moov_money} onChange={set('number_moov_money')} inputMode="tel" placeholder="+223 ..." /></Field>
        <Field label="Nom du bénéficiaire affiché"><Input value={v.beneficiary_name} onChange={set('beneficiary_name')} /></Field>
        <Field label="Comptes inclus pendant l'essai"><Input inputMode="numeric" value={String(v.trial_max_staff)} onChange={set('trial_max_staff')} /></Field>
        <Button type="submit" loading={busy}>Enregistrer</Button>
      </form>
      <List>
        <Row onClick={() => nav('/admin/journal')} title="Journal des opérations" subtitle="Validations, suspensions, forfaits, réglages" right={<span className="text-muted">›</span>} />
      </List>
      <div className="flex max-w-xl flex-col gap-3"><h2 className="font-bold">Mon mot de passe</h2><ChangePassword /><Button variant="ghost" onClick={signOut}>Se déconnecter</Button></div>
    </div>
  );
}

const LOG_LABELS: Record<string, string> = {
  payment_validated: 'Paiement validé', payment_rejected: 'Paiement rejeté', workshop_suspended: 'Atelier suspendu', workshop_reactivated: 'Atelier réactivé',
  trial_extended: 'Essai prolongé', subscription_extended: 'Abonnement prolongé', plan_created: 'Forfait créé', plan_updated: 'Forfait modifié', settings_updated: 'Réglages modifiés'
};
function logLabel(l: AdminLog & { ws?: string }) {
  const d = l.details as Record<string, string | number>;
  const extra = [d.plan, d.months ? `${d.months} mois` : '', d.days ? `${d.days} jours` : '', d.amount ? money(Number(d.amount)) : '', d.reason, d.reference ? `réf. ${d.reference}` : ''].filter(Boolean).join(' · ');
  return `${LOG_LABELS[l.action] ?? l.action}${l.ws ? ' · ' + l.ws : ''}${extra ? ' · ' + extra : ''}`;
}

export function AdminLogs() {
  const { data, loading } = useLoad(async () => {
    const [l, w] = await Promise.all([supabase.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(300), supabase.from('workshops').select('id, name')]);
    const ws = must(w) as { id: string; name: string }[];
    return (must(l) as AdminLog[]).map((x) => ({ ...x, ws: ws.find((y) => y.id === x.workshop_id)?.name }));
  });
  return (
    <div className="flex flex-col gap-4">
      <TopBar title="Journal des opérations" back />
      {loading ? <Loading /> : data?.length ? <List>{data.map((l) => <Row key={l.id} title={logLabel(l)} subtitle={dateTimeFr(l.created_at)} />)}</List> : <Empty>Aucune opération enregistrée.</Empty>}
    </div>
  );
}
