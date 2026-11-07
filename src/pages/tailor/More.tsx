import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, CreditCard, Home as HomeIcon, KeyRound, LogOut, Paperclip, Plus, Trash2, Users } from 'lucide-react';
import { supabase, errMsg } from '../../lib/supabase';
import { must, useAuth, useLoad } from '../../lib/auth';
import { appUrl, dateFr, daysLeft, METHODS, money, type MethodKey } from '../../lib/format';
import { accessOf, paidOf, type Appointment, type Client, type Order, type OrderPayment, type PaymentRequest, type Plan, type Profile, type Settings } from '../../lib/types';
import { Avatar, Button, Card, Chips, Empty, Field, Input, KV, List, Loading, Notice, Pill, Row, Section, Select, Sheet, Stat, TopBar, WhatsAppSheet, useToast } from '../../components/ui';
import { ChangePassword } from '../auth/AuthPages';
import { useCanWrite } from './Clients';

// ---------------- Agenda ----------------
export function Agenda() {
  const toast = useToast();
  const canWrite = useCanWrite();
  const { workshop } = useAuth();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ client: '', date: new Date().toISOString().slice(0, 10), time: '10:00', purpose: 'Essayage' });
  const [busy, setBusy] = useState(false);
  const { data, loading, reload } = useLoad(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const [a, c] = await Promise.all([
      supabase.from('appointments').select('*').gte('starts_at', start.toISOString()).order('starts_at').limit(100),
      supabase.from('clients').select('id, full_name').order('full_name')
    ]);
    return { a: must(a) as Appointment[], c: must(c) as Pick<Client, 'id' | 'full_name'>[] };
  });
  if (loading || !data) return <Loading />;
  const name = (id: string | null) => data.c.find((c) => c.id === id)?.full_name ?? 'Sans client';
  const groups = new Map<string, Appointment[]>();
  data.a.forEach((r) => { const k = new Date(r.starts_at).toDateString(); groups.set(k, [...(groups.get(k) ?? []), r]); });
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.from('appointments').insert({ workshop_id: workshop!.id, client_id: f.client || null, starts_at: new Date(`${f.date}T${f.time}`).toISOString(), purpose: f.purpose });
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    setOpen(false); toast('Rendez-vous ajouté'); reload();
  };
  const del = async (id: string) => { await supabase.from('appointments').delete().eq('id', id); reload(); };
  return (
    <div className="flex flex-col gap-4">
      <TopBar title="Agenda" right={canWrite ? <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Rendez-vous</Button> : undefined} />
      {!data.a.length && <Empty>Aucun rendez-vous à venir.</Empty>}
      {[...groups.entries()].map(([k, list]) => (
        <Section key={k} title={dateFr(k, { weekday: 'long', day: 'numeric', month: 'long' })}>
          <List>{list.map((r) => (
            <Row key={r.id} left={<span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-xs font-bold text-brand-700">{new Date(r.starts_at).toTimeString().slice(0, 5)}</span>}
              title={name(r.client_id)} subtitle={r.purpose}
              right={canWrite ? <button aria-label="Supprimer" onClick={() => del(r.id)} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-canvas"><Trash2 className="h-4 w-4" /></button> : undefined} />
          ))}</List>
        </Section>
      ))}
      <Sheet open={open} onClose={() => setOpen(false)} title="Nouveau rendez-vous">
        <form onSubmit={save} className="flex flex-col gap-4">
          <Field label="Client"><Select value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })}><option value="">Sans client</option>{data.c.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Jour"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Field><Field label="Heure"><Input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} required /></Field></div>
          <Field label="Objet"><Input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></Field>
          <Button type="submit" loading={busy}>Ajouter</Button>
        </form>
      </Sheet>
    </div>
  );
}

