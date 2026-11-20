import { useEffect, useState } from 'react';
import { Download, FileDown, MessageCircle, Share2 } from 'lucide-react';
import { dateFr, displayPhone, METHODS, money, normalizePhone, STEPS } from '../lib/format';
import { downloadBlob, receiptPdf, renderReceipt, shareReceipt, type ReceiptData } from '../lib/receipt';
import type { Client, Order, OrderPayment, PaymentRequest, Plan, Settings, Workshop } from '../lib/types';
import { Button, Sheet, useToast } from './ui';

const longDate = (d: string | null | undefined) =>
  d ? `${dateFr(d, { day: 'numeric', month: 'long', year: 'numeric' })} à ${dateFr(d, { hour: '2-digit', minute: '2-digit' })}` : '—';

/** Reçu d'un paiement de commande (délivré par l'atelier au client). */
export function orderReceipt(w: Workshop, c: Client, o: Order, pays: OrderPayment[], p: OrderPayment): ReceiptData {
  const upTo = pays.filter((x) => new Date(x.paid_at) <= new Date(p.paid_at)).reduce((s, x) => s + x.amount, 0);
  const rest = Math.max(0, o.price - upTo);
  return {
    issuer: { name: w.name, lines: [[w.city, w.phone ? displayPhone(w.phone) : ''].filter(Boolean).join(' · ') || 'Atelier de couture'] },
    title: 'Reçu de paiement',
    number: p.receipt_no || p.id.slice(0, 8).toUpperCase(),
    date: longDate(p.paid_at),
    partyLabel: 'Reçu de',
    partyName: c.full_name,
    partyLines: [c.phone ? displayPhone(c.phone) : '', `Commande ${o.number} · ${o.title}`].filter(Boolean),
    amountLabel: p.note ? `Montant reçu · ${p.note}` : 'Montant reçu',
    amount: money(p.amount),
    amountSub: `Payé par ${p.method}`,
    rows: [
      ['Prix convenu', money(o.price)],
      ['Total payé à ce jour', money(upTo)],
      ['Étape de fabrication', STEPS[Math.min(o.step, 5)]],
      ...(o.due_date ? [['Livraison prévue', dateFr(o.due_date, { day: 'numeric', month: 'long', year: 'numeric' })] as [string, string]] : [])
    ],
    highlight: rest > 0 ? { label: 'Reste à payer', value: money(rest), tone: 'warn' } : { label: 'Commande entièrement payée', value: 'Soldé', tone: 'ok' },
    footer: ['Merci pour votre confiance !', `${w.name} · reçu généré avec AtelierPro`]
  };
}

/** Reçu d'abonnement (délivré par AtelierPro à l'atelier), établi d'après ce qui a été payé et validé. */
export function subscriptionReceipt(w: Workshop, plan: Pick<Plan, 'name'> | null, r: PaymentRequest, s: Pick<Settings, 'beneficiary_name'> | null): ReceiptData {
  return {
    issuer: { name: 'AtelierPro', lines: ['Logiciel de gestion des ateliers de couture', s?.beneficiary_name ? `Bénéficiaire : ${s.beneficiary_name}` : ''].filter(Boolean) },
    title: "Reçu d'abonnement",
    number: r.receipt_no || r.id.slice(0, 8).toUpperCase(),
    date: `Validé le ${longDate(r.reviewed_at)}`,
    partyLabel: 'Atelier',
    partyName: w.name,
    partyLines: [[w.city, w.phone ? displayPhone(w.phone) : ''].filter(Boolean).join(' · ')].filter(Boolean),
    amountLabel: 'Montant payé',
    amount: money(r.amount),
    amountSub: `${METHODS[r.method].label} · référence ${r.reference}`,
    rows: [
      ['Forfait', plan?.name ?? 'Forfait'],
      ['Durée', `${r.months} mois`],
      ['Période couverte', r.period_start && r.period_end ? `du ${dateFr(r.period_start)} au ${dateFr(r.period_end)}` : '—'],
      ['Dépôt envoyé le', dateFr(r.created_at, { day: 'numeric', month: 'long', year: 'numeric' })]
    ],
    highlight: { label: 'Paiement validé', value: 'Payé', tone: 'ok' },
    footer: ['Merci de votre confiance !', 'AtelierPro · gestion des ateliers de couture']
  };
}

/** Aperçu du reçu + envoi WhatsApp + téléchargement image / PDF. */
export function ReceiptSheet({ data, onClose, filename, shareText, phone }: { data: ReceiptData | null; onClose: () => void; filename: string; shareText: string; phone?: string }) {
  const toast = useToast();
  const [png, setPng] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'share' | 'pdf'>('');

  const key = data ? JSON.stringify(data) : ''; // l'image n'est refaite que si le contenu change
  useEffect(() => {
    if (!data) return;
    let u: string | null = null; let alive = true;
    setPng(null); setUrl(null);
    renderReceipt(data).then((b) => { if (!alive) return; u = URL.createObjectURL(b); setPng(b); setUrl(u); })
      .catch(() => toast('Impossible de générer le reçu', 'err'));
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const share = async () => {
    if (!png) return;
    setBusy('share');
    const r = await shareReceipt(png, `${filename}.png`, shareText, phone !== undefined, phone ? normalizePhone(phone) : '');
    setBusy('');
    if (r === 'fallback') toast(phone !== undefined ? "Reçu enregistré : joignez l'image dans la conversation WhatsApp qui s'ouvre." : 'Reçu enregistré sur cet appareil.');
  };
  const pdf = async () => {
    if (!png) return;
    setBusy('pdf');
    try { downloadBlob(await receiptPdf(png), `${filename}.pdf`); } catch { toast('PDF impossible à créer', 'err'); }
    setBusy('');
  };

  return (
    <Sheet open={!!data} onClose={onClose} title={data ? `Reçu ${data.number}` : 'Reçu'}>
      <div className="flex flex-col gap-3">
        <div className="max-h-[48vh] overflow-auto rounded-xl border border-line bg-canvas p-2">
          {url ? <img src={url} alt="Aperçu du reçu" className="mx-auto w-full max-w-sm rounded-lg shadow-sm" /> : <div className="py-16 text-center text-sm text-muted">Préparation du reçu…</div>}
        </div>
        {phone !== undefined
          ? <Button variant="whatsapp" onClick={share} loading={busy === 'share'} disabled={!png}><MessageCircle className="h-4 w-4" />Envoyer sur WhatsApp</Button>
          : <Button onClick={share} loading={busy === 'share'} disabled={!png}><Share2 className="h-4 w-4" />Partager</Button>}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => png && downloadBlob(png, `${filename}.png`)} disabled={!png}><Download className="h-4 w-4" />Image</Button>
          <Button variant="ghost" onClick={pdf} loading={busy === 'pdf'} disabled={!png}><FileDown className="h-4 w-4" />PDF</Button>
        </div>
      </div>
    </Sheet>
  );
}
