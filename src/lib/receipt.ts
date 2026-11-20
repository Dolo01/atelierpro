/** Reçus AtelierPro : dessinés en image (PNG) pour WhatsApp, et en PDF pour le téléchargement. */

export interface ReceiptData {
  issuer: { name: string; lines: string[] };   // qui délivre le reçu (l'atelier, ou AtelierPro)
  title: string;                               // « Reçu de paiement »
  number: string;                              // R-0003 / AP-2026-0001
  date: string;                                // date du paiement, en toutes lettres
  partyLabel: string;                          // « Reçu de » / « Atelier »
  partyName: string;
  partyLines: string[];
  amountLabel: string;                         // « Montant reçu »
  amount: string;
  amountSub?: string;                          // « Orange Money · réf. … »
  rows: [string, string][];
  highlight?: { label: string; value: string; tone: 'ok' | 'warn' };
  footer: string[];
}

const FONT = '"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
const C = { brand: '#1D4ED8', brand2: '#2563EB', ink: '#0F172A', muted: '#64748B', line: '#E2E8F0', soft: '#F1F5F9', ok: '#166534', okBg: '#DCFCE7', warn: '#92400E', warnBg: '#FEF3C7', gold: '#F7D774' };

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.split(' '); const out: string[] = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > max && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur);
  return out;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

async function logo(): Promise<HTMLImageElement | null> {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = '/pwa-192.png'; });
}