// ---------------- Plus ----------------
export function More() {
  const nav = useNavigate();
  const { workshop, profile, signOut } = useAuth();
  const a = workshop ? accessOf(workshop) : 'expired';
  const subLabel = a === 'active' ? `Actif jusqu'au ${dateFr(workshop!.subscription_ends_at)}` : a === 'trial' ? `Essai · ${daysLeft(workshop!.trial_ends_at)} j restants` : 'Expiré';
  const owner = profile?.role === 'tailor_owner';
  const items: [string, typeof CreditCard, string, string, boolean][] = [
    ['/plus/abonnement', CreditCard, 'Abonnement', subLabel, owner],
    ['/plus/rapports', BarChart3, 'Rapports financiers', 'Encaissements et soldes', true],
    ['/plus/employes', Users, 'Employés', 'Équipe de l\'atelier', true],
    ['/plus/atelier', HomeIcon, 'Profil et mot de passe', 'Nom, adresse, sécurité', true]
  ];
  return (
    <div className="flex flex-col gap-4">
      <TopBar title="Plus" />
      <div className="flex items-center gap-3 rounded-2xl bg-brand-600 p-4 text-white">
        <Avatar name={profile?.full_name || 'A'} />
        <div className="min-w-0"><div className="truncate font-bold">{profile?.full_name}</div><div className="truncate text-sm text-white/85">{workshop?.name} · {owner ? 'Propriétaire' : 'Employé'}</div></div>
      </div>
      <List>
        {items.filter((i) => i[4]).map(([to, I, l, d]) => <Row key={to} onClick={() => nav(to)} left={<span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700"><I className="h-5 w-5" /></span>} title={l} subtitle={d} right={<span className="text-muted">›</span>} />)}
        <Row onClick={signOut} left={<span className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-600"><LogOut className="h-5 w-5" /></span>} title="Se déconnecter" />
      </List>
    </div>
  );
}

// ---------------- Abonnement ----------------
export function Subscription() {
  const { workshop, refresh } = useAuth();
  const toast = useToast();
  const [months, setMonths] = useState<'1' | '3' | '6' | '12'>('1');
  const [plan, setPlan] = useState<string>('');
  const [method, setMethod] = useState<MethodKey | ''>('');
  const [step, setStep] = useState(1);
  const [ref, setRef] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, loading, reload } = useLoad(async () => {
    const [p, s, r] = await Promise.all([
      supabase.from('plans').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('platform_settings').select('*').single(),
      supabase.from('payment_requests').select('*').order('created_at', { ascending: false })
    ]);
    return { plans: must(p) as Plan[], settings: must(s) as Settings, reqs: must(r) as PaymentRequest[] };
  }, [workshop?.id]);
  if (loading || !data || !workshop) return <Loading />;
  const a = accessOf(workshop);
  const pending = data.reqs.find((r) => r.status === 'pending');
  const planName = (id: string | null) => data.plans.find((p) => p.id === id)?.name ?? 'Forfait';
  const numberOf = (m: MethodKey) => ({ orange_money: data.settings.number_orange_money, wave: data.settings.number_wave, moov_money: data.settings.number_moov_money })[m];
  const chosen = data.plans.find((p) => p.id === plan);
  const amount = (chosen?.price_monthly ?? 0) * Number(months);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !chosen || !method) return;
    setBusy(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${workshop.id}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from('payment-proofs').upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from('payment_requests').insert({ workshop_id: workshop.id, plan_id: chosen.id, months: Number(months), amount, method, reference: ref.trim(), proof_path: path, created_by: u.user!.id });
      if (error) throw error;
      toast('Demande envoyée. L\'administrateur va vérifier votre dépôt.');
      setStep(1); setRef(''); setFile(null); reload(); refresh();
    } catch (x) { toast(errMsg(x), 'err'); } finally { setBusy(false); }
  };

  const history = data.reqs.length > 0 && (
    <Section title="Historique des paiements">
      <List>{data.reqs.map((r) => (
        <Row key={r.id} title={`${planName(r.plan_id)} · ${r.months} mois`} subtitle={`${dateFr(r.created_at)} · ${METHODS[r.method].label} · réf. ${r.reference}${r.reject_reason ? ' · ' + r.reject_reason : ''}`}
          right={<div className="text-right"><div className="text-sm font-semibold tabular-nums">{money(r.amount)}</div>{r.status === 'validated' ? <Pill tone="ok">Validé</Pill> : r.status === 'rejected' ? <Pill tone="danger">Rejeté</Pill> : <Pill tone="warn">En vérification</Pill>}</div>} />
      ))}</List>
    </Section>
  );

  const status = (
    <Card className={a === 'active' ? '!border-transparent !bg-brand-600 text-white' : ''}>
      <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">{a === 'active' ? 'Forfait actif' : a === 'trial' ? 'Essai gratuit' : a === 'expired' ? 'Accès expiré' : 'Suspendu'}</div>
      <div className="text-2xl font-extrabold">{a === 'active' ? planName(workshop.plan_id) : a === 'trial' ? `${daysLeft(workshop.trial_ends_at)} jours restants` : 'Choisissez un forfait'}</div>
      <div className="text-sm opacity-85">{a === 'active' ? `Valable jusqu'au ${dateFr(workshop.subscription_ends_at)}` : a === 'trial' ? `Fin de l'essai le ${dateFr(workshop.trial_ends_at)}` : 'Vos données sont conservées.'}</div>
    </Card>
  );

  if (pending) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <TopBar title="Abonnement" back />
        {status}
        <Card>
          <Pill tone="warn">En cours de vérification</Pill>
          <div className="mt-2 text-xl font-extrabold">{planName(pending.plan_id)} · {pending.months} mois</div>
          <KV k="Montant déposé" v={money(pending.amount)} /><KV k="Moyen" v={METHODS[pending.method].label} /><KV k="Référence" v={pending.reference} /><KV k="Envoyée le" v={dateFr(pending.created_at)} />
        </Card>
        <Notice tone="warn">L'administrateur vérifie le dépôt sur son compte {METHODS[pending.method].label}. Votre forfait s'active dès sa validation. Aucun accès payant n'est ouvert avant.</Notice>
        {history}
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <TopBar title="Abonnement" back />
      {status}
      {step === 1 && (
        <>
          <Section title={a === 'active' ? 'Prolonger ou changer de forfait' : 'Choisir un forfait'}>
            <Chips value={months} onChange={setMonths} options={[['1', '1 mois'], ['3', '3 mois'], ['6', '6 mois'], ['12', '12 mois']]} />
            <div className="grid gap-3 md:grid-cols-3">
              {data.plans.map((p) => (
                <button key={p.id} onClick={() => setPlan(p.id)} aria-pressed={plan === p.id}
                  className={`flex flex-col gap-1 rounded-2xl border-2 bg-white p-4 text-left ${plan === p.id ? 'border-brand-600 ring-4 ring-brand-100' : 'border-line'}`}>
                  <div className="font-bold">{p.name}</div>
                  <div className="text-xl font-extrabold tabular-nums">{money(p.price_monthly * Number(months))}</div>
                  <div className="text-xs text-muted">{money(p.price_monthly)} / mois</div>
                  <ul className="mt-1 list-disc pl-4 text-xs text-muted">{p.perks.map((x) => <li key={x}>{x}</li>)}</ul>
                </button>
              ))}
            </div>
          </Section>
          <Button disabled={!plan} onClick={() => setStep(2)}>Continuer</Button>
        </>
      )}
      {step === 2 && (
        <>
          <Section title="Moyen de paiement">
            {(Object.keys(METHODS) as MethodKey[]).map((k) => {
              const n = numberOf(k);
              return (
                <button key={k} disabled={!n} onClick={() => setMethod(k)} aria-pressed={method === k}
                  className={`flex items-center gap-3 rounded-2xl border-2 bg-white p-3 text-left disabled:opacity-40 ${method === k ? 'border-brand-600' : 'border-line'}`}>
                  <span className="grid h-10 w-10 place-items-center rounded-xl text-xs font-extrabold" style={{ background: METHODS[k].bg, color: METHODS[k].fg }}>{METHODS[k].short}</span>
                  <span><span className="block font-bold">{METHODS[k].label}</span><span className="text-xs text-muted">{n ? 'Dépôt direct sur le numéro AtelierPro' : 'Non disponible pour le moment'}</span></span>
                </button>
              );
            })}
          </Section>
          <Notice>Aucun paiement en ligne : vous faites un dépôt depuis votre téléphone, puis vous déclarez la référence et la preuve.</Notice>
          <div className="flex gap-2"><Button variant="ghost" onClick={() => setStep(1)}>Retour</Button><Button className="flex-1" disabled={!method} onClick={() => setStep(3)}>Continuer</Button></div>
        </>
      )}
      {step === 3 && method && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-brand-500 bg-white p-5 text-center">
            <span className="text-xs text-muted">Déposez exactement</span>
            <span className="text-2xl font-extrabold tabular-nums">{money(amount)}</span>
            <span className="text-xs text-muted">sur le numéro {METHODS[method].label}</span>
            <span className="select-all text-2xl font-extrabold text-brand-700">{numberOf(method)}</span>
            <span className="text-xs text-muted">Bénéficiaire : {data.settings.beneficiary_name}</span>
            <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => navigator.clipboard?.writeText(numberOf(method)).then(() => toast('Numéro copié'), () => {})}>Copier le numéro</Button>
          </div>
          <Field label="Référence de la transaction" hint="Elle figure dans le SMS de confirmation."><Input value={ref} onChange={(e) => setRef(e.target.value)} minLength={4} required /></Field>
          <Field label="Preuve du dépôt (capture du SMS ou de l'application)">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-line bg-white p-3 text-sm hover:border-brand-200">
              <Paperclip className="h-5 w-5 text-muted" /><span className="min-w-0 flex-1 truncate">{file ? file.name : 'Choisir une image ou un PDF (5 Mo max)'}</span>
              <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </Field>
          <div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => setStep(2)}>Retour</Button><Button type="submit" className="flex-1" loading={busy} disabled={!file || ref.trim().length < 4}>Envoyer pour vérification</Button></div>
        </form>
      )}
      {history}
    </div>
  );
}

