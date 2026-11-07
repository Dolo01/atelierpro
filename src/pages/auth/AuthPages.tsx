import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, errMsg } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { dateTimeFr, displayPhone, phoneToEmail } from '../../lib/format';
import { Button, Field, Input, Loading, Notice } from '../../components/ui';

function AuthFrame({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="min-h-full bg-white md:grid md:grid-cols-2">
      <div className="relative flex min-h-[260px] flex-col justify-end overflow-hidden bg-cover bg-center p-6 text-white md:min-h-screen md:p-12"
        style={{ backgroundImage: 'linear-gradient(180deg, rgba(15,30,61,.15), rgba(29,78,216,.88)), url(/login-hero.jpg)' }}>
        <div className="flex items-center gap-2.5"><img src="/logo.svg" alt="" className="h-10 w-10 rounded-xl ring-2 ring-white" /><span className="text-xs font-bold uppercase tracking-widest">{eyebrow}</span></div>
        <h1 className="mt-3 max-w-md text-3xl font-extrabold leading-tight md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-md text-sm text-white/85 md:text-base">{subtitle}</p>}
      </div>
      <div className="flex items-start justify-center px-4 py-8 md:items-center md:px-12">
        <div className="flex w-full max-w-md flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}

export function Login() {
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    const id = phone.trim();
    const email = id.includes('@') ? id.toLowerCase() : phoneToEmail(id);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) setErr(errMsg(error)); else nav('/', { replace: true });
  };
  return (
    <AuthFrame eyebrow="AtelierPro" title="Bon retour à l'atelier" subtitle="Clients, mesures, commandes et paiements au même endroit.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h2 className="text-2xl font-extrabold">Connexion</h2>
        <Field label="Téléphone ou email"><Input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="username" placeholder="+223 76 00 00 00" required /></Field>
        <Field label="Mot de passe"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></Field>
        {err && <Notice tone="danger">{err}</Notice>}
        <Button type="submit" loading={busy}>Se connecter</Button>
      </form>
      <div className="rounded-2xl bg-brand-50 p-4 text-sm"><div className="font-bold">Nouvel atelier ?</div><div className="text-muted">30 jours d'essai offerts, sans paiement.</div><Link to="/inscription" className="mt-2 inline-block font-semibold text-brand-700 underline underline-offset-4">Créer mon atelier</Link></div>
      <p className="text-xs text-muted">Vous êtes client d'un atelier ? Utilisez le lien d'invitation reçu sur WhatsApp pour activer votre espace, puis connectez-vous ici.</p>
    </AuthFrame>
  );
}

