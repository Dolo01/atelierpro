export const money = (n: number | null | undefined) =>
  new Intl.NumberFormat('fr-FR').format(Math.round(n ?? 0)).replace(/ /g, ' ') + ' FCFA';

export const dateFr = (d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  d ? new Intl.DateTimeFormat('fr-FR', opts).format(new Date(d)) : '—';

export const dateTimeFr = (d: string | Date | null | undefined) =>
  dateFr(d, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const initials = (name: string) =>
  name.trim().split(/\s+/).map((w) => w[0] ?? '').slice(0, 2).join('').toUpperCase() || '?';

export const daysLeft = (d: string | null | undefined) =>
  d ? Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)) : 0;

/** Normalise un numéro malien/ouest-africain en chiffres avec indicatif. */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = '223' + d;
  return d;
}

/** Les comptes utilisent le téléphone comme identifiant (adresse technique interne). */
export const phoneToEmail = (raw: string) => `${normalizePhone(raw)}@tel.atelierpro.app`;

export const displayPhone = (raw: string) => {
  const d = normalizePhone(raw);
  if (!d) return '';
  if (d.startsWith('223') && d.length === 11) return `+223 ${d.slice(3).replace(/(\d{2})(?=\d)/g, '$1 ')}`;
  return '+' + d;
};

export const STEPS = ['Mesures prises', 'Coupe', 'Couture', 'Broderie et finition', 'Prêt à retirer', 'Livré'] as const;

export const MEASURES: [string, string][] = [
  ['poitrine', 'Tour de poitrine'],
  ['taille', 'Tour de taille'],
  ['hanches', 'Tour de hanches'],
  ['epaules', 'Largeur épaules'],
  ['manche', 'Longueur manche'],
  ['bras', 'Tour de bras'],
  ['cou', 'Tour de cou'],
  ['longueur', 'Longueur robe / boubou'],
  ['pantalon', 'Longueur pantalon'],
  ['cuisse', 'Tour de cuisse']
];

export const METHODS = {
  orange_money: { label: 'Orange Money', short: 'OM', bg: '#FF7900', fg: '#111111' },
  wave: { label: 'Wave', short: 'W', bg: '#1DC8F2', fg: '#0B2540' },
  moov_money: { label: 'Moov Money', short: 'MM', bg: '#0058A3', fg: '#FFFFFF' }
} as const;
export type MethodKey = keyof typeof METHODS;

export function waLink(phone: string, text: string) {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
}

export const appUrl = () => window.location.origin;
