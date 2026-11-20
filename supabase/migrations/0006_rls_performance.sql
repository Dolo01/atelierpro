-- =====================================================================
-- AtelierPro — performance RLS
-- Les politiques appelaient can_read_workshop(workshop_id) / can_write_workshop(workshop_id) :
-- la fonction dépend de la colonne, donc Postgres la rejouait pour CHAQUE ligne (avec deux
-- lectures de profiles + workshops à chaque fois). On calcule maintenant l'atelier autorisé
-- UNE seule fois par requête, puis on compare simplement la colonne.
-- Règles inchangées : lecture si non suspendu, écriture si essai ou abonnement actif.
-- =====================================================================

create or replace function public.my_readable_workshop_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.workshop_id
  from public.profiles p join public.workshops w on w.id = p.workshop_id
  where p.id = (select auth.uid())
    and p.role in ('tailor_owner','tailor_staff')
    and not w.is_suspended
$$;

create or replace function public.my_writable_workshop_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.workshop_id
  from public.profiles p join public.workshops w on w.id = p.workshop_id
  where p.id = (select auth.uid())
    and p.role in ('tailor_owner','tailor_staff')
    and public.workshop_access(w) in ('trial','active')
$$;

revoke all on function public.my_readable_workshop_id() from public, anon;
revoke all on function public.my_writable_workshop_id() from public, anon;
grant execute on function public.my_readable_workshop_id() to authenticated;
grant execute on function public.my_writable_workshop_id() to authenticated;

-- ---------- clients ----------
drop policy if exists cl_read on public.clients;
drop policy if exists cl_ins on public.clients;
drop policy if exists cl_upd on public.clients;
create policy cl_read on public.clients for select to authenticated using (
  workshop_id = (select public.my_readable_workshop_id())
  or user_id = (select auth.uid())
  or (select public.is_superadmin())
);
create policy cl_ins on public.clients for insert to authenticated
  with check (workshop_id = (select public.my_writable_workshop_id()));
create policy cl_upd on public.clients for update to authenticated
  using (workshop_id = (select public.my_writable_workshop_id()))
  with check (workshop_id = (select public.my_writable_workshop_id()));

-- ---------- measurements ----------
drop policy if exists ms_read on public.measurements;
drop policy if exists ms_ins on public.measurements;
create policy ms_read on public.measurements for select to authenticated using (
  workshop_id = (select public.my_readable_workshop_id())
  or client_id in (select public.my_client_ids())
);
create policy ms_ins on public.measurements for insert to authenticated with check (
  workshop_id = (select public.my_writable_workshop_id())
  and exists (select 1 from public.clients c where c.id = client_id and c.workshop_id = measurements.workshop_id)
);

-- ---------- quotes ----------
drop policy if exists qt_read on public.quotes;
drop policy if exists qt_ins on public.quotes;
drop policy if exists qt_upd on public.quotes;
create policy qt_read on public.quotes for select to authenticated using (
  workshop_id = (select public.my_readable_workshop_id())
  or (client_id in (select public.my_client_ids()) and status <> 'draft')
);
create policy qt_ins on public.quotes for insert to authenticated with check (
  workshop_id = (select public.my_writable_workshop_id())
  and status in ('draft','sent')
  and exists (select 1 from public.clients c where c.id = client_id and c.workshop_id = quotes.workshop_id)
);
create policy qt_upd on public.quotes for update to authenticated
  using (workshop_id = (select public.my_writable_workshop_id()) and status in ('draft','sent'))
  with check (workshop_id = (select public.my_writable_workshop_id()) and status in ('draft','sent'));

-- ---------- orders ----------
drop policy if exists od_read on public.orders;
drop policy if exists od_ins on public.orders;
drop policy if exists od_upd on public.orders;
create policy od_read on public.orders for select to authenticated using (
  workshop_id = (select public.my_readable_workshop_id())
  or client_id in (select public.my_client_ids())
);
create policy od_ins on public.orders for insert to authenticated with check (
  workshop_id = (select public.my_writable_workshop_id())
  and exists (select 1 from public.clients c where c.id = client_id and c.workshop_id = orders.workshop_id)
);
create policy od_upd on public.orders for update to authenticated
  using (workshop_id = (select public.my_writable_workshop_id()))
  with check (workshop_id = (select public.my_writable_workshop_id()));

-- ---------- order_payments ----------
drop policy if exists op_read on public.order_payments;
drop policy if exists op_ins on public.order_payments;
create policy op_read on public.order_payments for select to authenticated using (
  workshop_id = (select public.my_readable_workshop_id())
  or order_id in (select o.id from public.orders o where o.client_id in (select public.my_client_ids()))
);
create policy op_ins on public.order_payments for insert to authenticated with check (
  workshop_id = (select public.my_writable_workshop_id())
  and exists (select 1 from public.orders o where o.id = order_id and o.workshop_id = order_payments.workshop_id)
);

-- ---------- appointments ----------
drop policy if exists ap_read on public.appointments;
drop policy if exists ap_ins on public.appointments;
drop policy if exists ap_del on public.appointments;
create policy ap_read on public.appointments for select to authenticated using (
  workshop_id = (select public.my_readable_workshop_id())
  or client_id in (select public.my_client_ids())
);
create policy ap_ins on public.appointments for insert to authenticated
  with check (workshop_id = (select public.my_writable_workshop_id()));
create policy ap_del on public.appointments for delete to authenticated
  using (workshop_id = (select public.my_writable_workshop_id()));

-- ---------- invitations ----------
drop policy if exists inv_read on public.invitations;
create policy inv_read on public.invitations for select to authenticated
  using (workshop_id = (select public.my_readable_workshop_id()));

-- ---------- index utiles (clés étrangères les plus consultées) ----------
create index if not exists profiles_workshop_id_idx on public.profiles (workshop_id);
create index if not exists workshops_owner_id_idx on public.workshops (owner_id);
create index if not exists workshops_plan_id_idx on public.workshops (plan_id);