export function Signup() {
  const nav = useNavigate();
  const { refresh, session, profile } = useAuth();
  const [f, setF] = useState({ atelier: '', name: '', phone: '', city: '', pw: '', pw2: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const alreadyIn = session && profile?.role === 'pending';

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    if (!alreadyIn && f.pw !== f.pw2) return setErr('Les deux mots de passe ne sont pas identiques.');
    setBusy(true);
    try {
      if (!alreadyIn) {
        const { data, error } = await supabase.auth.signUp({ email: phoneToEmail(f.phone), password: f.pw, options: { data: { full_name: f.name, phone: displayPhone(f.phone) } } });
        if (error) throw error;
        if (!data.session) throw new Error('Email not confirmed');
      }
      const { error: e2 } = await supabase.rpc('register_workshop', { p_name: f.atelier, p_city: f.city, p_phone: displayPhone(f.phone || profile?.phone || ''), p_full_name: f.name });
      if (e2) throw e2;
      await refresh();
      nav('/accueil', { replace: true });
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };

  return (
    <AuthFrame eyebrow="Inscription" title="Créez votre atelier" subtitle="L'essai gratuit de 30 jours démarre tout de suite. Aucun paiement demandé.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h2 className="text-2xl font-extrabold">Mon atelier</h2>
        <Field label="Nom de l'atelier"><Input value={f.atelier} onChange={set('atelier')} placeholder="Ex. Atelier Sababu Couture" required minLength={2} /></Field>
        <Field label="Votre nom complet"><Input value={f.name} onChange={set('name')} required /></Field>
        {!alreadyIn && <Field label="Téléphone WhatsApp" hint="Il vous servira d'identifiant de connexion."><Input value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="+223 76 00 00 00" required /></Field>}
        <Field label="Ville et quartier"><Input value={f.city} onChange={set('city')} placeholder="Bamako, Hamdallaye" /></Field>
        {!alreadyIn && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mot de passe"><Input type="password" value={f.pw} onChange={set('pw')} minLength={6} required autoComplete="new-password" /></Field>
          <Field label="Confirmer"><Input type="password" value={f.pw2} onChange={set('pw2')} minLength={6} required autoComplete="new-password" /></Field>
        </div>}
        {err && <Notice tone="danger">{err}</Notice>}
        <Button type="submit" loading={busy}>Démarrer l'essai gratuit</Button>
      </form>
      {!alreadyIn && <p className="text-sm text-muted">Déjà inscrit ? <Link to="/connexion" className="font-semibold text-brand-700 underline underline-offset-4">Se connecter</Link></p>}
    </AuthFrame>
  );
}

interface InvInfo { status: 'ok' | 'used' | 'expired' | 'invalid'; kind?: 'client' | 'staff'; workshop?: string; name?: string; phone?: string; expires_at?: string }

export function Invitation() {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const { session, profile, refresh } = useAuth();
  const [info, setInfo] = useState<InvInfo | null>(null);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    supabase.rpc('get_invitation', { p_token: token }).then(({ data }) => {
      const d = (data ?? { status: 'invalid' }) as InvInfo;
      setInfo(d); setPhone(d.phone ?? ''); setName(d.name ?? '');
    });
  }, [token]);

  const finish = async () => {
    const { data, error } = await supabase.rpc('accept_invitation', { p_token: token, p_full_name: name });
    if (error) throw error;
    await refresh();
    nav(data === 'client' ? '/espace' : '/accueil', { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    setBusy(true);
    try {
      if (!session) {
        if (pw !== pw2) throw new Error('Les deux mots de passe ne sont pas identiques.');
        const email = phoneToEmail(phone);
        const up = await supabase.auth.signUp({ email, password: pw, options: { data: { full_name: name, phone: displayPhone(phone) } } });
        if (up.error && /already registered/i.test(up.error.message)) {
          const si = await supabase.auth.signInWithPassword({ email, password: pw });
          if (si.error) throw new Error('Un compte existe déjà avec ce numéro : saisissez son mot de passe.');
        } else if (up.error) throw up.error;
        else if (!up.data.session) throw new Error('Email not confirmed');
      }
      await finish();
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };

  if (!info) return <Loading />;
  if (info.status !== 'ok') {
    const msg = { used: 'Ce lien a déjà été utilisé. Connectez-vous avec votre numéro et votre mot de passe.', expired: 'Ce lien a expiré. Demandez un nouveau lien à votre atelier.', invalid: 'Ce lien d\'invitation n\'est pas valide.' }[info.status];
    return (
      <AuthFrame eyebrow="Invitation" title="Lien d'invitation">
        <Notice tone="warn">{msg}</Notice>
        <Link to="/connexion"><Button className="w-full">Aller à la connexion</Button></Link>
      </AuthFrame>
    );
  }
  const isClient = info.kind === 'client';
  return (
    <AuthFrame eyebrow="Invitation AtelierPro" title={`${info.workshop} vous invite`}
      subtitle={isClient ? 'Suivez vos commandes, vos devis, vos paiements et vos mesures.' : 'Rejoignez l\'équipe de l\'atelier.'}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h2 className="text-2xl font-extrabold">{isClient ? 'Activer mon espace client' : 'Rejoindre l\'atelier'}</h2>
        <p className="text-xs text-muted">Lien personnel, valable jusqu'au {dateTimeFr(info.expires_at)}, utilisable une seule fois.</p>
        <Field label="Nom complet"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        {session ? (
          <Notice>Vous êtes connecté avec le numéro {profile?.phone || '—'}. L'invitation sera liée à ce compte.</Notice>
        ) : (
          <>
            <Field label="Numéro de téléphone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mot de passe"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} required autoComplete="new-password" /></Field>
              <Field label="Confirmer"><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={6} required autoComplete="new-password" /></Field>
            </div>
          </>
        )}
        {err && <Notice tone="danger">{err}</Notice>}
        <Button type="submit" loading={busy}>{isClient ? 'Activer mon espace' : 'Rejoindre'}</Button>
      </form>
    </AuthFrame>
  );
}

export function Pending() {
  const { signOut, profile, refresh } = useAuth();
  const nav = useNavigate();
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (profile && profile.role !== 'pending') nav('/', { replace: true }); }, [profile, nav]);
  return (
    <AuthFrame eyebrow="AtelierPro" title={`Bonjour ${profile?.full_name || ''}`.trim()} subtitle="Votre compte n'est rattaché à aucun espace pour le moment.">
      <Notice>Si vous êtes tailleur, créez votre atelier. Si vous êtes client, ouvrez le lien d'invitation reçu de votre atelier sur WhatsApp.</Notice>
      <Link to="/inscription"><Button className="w-full">Créer mon atelier</Button></Link>
      <Button variant="ghost" onClick={signOut}>Se déconnecter</Button>
    </AuthFrame>
  );
}

export function Suspended() {
  const { signOut, workshop } = useAuth();
  return (
    <AuthFrame eyebrow="Compte suspendu" title={workshop?.name ?? 'Atelier'} subtitle="L'accès à cet atelier a été suspendu par l'administrateur de la plateforme.">
      <Notice tone="warn">Contactez l'administrateur AtelierPro pour connaître la raison et réactiver votre compte.</Notice>
      <Button variant="ghost" onClick={signOut}>Se déconnecter</Button>
    </AuthFrame>
  );
}

export function ChangePassword() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'danger'; m: string } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) return setMsg({ t: 'danger', m: 'Les deux mots de passe ne sont pas identiques.' });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    setMsg(error ? { t: 'danger', m: errMsg(error) } : { t: 'ok', m: 'Mot de passe modifié.' });
    if (!error) { setPw(''); setPw2(''); }
  };
  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-4">
      <Field label="Nouveau mot de passe"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} required autoComplete="new-password" /></Field>
      <Field label="Confirmer"><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={6} required autoComplete="new-password" /></Field>
      {msg && <Notice tone={msg.t}>{msg.m}</Notice>}
      <Button type="submit" loading={busy}>Changer le mot de passe</Button>
    </form>
  );
}