// ---------------- Rapports ----------------
export function Reports() {
  const nav = useNavigate();
  const { data, loading } = useLoad(async () => {
    const [o, p, c] = await Promise.all([supabase.from('orders').select('*'), supabase.from('order_payments').select('*'), supabase.from('clients').select('id, full_name')]);
    return { o: must(o) as Order[], p: must(p) as OrderPayment[], c: must(c) as Pick<Client, 'id' | 'full_name'>[] };
  });
  if (loading || !data) return <Loading />;
  const months: { k: string; label: string; v: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    months.push({ k, label: dateFr(d, { month: 'short' }), v: 0 });
  }
  data.p.forEach((x) => { const d = new Date(x.paid_at); const m = months.find((m) => m.k === `${d.getFullYear()}-${d.getMonth()}`); if (m) m.v += x.amount; });
  const max = Math.max(1, ...months.map((m) => m.v));
  const owed = data.o.map((o) => ({ o, rest: o.price - paidOf(data.p, o.id) })).filter((x) => x.rest > 0).sort((a, b) => b.rest - a.rest);
  const name = (id: string) => data.c.find((c) => c.id === id)?.full_name ?? '—';
  const year = new Date().getFullYear();
  return (
    <div className="flex flex-col gap-5">
      <TopBar title="Rapports financiers" back />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat tone="blue" label="Encaissé ce mois" value={money(months[5].v)} />
        <Stat label={`Encaissé ${year}`} value={money(data.p.filter((x) => new Date(x.paid_at).getFullYear() === year).reduce((s, x) => s + x.amount, 0))} />
        <Stat label="Soldes dus" value={money(owed.reduce((s, x) => s + x.rest, 0))} />
        <Stat label="Commandes livrées" value={data.o.filter((o) => o.step === 5).length} />
      </div>
      <Card>
        <h2 className="font-bold">Encaissements des 6 derniers mois</h2>
        <div className="mt-4 flex h-44 items-end gap-3">
          {months.map((m, i) => (
            <div key={m.k} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-[10px] font-semibold text-muted tabular-nums">{m.v ? Math.round(m.v / 1000) + 'k' : ''}</span>
              <div className={`w-full rounded-t-lg ${i === 5 ? 'bg-brand-600' : 'bg-brand-200'}`} style={{ height: `${Math.max(3, (m.v / max) * 100)}%` }} title={money(m.v)} />
              <span className="text-xs font-semibold capitalize text-muted">{m.label}</span>
            </div>
          ))}
        </div>
      </Card>
      <Section title="Clients avec un solde">
        {owed.length ? <List>{owed.map(({ o, rest }) => <Row key={o.id} onClick={() => nav(`/commandes/${o.id}`)} title={name(o.client_id)} subtitle={`${o.number} · ${o.title}`} right={<span className="font-semibold tabular-nums text-amber-700">{money(rest)}</span>} />)}</List> : <Empty>Aucun solde en attente.</Empty>}
      </Section>
    </div>
  );
}

