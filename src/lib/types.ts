export type Role = 'pending' | 'superadmin' | 'tailor_owner' | 'tailor_staff' | 'client';

export interface Profile { id: string; role: Role; full_name: string; phone: string; workshop_id: string | null; created_at: string }
export interface Plan { id: string; name: string; price_monthly: number; max_staff: number; max_clients: number | null; perks: string[]; is_active: boolean; sort_order: number }
export interface Workshop {
  id: string; name: string; city: string; phone: string; owner_id: string;
  trial_ends_at: string; plan_id: string | null; subscription_ends_at: string | null; is_suspended: boolean; created_at: string;
}
export interface Client { id: string; workshop_id: string; full_name: string; phone: string; notes: string; user_id: string | null; created_at: string }
export interface Measurement { id: string; client_id: string; workshop_id: string; values: Record<string, number>; taken_at: string }
export interface QuoteLine { label: string; amount: number }
export interface Quote {
  id: string; workshop_id: string; client_id: string; number: string; title: string; lines: QuoteLine[];
  total: number; deposit: number; delay: string; status: 'draft' | 'sent' | 'accepted' | 'refused'; created_at: string; responded_at: string | null;
}
export interface Order {
  id: string; workshop_id: string; client_id: string; quote_id: string | null; number: string; title: string; fabric: string;
  price: number; step: number; due_date: string | null; created_at: string; updated_at: string;
}
export interface OrderPayment { id: string; order_id: string; workshop_id: string; amount: number; method: string; note: string; paid_at: string }
export interface Appointment { id: string; workshop_id: string; client_id: string | null; starts_at: string; purpose: string }
export interface PaymentRequest {
  id: string; workshop_id: string; plan_id: string; months: number; amount: number; method: 'orange_money' | 'wave' | 'moov_money';
  reference: string; proof_path: string; status: 'pending' | 'validated' | 'rejected'; reject_reason: string | null; created_at: string; reviewed_at: string | null;
}
export interface Notification { id: string; title: string; link: string | null; read_at: string | null; created_at: string }
export interface Settings {
  id: number; trial_days: number; trial_max_staff: number; number_orange_money: string; number_wave: string; number_moov_money: string; beneficiary_name: string;
}
export interface AdminLog { id: number; action: string; workshop_id: string | null; details: Record<string, unknown>; created_at: string }

export type Access = 'suspended' | 'active' | 'trial' | 'expired';
export function accessOf(w: Pick<Workshop, 'is_suspended' | 'subscription_ends_at' | 'trial_ends_at'>): Access {
  const now = Date.now();
  if (w.is_suspended) return 'suspended';
  if (w.subscription_ends_at && new Date(w.subscription_ends_at).getTime() > now) return 'active';
  if (new Date(w.trial_ends_at).getTime() > now) return 'trial';
  return 'expired';
}
export const paidOf = (pays: OrderPayment[], orderId: string) => pays.filter((p) => p.order_id === orderId).reduce((s, p) => s + p.amount, 0);
