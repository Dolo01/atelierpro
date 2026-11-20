import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, X, MessageCircle, Info, AlertTriangle, CheckCircle2, ChevronRight, type LucideIcon } from 'lucide-react';
import { TONES, avatarTone, type Tone } from '../lib/tones';
import { initials } from '../lib/format';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Button({ variant = 'primary', size = 'md', loading, className, children, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'soft' | 'danger' | 'dark' | 'whatsapp'; size?: 'sm' | 'md'; loading?: boolean }) {
  const v = {
    primary: 'bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[0_8px_16px_-8px_rgba(29,78,216,0.75),inset_0_1px_0_rgba(255,255,255,0.25)] hover:to-brand-700',
    ghost: 'bg-white text-ink border border-line hover:bg-canvas',
    soft: 'bg-brand-100 text-brand-700 hover:bg-brand-200',
    danger: 'bg-white text-red-700 border-[1.5px] border-red-200 hover:bg-red-50',
    dark: 'bg-ink text-white hover:bg-black',
    whatsapp: 'bg-[#25D366] text-white shadow-[0_8px_16px_-8px_rgba(37,211,102,0.8)] hover:brightness-95'
  }[variant];
  const s = size === 'sm' ? 'px-3 py-2 text-sm rounded-xl' : 'px-4 py-3 rounded-2xl';
  return (
    <button {...p} disabled={p.disabled || loading}
      className={cx('inline-flex items-center justify-center gap-2 font-bold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2', v, s, className)}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}
    </button>
  );
}

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  const C = onClick ? 'button' : 'div';
  return <C onClick={onClick} className={cx('block w-full text-left rounded-2xl border border-line bg-white p-4', onClick && 'hover:border-brand-200 transition', className)}>{children}</C>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold text-muted">{label}</span>{children}{hint && <span className="text-xs text-muted">{hint}</span>}</label>;
}
const inputCls = 'w-full min-w-0 rounded-xl border border-line bg-white px-3.5 py-3 text-ink placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(inputCls, p.className)} />;

export function Pill({ tone = 'grey', children }: { tone?: 'blue' | 'ok' | 'warn' | 'danger' | 'grey'; children: ReactNode }) {
  const t = { blue: 'bg-brand-100 text-brand-700', ok: 'bg-green-100 text-green-700', warn: 'bg-amber-100 text-amber-800', danger: 'bg-red-100 text-red-700', grey: 'bg-slate-100 text-slate-600' }[tone];
  return <span className={cx('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', t)}>{children}</span>;
}

export function Avatar({ name }: { name: string; tone?: number }) {
  const t = TONES[avatarTone(name)];
  return <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold" style={{ background: t.bg, color: t.text }}>{initials(name)}</span>;
}

/** Icône posée sur une pastille de couleur. */
export function IconTile({ icon: I, tone, size = 40, solid }: { icon: LucideIcon; tone: Tone; size?: number; solid?: boolean }) {
  const t = TONES[tone];
  return (
    <span className="grid shrink-0 place-items-center"
      style={{ width: size, height: size, borderRadius: size * 0.3, background: solid ? t.fg : t.bg, color: solid ? '#FFFFFF' : t.fg, boxShadow: solid ? `0 6px 12px -6px ${t.fg}` : undefined }}>
      <I style={{ width: size * 0.52, height: size * 0.52 }} strokeWidth={2.1} />
    </span>
  );
}