export async function renderReceipt(d: ReceiptData): Promise<Blob> {
  try { await (document as unknown as { fonts?: FontFaceSet }).fonts?.load(`800 40px ${FONT}`); } catch { /* police système */ }
  const W = 1080, P = 72, S = 2;
  const cv = document.createElement('canvas');
  const draw = (ctx: CanvasRenderingContext2D, img: HTMLImageElement | null) => {
    let y = 0;
    // En-tête
    const headH = 250 + Math.max(0, d.issuer.lines.length - 2) * 34;
    const g = ctx.createLinearGradient(0, 0, W, headH); g.addColorStop(0, C.brand); g.addColorStop(1, C.brand2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, headH);
    if (img) { ctx.save(); rr(ctx, P, 60, 96, 96, 24); ctx.clip(); ctx.drawImage(img, P, 60, 96, 96); ctx.restore(); }
    const tx = img ? P + 124 : P;
    ctx.fillStyle = '#FFFFFF'; ctx.font = `800 46px ${FONT}`; ctx.textBaseline = 'alphabetic';
    ctx.fillText(d.issuer.name, tx, 112, W - tx - P);
    ctx.font = `500 28px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    d.issuer.lines.forEach((l, i) => ctx.fillText(l, tx, 154 + i * 34, W - tx - P));
    y = headH;

    // Titre + numéro
    y += 78;
    ctx.fillStyle = C.ink; ctx.font = `800 54px ${FONT}`; ctx.fillText(d.title.toUpperCase(), P, y);
    ctx.font = `700 30px ${FONT}`; ctx.fillStyle = C.brand; ctx.textAlign = 'right'; ctx.fillText('N° ' + d.number, W - P, y - 4); ctx.textAlign = 'left';
    y += 46; ctx.font = `500 28px ${FONT}`; ctx.fillStyle = C.muted; ctx.fillText(d.date, P, y);

    // Bénéficiaire
    y += 50;
    const partyH = 70 + d.partyLines.length * 36 + 20;
    ctx.fillStyle = C.soft; rr(ctx, P, y, W - 2 * P, partyH, 24); ctx.fill();
    ctx.fillStyle = C.muted; ctx.font = `700 22px ${FONT}`; ctx.fillText(d.partyLabel.toUpperCase(), P + 32, y + 42);
    ctx.fillStyle = C.ink; ctx.font = `800 36px ${FONT}`; ctx.fillText(d.partyName, P + 32, y + 86, W - 2 * P - 64);
    ctx.font = `500 26px ${FONT}`; ctx.fillStyle = C.muted;
    d.partyLines.forEach((l, i) => ctx.fillText(l, P + 32, y + 124 + i * 36, W - 2 * P - 64));
    y += partyH + 34;

    // Montant
    const amtH = d.amountSub ? 190 : 150;
    ctx.fillStyle = '#EFF6FF'; rr(ctx, P, y, W - 2 * P, amtH, 28); ctx.fill();
    ctx.strokeStyle = '#BFDBFE'; ctx.lineWidth = 2; rr(ctx, P, y, W - 2 * P, amtH, 28); ctx.stroke();
    ctx.fillStyle = C.brand; ctx.font = `700 26px ${FONT}`; ctx.fillText(d.amountLabel.toUpperCase(), P + 36, y + 50);
    ctx.fillStyle = C.ink; ctx.font = `800 64px ${FONT}`; ctx.fillText(d.amount, P + 36, y + 120);
    if (d.amountSub) { ctx.fillStyle = C.muted; ctx.font = `500 26px ${FONT}`; ctx.fillText(d.amountSub, P + 36, y + 162, W - 2 * P - 72); }
    y += amtH + 30;

    // Détail
    for (const [k, v] of d.rows) {
      y += 58;
      ctx.font = `500 29px ${FONT}`; ctx.fillStyle = C.muted; ctx.fillText(k, P, y);
      ctx.font = `700 29px ${FONT}`; ctx.fillStyle = C.ink; ctx.textAlign = 'right';
      const lines = wrap(ctx, v, 560);
      lines.forEach((l, i) => ctx.fillText(l, W - P, y + i * 36));
      ctx.textAlign = 'left'; y += (lines.length - 1) * 36;
      ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(P, y + 24); ctx.lineTo(W - P, y + 24); ctx.stroke(); ctx.setLineDash([]);
    }
    if (d.highlight) {
      y += 54;
      const ok = d.highlight.tone === 'ok';
      ctx.fillStyle = ok ? C.okBg : C.warnBg; rr(ctx, P, y, W - 2 * P, 96, 22); ctx.fill();
      ctx.fillStyle = ok ? C.ok : C.warn; ctx.font = `700 30px ${FONT}`; ctx.fillText(d.highlight.label, P + 32, y + 60);
      ctx.font = `800 34px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText(d.highlight.value, W - P - 32, y + 61); ctx.textAlign = 'left';
      y += 96;
    }

    // Pied
    y += 70;
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke();
    y += 52; ctx.textAlign = 'center';
    d.footer.forEach((l, i) => { ctx.font = i === 0 ? `700 28px ${FONT}` : `500 24px ${FONT}`; ctx.fillStyle = i === 0 ? C.ink : C.muted; ctx.fillText(l, W / 2, y); y += i === 0 ? 40 : 34; });
    ctx.textAlign = 'left';
    return y + 40;
  };
  const img = await logo();
  // 1er passage pour mesurer la hauteur, 2e pour dessiner
  const probe = document.createElement('canvas').getContext('2d')!;
  const H = Math.ceil(draw(probe, null));
  cv.width = W * S; cv.height = H * S;
  const ctx = cv.getContext('2d')!; ctx.scale(S, S);
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
  draw(ctx, img);
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Image impossible à créer'))), 'image/png'));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** PDF A5 contenant l'image du reçu. */
export async function receiptPdf(png: Blob): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const data = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(png); });
  const img = await new Promise<HTMLImageElement>((res) => { const i = new Image(); i.onload = () => res(i); i.src = data; });
  const w = 148, h = Math.round((img.height / img.width) * w);
  const doc = new jsPDF({ unit: 'mm', format: [w, Math.max(h, 100)] });
  doc.addImage(data, 'PNG', 0, 0, w, h);
  return doc.output('blob');
}

/** Envoi direct dans WhatsApp (ou autre appli) avec l'image jointe quand le téléphone le permet. */
export async function shareReceipt(png: Blob, filename: string, text: string, whatsapp: boolean, phone?: string): Promise<'shared' | 'cancelled' | 'fallback'> {
  const file = new File([png], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], text }); return 'shared'; }
    catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; }
  }
  // Ordinateur ou ancien téléphone : on enregistre l'image puis on ouvre la conversation
  downloadBlob(png, filename);
  if (whatsapp) window.open(`https://wa.me/${(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  return 'fallback';
}
