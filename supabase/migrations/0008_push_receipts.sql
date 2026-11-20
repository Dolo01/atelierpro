-- =====================================================================
-- AtelierPro — notifications push sur téléphone + numéros de reçus
-- La configuration push (clés VAPID, secret partagé, URL de la fonction) est insérée
-- à part dans public.push_config : elle n'est jamais versionnée.
-- =====================================================================

create extension if not exists pg_net with schema extensions;

-- ---------- Configuration privée (lisible seulement par le service, pas par l'appli) ----------
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  function_url text not null,
  secret text not null,
  vapid_public text not null,
  vapid_private text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

-- ---------- Abonnements push (un par appareil) ----------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Enregistre l'appareil pour l'utilisateur connecté (un téléphone partagé passe au nouveau compte)
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text default '')
returns void language sql security definer set search_path = '' as $$
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  select auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_ua, ''), 300) where auth.uid() is not null
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, created_at = now()
$$;
create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;
revoke all on function public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text) to authenticated;

-- Chaque notification in-app part aussi en push vers les appareils du destinataire
create or replace function public.tg_notification_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  if not exists (select 1 from public.push_subscriptions where user_id = new.user_id) then return new; end if;
  select * into c from public.push_config where id = 1;
  if not found then return new; end if;
  perform net.http_post(
    url := c.function_url,
    body := jsonb_build_object('user_id', new.user_id, 'title', new.title, 'link', new.link),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', c.secret),
    timeout_milliseconds := 8000);
  return new;
exception when others then
  return new; -- la notification in-app ne doit jamais échouer à cause du push
end $$;
revoke execute on function public.tg_notification_push() from public, anon, authenticated;
drop trigger if exists notification_push on public.notifications;
create trigger notification_push after insert on public.notifications for each row execute function public.tg_notification_push();

-- ---------- Reçus des paiements de commande : R-0001, R-0002… par atelier ----------
alter table public.workshops add column if not exists next_receipt_no int not null default 1;
alter table public.order_payments add column if not exists receipt_no text;

create or replace function public.tg_order_payment_receipt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.workshops set next_receipt_no = next_receipt_no + 1 where id = new.workshop_id
  returning next_receipt_no - 1 into n;
  new.receipt_no := 'R-' || lpad(n::text, 4, '0');
  return new;
end $$;
revoke execute on function public.tg_order_payment_receipt() from public, anon, authenticated;
drop trigger if exists order_payment_receipt on public.order_payments;
create trigger order_payment_receipt before insert on public.order_payments for each row execute function public.tg_order_payment_receipt();

-- Numérotation des paiements déjà enregistrés
with numbered as (
  select id, workshop_id, row_number() over (partition by workshop_id order by paid_at, id) as n
  from public.order_payments where receipt_no is null
)
update public.order_payments op set receipt_no = 'R-' || lpad(numbered.n::text, 4, '0')
from numbered where numbered.id = op.id;
update public.workshops w set next_receipt_no = coalesce((select count(*) from public.order_payments op where op.workshop_id = w.id), 0) + 1;

-- ---------- Reçus d'abonnement : AP-2026-0001… fixés à la validation ----------
create sequence if not exists public.subscription_receipt_seq;
alter table public.payment_requests add column if not exists receipt_no text;
alter table public.payment_requests add column if not exists period_start timestamptz;
alter table public.payment_requests add column if not exists period_end timestamptz;

create or replace function public.admin_review_payment(p_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; v_start timestamptz; v_end timestamptz; v_plan text; v_receipt text;
begin
  if not public.is_superadmin() then raise exception 'Réservé au superadministrateur'; end if;
  select * into r from public.payment_requests where id = p_id for update;
  if not found then raise exception 'Demande introuvable'; end if;
  if r.status <> 'pending' then raise exception 'Demande déjà traitée'; end if;
  select name into v_plan from public.plans where id = r.plan_id;
  if p_approve then
    select greatest(now(), coalesce(subscription_ends_at, now())) into v_start from public.workshops where id = r.workshop_id for update;
    v_end := v_start + make_interval(months => r.months);
    update public.workshops set plan_id = r.plan_id, subscription_ends_at = v_end where id = r.workshop_id;
    v_receipt := 'AP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.subscription_receipt_seq')::text, 4, '0');
    update public.payment_requests set status = 'validated', reviewed_at = now(), reviewed_by = auth.uid(),
           receipt_no = v_receipt, period_start = v_start, period_end = v_end where id = p_id;
    perform public.log_admin('payment_validated', r.workshop_id,
      jsonb_build_object('request', p_id, 'plan', v_plan, 'months', r.months, 'amount', r.amount, 'reference', r.reference, 'receipt', v_receipt));
    perform public.notify_workshop(r.workshop_id,
      'Paiement validé : forfait ' || v_plan || ' actif jusqu''au ' || to_char(v_end, 'DD/MM/YYYY') || '. Votre reçu ' || v_receipt || ' est disponible.', '/plus/abonnement');
  else
    if length(trim(coalesce(p_reason,''))) = 0 then raise exception 'Motif de rejet obligatoire'; end if;
    update public.payment_requests set status = 'rejected', reject_reason = trim(p_reason),
           reviewed_at = now(), reviewed_by = auth.uid() where id = p_id;
    perform public.log_admin('payment_rejected', r.workshop_id,
      jsonb_build_object('request', p_id, 'reason', trim(p_reason), 'reference', r.reference));
    perform public.notify_workshop(r.workshop_id, 'Paiement rejeté : ' || trim(p_reason), '/plus/abonnement');
  end if;
end $$;

-- Reçus pour les paiements déjà validés (période reconstituée depuis la date de validation)
with v as (
  select id, row_number() over (order by reviewed_at, id) as n from public.payment_requests
  where status = 'validated' and receipt_no is null
)
update public.payment_requests pr set
  receipt_no = 'AP-' || to_char(coalesce(pr.reviewed_at, pr.created_at), 'YYYY') || '-' || lpad((select coalesce(max(substring(receipt_no from '\d+$')::int), 0) from public.payment_requests where receipt_no is not null) + v.n || '', 4, '0'),
  period_start = coalesce(pr.reviewed_at, pr.created_at),
  period_end = coalesce(pr.reviewed_at, pr.created_at) + make_interval(months => pr.months)
from v where v.id = pr.id;
select setval('public.subscription_receipt_seq', greatest(1, (select coalesce(max(substring(receipt_no from '\d+$')::int), 0) from public.payment_requests where receipt_no is not null)),
  (select count(*) > 0 from public.payment_requests where receipt_no is not null));