// ---------------- Employés ----------------
export function Staff() {
  const { workshop, profile } = useAuth();
  const toast = useToast();
  const canWrite = useCanWrite();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [open, setOpen] = useState(false);
  const [wa, setWa] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, loading } = useLoad(async () => {
    const [s, p, st] = await Promise.all([
      supabase.from('profiles').select('*').eq('workshop_id', workshop!.id),
      workshop?.plan_id ? supabase.from('plans').select('*').eq('id', workshop.plan_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from('platform_settings').select('trial_max_staff').single()
    ]);
    return { staff: must(s) as Profile[], plan: (p.data as Plan | null), trialMax: (st.data as { trial_max_staff: number } | null)?.trial_max_staff ?? 1 };
  }, [workshop?.id]);
  if (loading || !data || !workshop) return <Loading />;
  const limit = accessOf(workshop) === 'active' ? data.plan?.max_staff ?? 1 : data.trialMax;
  const can = data.staff.length < limit;
  const owner = profile?.role === 'tailor_owner';
  const invite = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { data: token, error } = await supabase.rpc('create_invitation', { p_kind: 'staff', p_staff_name: name });
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    setOpen(false);
    setWa(`Bonjour ${name.split(' ')[0]}, ${workshop.name} vous invite à rejoindre l'équipe sur AtelierPro.\nCréez votre accès (lien valable 48 h) :\n${appUrl()}/invitation/${token}`);
  };
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <TopBar title="Employés" back />
      <Card>
        <div className="flex justify-between text-sm"><span className="text-muted">Places utilisées</span><span className="font-bold tabular-nums">{data.staff.length} / {limit}</span></div>
        <div className="mt-2 flex gap-1">{Array.from({ length: limit }).map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < data.staff.length ? 'bg-brand-600' : 'bg-line'}`} />)}</div>
      </Card>
      <List>{data.staff.map((s, i) => <Row key={s.id} left={<Avatar name={s.full_name || '?'} tone={i} />} title={s.full_name || 'Sans nom'} subtitle={s.role === 'tailor_owner' ? 'Propriétaire' : 'Employé'} />)}</List>
      {owner && (can ? <Button onClick={() => setOpen(true)} disabled={!canWrite}><Plus className="h-4 w-4" />Inviter un employé</Button>
        : <Notice>Votre {accessOf(workshop) === 'active' ? 'forfait' : 'essai'} inclut {limit} compte(s). Passez à un forfait supérieur pour ajouter des employés.</Notice>)}
      <Sheet open={open} onClose={() => setOpen(false)} title="Inviter un employé">
        <form onSubmit={invite} className="flex flex-col gap-4">
          <Field label="Nom de l'employé"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="Numéro WhatsApp"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required /></Field>
          <Button type="submit" loading={busy}>Créer le lien d'invitation</Button>
        </form>
      </Sheet>
      <WhatsAppSheet open={!!wa} onClose={() => setWa(null)} to={name} phone={phone} text={wa ?? ''} />
    </div>
  );
}

// ---------------- Profil de l'atelier ----------------
export function WorkshopProfile() {
  const { workshop, profile, refresh } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ name: workshop?.name ?? '', city: workshop?.city ?? '', phone: workshop?.phone ?? '' });
  const [busy, setBusy] = useState(false);
  const owner = profile?.role === 'tailor_owner';
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.from('workshops').update(f).eq('id', workshop!.id);
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast('Profil enregistré'); refresh();
  };
  return (
    <div className="flex flex-col gap-6">
      <TopBar title="Profil et sécurité" back />
      {owner && (
        <form onSubmit={save} className="flex max-w-md flex-col gap-4">
          <h2 className="font-bold">Atelier</h2>
          <Field label="Nom de l'atelier"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="Adresse"><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
          <Field label="Téléphone de l'atelier"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Button type="submit" loading={busy}>Enregistrer</Button>
        </form>
      )}
      <div className="flex flex-col gap-3"><h2 className="font-bold"><KeyRound className="mr-1 inline h-4 w-4" />Mot de passe</h2><ChangePassword /></div>
    </div>
  );
}
