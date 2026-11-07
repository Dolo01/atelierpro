-- =====================================================================
-- AtelierPro — sécurité : fonctions d'aide, RLS, droits par colonne
-- =====================================================================

-- ---------- Fonctions d'aide (security definer, search_path figé) ----------
create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select coalesce((select role from public.profiles where id = (select auth.uid())), 'pending'::public.user_role)
$$;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'superadmin')
$$;

-- Atelier du tailleur / employé connecté
create or replace function public.my_workshop_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select workshop_id from public.profiles
  where id = (select auth.uid()) and role in ('tailor_owner','tailor_staff')
$$;

-- Fiches client liées au compte client connecté
create or replace function public.my_client_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.clients where user_id = (select auth.uid())
$$;

-- Statut d'accès calculé d'un atelier : suspended | active | trial | expired
create or replace function public.workshop_access(w public.workshops) returns text
language sql stable set search_path = '' as $$
  select case
    when w.is_suspended then 'suspended'
    when w.subscription_ends_at is not null and w.subscription_ends_at > now() then 'active'
    when w.trial_ends_at > now() then 'trial'
    else 'expired' end
$$;

create or replace function public.workshop_access_by_id(wid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select public.workshop_access(w) from public.workshops w where w.id = wid
$$;

-- L'atelier connecté peut-il écrire ? (essai en cours ou abonnement validé, non suspendu)
create or replace function public.can_write_workshop(wid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select wid is not null
     and wid = public.my_workshop_id()
     and public.workshop_access_by_id(wid) in ('trial','active')
$$;

create or replace function public.can_read_workshop(wid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select wid is not null
     and wid = public.my_workshop_id()
     and public.workshop_access_by_id(wid) <> 'suspended'
$$;

-- ---------- Activer RLS partout ----------
alter table public.platform_settings enable row level security;
alter table public.plans             enable row level security;
alter table public.workshops         enable row level security;
alter table public.profiles          enable row level security;
alter table public.clients           enable row level security;
alter table public.measurements      enable row level security;
alter table public.quotes            enable row level security;
alter table public.orders            enable row level security;
alter table public.order_payments    enable row level security;
alter table public.appointments      enable row level security;
alter table public.invitations       enable row level security;
alter table public.payment_requests  enable row level security;
alter table public.notifications     enable row level security;
alter table public.admin_logs        enable row level security;

-- Pas d'accès anonyme direct aux tables
revoke all on all tables in schema public from anon;

-- ---------- platform_settings ----------
create policy settings_read on public.platform_settings for select to authenticated using (true);
create policy settings_admin on public.platform_settings for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));

-- ---------- plans ----------
create policy plans_read on public.plans for select to authenticated
  using (is_active or (select public.is_superadmin()));
create policy plans_admin_ins on public.plans for insert to authenticated with check ((select public.is_superadmin()));
create policy plans_admin_upd on public.plans for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));

-- ---------- workshops ----------
create policy ws_read on public.workshops for select to authenticated using (
  id = (select public.my_workshop_id())
  or (select public.is_superadmin())
  or id in (select c.workshop_id from public.clients c where c.user_id = (select auth.uid()))
);
-- Le propriétaire ne peut modifier que les colonnes de profil (voir GRANT plus bas)
create policy ws_owner_upd on public.workshops for update to authenticated
  using (owner_id = (select auth.uid()) and not is_suspended)
  with check (owner_id = (select auth.uid()));
revoke update on public.workshops from authenticated;
grant update (name, city, phone) on public.workshops to authenticated;

-- ---------- profiles ----------
create policy prof_read on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (select public.is_superadmin())
  or (workshop_id is not null and workshop_id = (select public.my_workshop_id()))
);
create policy prof_self_upd on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- ---------- clients ----------
create policy cl_read on public.clients for select to authenticated using (
  (select public.can_read_workshop(workshop_id))
  or user_id = (select auth.uid())
  or (select public.is_superadmin())
);
create policy cl_ins on public.clients for insert to authenticated with check ((select public.can_write_workshop(workshop_id)));
create policy cl_upd on public.clients for update to authenticated
  using ((select public.can_write_workshop(workshop_id))) with check ((select public.can_write_workshop(workshop_id)));