export function TopBar({ title, back, right, sub, icon, tone = 'blue' }: { title: string; back?: boolean | string; right?: ReactNode; sub?: string; icon?: LucideIcon; tone?: Tone }) {
  const nav = useNavigate();
  return (
    <div className="flex items-center gap-3 py-1">
      {back && <button type="button" aria-label="Retour" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-line bg-white hover:bg-canvas"><ArrowLeft className="h-5 w-5" /></button>}
      {icon && <IconTile icon={icon} tone={tone} size={44} />}
      <div className="min-w-0 flex-1">
        {sub && <div className="text-xs font-semibold text-muted">{sub}</div>}
        <h1 className="truncate text-xl font-extrabold tracking-tight md:text-2xl">{title}</h1>
      </div>
      {right}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="flex flex-col gap-2.5"><div className="flex items-baseline justify-between"><h2 className="text-base font-bold">{title}</h2>{action}</div>{children}</section>;
}

export function List({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">{children}</div>;
}
export function Row({ left, title, subtitle, right, onClick }: { left?: ReactNode; title: ReactNode; subtitle?: ReactNode; right?: ReactNode; onClick?: () => void }) {
  const C = onClick ? 'button' : 'div';
  return (
    <C onClick={onClick} className={cx('flex w-full items-center gap-3 px-4 py-3 text-left', onClick && 'hover:bg-canvas')}>
      {left}
      <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{title}</span>{subtitle && <span className="block truncate text-xs text-muted">{subtitle}</span>}</span>
      {right}
      {onClick && !right && <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
    </C>
  );
}

export function KV({ k, v, strong }: { k: ReactNode; v: ReactNode; strong?: boolean }) {
  return <div className={cx('flex justify-between gap-3 border-b border-dashed border-line py-2.5 text-sm last:border-0', strong && 'font-bold')}><span className={strong ? '' : 'text-muted'}>{k}</span><span className="text-right tabular-nums">{v}</span></div>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode }) {
  const t = { info: 'bg-brand-50 text-brand-700', warn: 'bg-amber-50 text-amber-900', danger: 'bg-red-50 text-red-700', ok: 'bg-green-50 text-green-800' }[tone];
  const I = { info: Info, warn: AlertTriangle, danger: AlertTriangle, ok: CheckCircle2 }[tone];
  return <div className={cx('flex gap-2.5 rounded-xl p-3 text-sm', t)}><I className="mt-0.5 h-4 w-4 shrink-0" /><div>{children}</div></div>;
}

export function Empty({ children, icon, tone = 'slate' }: { children: ReactNode; icon?: LucideIcon; tone?: Tone }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-white px-4 py-8 text-center text-sm text-muted">
      {icon && <IconTile icon={icon} tone={tone} size={48} />}
      <div>{children}</div>
    </div>
  );
}

export function Loading() {
  // Si le chargement traîne (réseau coupé, erreur), on propose de réessayer au lieu d'un sablier sans fin.
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 12000); return () => clearTimeout(t); }, []);
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-brand-600">
      <Loader2 className="h-7 w-7 animate-spin" />
      {slow && <div className="text-center text-sm text-muted">La connexion semble lente.<br /><button className="mt-2 font-bold text-brand-700" onClick={() => window.location.reload()}>Réessayer</button></div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, icon, iconTone = 'blue' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'blue'; icon?: LucideIcon; iconTone?: Tone }) {
  return (
    <div className={cx('flex flex-col gap-2.5 rounded-2xl border p-4', tone === 'blue' ? 'border-transparent bg-brand-600 text-white' : 'border-line bg-white')}>
      {icon && <IconTile icon={icon} tone={iconTone} />}
      <div className="flex flex-col gap-0.5">
        <span className="text-xl font-extrabold tabular-nums md:text-2xl">{value}</span>
        <span className={cx('text-xs font-semibold', tone === 'blue' ? 'text-white/80' : 'text-muted')}>{label}</span>
        {sub && <span className={cx('text-xs', tone === 'blue' ? 'text-white/80' : 'text-muted')}>{sub}</span>}
      </div>
    </div>
  );
}

export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={value === k}
          className={cx('rounded-full border px-3.5 py-1.5 text-sm font-semibold', value === k ? 'border-brand-600 bg-brand-600 text-white shadow-[0_6px_12px_-8px_rgba(29,78,216,0.9)]' : 'border-line bg-white text-slate-700 hover:bg-canvas')}>{l}</button>
      ))}
    </div>
  );
}

export function Steps({ step, light }: { step: number; light?: boolean }) {
  return <div className="flex gap-1">{[0, 1, 2, 3, 4].map((i) => <span key={i} className={cx('h-1.5 flex-1 rounded-full', i <= step ? (light ? 'bg-white' : 'bg-brand-600') : (light ? 'bg-white/30' : 'bg-line'))} />)}</div>;
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 md:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 md:rounded-3xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-extrabold">{title}</h3><button type="button" onClick={onClose} aria-label="Fermer" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-canvas"><X className="h-5 w-5" /></button></div>
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}

/** Aperçu du message + ouverture de WhatsApp (wa.me). */
export function WhatsAppSheet({ open, onClose, to, phone, text }: { open: boolean; onClose: () => void; to: string; phone: string; text: string }) {
  const url = `https://wa.me/${(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
  return (
    <Sheet open={open} onClose={onClose} title="Message WhatsApp">
      <div className="text-sm text-muted">À {to} · {phone}</div>
      <div className="rounded-2xl bg-[#ECE5DD] p-3"><div className="ml-auto max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#DCF8C6] p-3 text-sm text-ink shadow-sm">{text}</div></div>
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={onClose}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 font-semibold text-white hover:brightness-95"><MessageCircle className="h-5 w-5" />Ouvrir WhatsApp</a>
    </Sheet>
  );
}

// ---------- Toasts ----------
const ToastCtx = createContext<(m: string, tone?: 'ok' | 'err') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ m: string; tone: 'ok' | 'err'; id: number } | null>(null);
  const show = useCallback((m: string, tone: 'ok' | 'err' = 'ok') => {
    const id = Date.now(); setT({ m, tone, id });
    setTimeout(() => setT((c) => (c?.id === id ? null : c)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div role="status" className={cx('fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-md rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg md:bottom-6', t.tone === 'err' ? 'bg-red-600' : 'bg-ink')}>{t.m}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
