/** Couleurs d'accent par rubrique : une couleur pleine (fg) et sa version claire (bg). */
export const TONES = {
  blue: { fg: '#2563EB', bg: '#DBEAFE', text: '#1E40AF' },
  green: { fg: '#16A34A', bg: '#DCFCE7', text: '#166534' },
  violet: { fg: '#7C3AED', bg: '#EDE9FE', text: '#5B21B6' },
  orange: { fg: '#EA580C', bg: '#FFEDD5', text: '#9A3412' },
  pink: { fg: '#DB2777', bg: '#FCE7F3', text: '#9D174D' },
  amber: { fg: '#D97706', bg: '#FEF3C7', text: '#92400E' },
  teal: { fg: '#0D9488', bg: '#CCFBF1', text: '#115E59' },
  indigo: { fg: '#4F46E5', bg: '#E0E7FF', text: '#3730A3' },
  gold: { fg: '#A16207', bg: '#FEF9C3', text: '#854D0E' },
  slate: { fg: '#475569', bg: '#F1F5F9', text: '#334155' }
} as const;
export type Tone = keyof typeof TONES;

/** Couleur de chaque étape de fabrication (Mesures → Livré). */
export const STEP_TONES: Tone[] = ['teal', 'blue', 'violet', 'amber', 'green', 'slate'];

/** Couleurs des avatars, choisies d'après le nom pour rester stables. */
const AVATAR: Tone[] = ['blue', 'pink', 'green', 'violet', 'orange', 'teal', 'indigo', 'amber'];
export function avatarTone(name: string): Tone {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
}