revoke update on public.clients from authenticated;
grant update (full_name, phone, notes) on public.clients to authenticated;

-- ---------- measurements (jamais visibles par le superadmin) ----------
create policy ms_read on public.measurements for select to authenticated using (
  (select public.can_read_workshop(workshop_id))
  or client_id in (select public.my_client_ids())
);
create policy ms_ins on public.measurements for insert to authenticated with check (
  (select public.can_write_workshop(workshop_id))
  and exists (select 1 from public.clients c where c.id = client_id and c.workshop_id = measurements.workshop_id)
);

-- ---------- quotes ----------
create policy qt_read on public.quotes for select to authenticated using (
  (select public.can_read_workshop(workshop_id))
  or (client_id in (select public.my_client_ids()) and status <> 'draft')
);
create policy qt_ins on public.quotes for insert to authenticated with check (
  (select public.can_write_workshop(workshop_id))
  and status in ('draft','sent')
  and exists (select 1 from public.clients c where c.id = client_id and c.workshop_id = quotes.workshop_id)
);
create policy qt_upd on public.quotes for update to authenticated
  using ((select public.can_write_workshop(workshop_id)) and status in ('draft','sent'))
  with check ((select public.can_write_workshop(workshop_id)) and status in ('draft','sent'));

-- ---------- orders ----------
create policy od_read on public.orders for select to authenticated using (
  (select public.can_read_workshop(workshop_id))
  or client_id in (select public.my_client_ids())
);
create policy od_ins on public.orders for insert to authenticated with check (
  (select public.can_write_workshop(workshop_id))
  and exists (select 1 from public.clients c where c.id = client_id and c.workshop_id = orders.workshop_id)
);
create policy od_upd on public.orders for update to authenticated
  using ((select public.can_write_workshop(workshop_id))) with check ((select public.can_write_workshop(workshop_id)));
revoke update on public.orders from authenticated;
grant update (title, fabric, price, step, due_date) on public.orders to authenticated;

-- ---------- order_payments ----------
create policy op_read on public.order_payments for select to authenticated using (
  (select public.can_read_workshop(workshop_id))
  or order_id in (select o.id from public.orders o where o.client_id in (select public.my_client_ids()))
);
create policy op_ins on public.order_payments for insert to authenticated with check (
  (select public.can_write_workshop(workshop_id))
  and exists (select 1 from public.orders o where o.id = order_id and o.workshop_id = order_payments.workshop_id)
);

-- ---------- appointments ----------
create policy ap_read on public.appointments for select to authenticated using (
  (select public.can_read_workshop(workshop_id))
  or client_id in (select public.my_client_ids())
);
create policy ap_ins on public.appointments for insert to authenticated with check ((select public.can_write_workshop(workshop_id)));
create policy ap_del on public.appointments for delete to authenticated using ((select public.can_write_workshop(workshop_id)));

-- ---------- invitations : lecture par l'atelier, création/consommation via fonctions ----------
create policy inv_read on public.invitations for select to authenticated using ((select public.can_read_workshop(workshop_id)));

-- ---------- payment_requests ----------
create policy pr_read on public.payment_requests for select to authenticated using (
  workshop_id = (select public.my_workshop_id()) or (select public.is_superadmin())
);
create policy pr_ins on public.payment_requests for insert to authenticated with check (
  workshop_id = (select public.my_workshop_id())
  and (select public.my_role()) = 'tailor_owner'
  and status = 'pending'
  and created_by = (select auth.uid())
);

-- ---------- notifications ----------
create policy nt_read on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy nt_upd on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------- admin_logs ----------
create policy lg_read on public.admin_logs for select to authenticated using ((select public.is_superadmin()));
