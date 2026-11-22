-- =====================================================================
-- AtelierPro — qui a fait quoi, et qui gère quel client
--  1) Chaque enregistrement (client, mesure, devis, commande, paiement, rendez-vous)
--     garde son auteur : created_by + created_by_name (le nom reste même si l'employé part).
--  2) Chaque client a un responsable (assigned_to) : l'employé qui l'a créé.
--     NULL = suivi par le patron. Seuls le patron et le responsable peuvent modifier le
--     client et tout ce qui le concerne ; les autres employés le consultent seulement.
--     Le patron peut changer de responsable ; un employé retiré rend ses clients au patron.
-- =====================================================================

alter table public.clients      add column if not exists created_by uuid, add column if not exists created_by_name text,
                                add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.quotes       add column if not exists created_by uuid, add column if not exists created_by_name text;
alter table public.orders       add column if not exists created_by uuid, add column if not exists created_by_name text;
alter table public.appointments add column if not exists created_by uuid, add column if not exists created_by_name text;
alter table public.measurements add column if not exists created_by_name text;
alter table public.order_payments add column if not exists created_by_name text;
create index if not exists clients_assigned_to_idx on public.clients (assigned_to);

-- Auteur posé par le serveur (impossible à falsifier depuis l'appli)
create or replace function public.tg_stamp_author() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_name text; v_role public.user_role;
begin
  if v_uid is null then return new; end if;
  select full_name, role into v_name, v_role from public.profiles where id = v_uid;
  new.created_by := v_uid;
  new.created_by_name := case when v_role = 'client' then coalesce(nullif(v_name, ''), 'Client') || ' (client)' else coalesce(nullif(v_name, ''), 'Atelier') end;
  return new;
end $$;
revoke execute on function public.tg_stamp_author() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['clients','measurements','quotes','orders','order_payments','appointments'] loop
    execute format('drop trigger if exists stamp_author on public.%I', t);
    execute format('create trigger stamp_author before insert on public.%I for each row execute function public.tg_stamp_author()', t);
  end loop;
end $$;

-- Responsable du client : l'employé qui le crée ; le patron crée des clients qu'il suit lui-même
create or replace function public.tg_client_assign() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.assigned_to := case when public.my_role() = 'tailor_staff' then auth.uid() else null end;
  return new;
end $$;
revoke execute on function public.tg_client_assign() from public, anon, authenticated;
drop trigger if exists client_assign on public.clients;
create trigger client_assign before insert on public.clients for each row execute function public.tg_client_assign();

-- Peut-on modifier ce client (et ses mesures, devis, commandes, paiements, rendez-vous) ?
create or replace function public.can_manage_client(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select cid is null
      or public.my_role() = 'tailor_owner'
      or exists (select 1 from public.clients c where c.id = cid and c.assigned_to = (select auth.uid()))
$$;
revoke execute on function public.can_manage_client(uuid) from public, anon;
grant execute on function public.can_manage_client(uuid) to authenticated;

-- ---------- Politiques d'écriture : + responsable du client ----------
drop policy if exists cl_upd on public.clients;
create policy cl_upd on public.clients for update to authenticated
  using (workshop_id = (select public.my_writable_workshop_id()) and public.can_manage_client(id))
  with check (workshop_id = (select public.my_writable_workshop_id()));

drop policy if exists ms_ins on public.measurements;
create policy ms_ins on public.measurements for insert to authenticated with check (
  workshop_id = (select public.my_writable_workshop_id())
  and exists (select 1 from public.clients c where c.id = client_id and c.workshop_id = measurements.workshop_id)
  and public.can_manage_client(client_id)
);

drop policy if exists qt_ins on public.quotes;
drop policy if exists qt_upd on public.quotes;
drop policy if exists qt_del on public.quotes;
create policy qt_ins on public.quotes for insert to authenticated with check (
  workshop_id = (select public.my_writable_workshop_id())
  and status in ('draft','sent')
  and exists (select 1 from public.clients c where c.id = client_id and c.workshop_id = quotes.workshop_id)
  and public.can_manage_client(client_id)
);
create policy qt_upd on public.quotes for update to authenticated
  using (workshop_id = (select public.my_writable_workshop_id()) and status in ('draft','sent') and public.can_manage_client(client_id))
  with check (workshop_id = (select public.my_writable_workshop_id()) and status in ('draft','sent'));
create policy qt_del on public.quotes for delete to authenticated
  using (workshop_id = (select public.my_writable_workshop_id()) and status <> 'accepted' and public.can_manage_client(client_id));

drop policy if exists od_ins on public.orders;
drop policy if exists od_upd on public.orders;
create policy od_ins on public.orders for insert to authenticated with check (
  workshop_id = (select public.my_writable_workshop_id())
  and exists (select 1 from public.clients c where c.id = client_id and c.workshop_id = orders.workshop_id)
  and public.can_manage_client(client_id)
);
create policy od_upd on public.orders for update to authenticated
  using (workshop_id = (select public.my_writable_workshop_id()) and public.can_manage_client(client_id))
  with check (workshop_id = (select public.my_writable_workshop_id()));

drop policy if exists op_ins on public.order_payments;
create policy op_ins on public.order_payments for insert to authenticated with check (
  workshop_id = (select public.my_writable_workshop_id())
  and exists (select 1 from public.orders o where o.id = order_id and o.workshop_id = order_payments.workshop_id and public.can_manage_client(o.client_id))
);

drop policy if exists ap_ins on public.appointments;
drop policy if exists ap_del on public.appointments;
create policy ap_ins on public.appointments for insert to authenticated
  with check (workshop_id = (select public.my_writable_workshop_id()) and public.can_manage_client(client_id));
create policy ap_del on public.appointments for delete to authenticated
  using (workshop_id = (select public.my_writable_workshop_id()) and public.can_manage_client(client_id));

-- Lien d'espace client : seulement par le patron ou le responsable du client
create or replace function public.create_invitation(p_kind public.invitation_kind, p_client_id uuid default null, p_staff_name text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_ws uuid := public.my_workshop_id(); v_token text;
begin
  if not public.can_write_workshop(v_ws) then raise exception 'Accès refusé ou abonnement inactif'; end if;
  if p_kind = 'client' then
    if not exists (select 1 from public.clients where id = p_client_id and workshop_id = v_ws) then
      raise exception 'Client introuvable';
    end if;
    if not public.can_manage_client(p_client_id) then
      raise exception 'Ce client est suivi par un autre employé : seuls lui et le patron peuvent l''inviter';
    end if;
    if exists (select 1 from public.clients where id = p_client_id and user_id is not null) then
      raise exception 'Ce client a déjà activé son espace';
    end if;
  else
    if public.my_role() <> 'tailor_owner' then raise exception 'Seul le propriétaire peut inviter un employé'; end if;
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.invitations (kind, workshop_id, client_id, staff_name, token_hash, expires_at, created_by)
  values (p_kind, v_ws, p_client_id, p_staff_name,
          encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '48 hours', auth.uid());
  return v_token;
end $$;

-- Le patron change le responsable d'un client (p_profile_id NULL = le patron lui-même)
create or replace function public.assign_client(p_client_id uuid, p_profile_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid := public.my_workshop_id();
begin
  if public.my_role() <> 'tailor_owner' or not public.can_write_workshop(v_ws) then
    raise exception 'Seul le patron peut changer le responsable d''un client';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id and workshop_id = v_ws) then raise exception 'Client introuvable'; end if;
  if p_profile_id is not null and not exists (select 1 from public.profiles where id = p_profile_id and workshop_id = v_ws and role = 'tailor_staff') then
    raise exception 'Employé introuvable dans votre atelier';
  end if;
  update public.clients set assigned_to = p_profile_id where id = p_client_id;
end $$;
revoke execute on function public.assign_client(uuid, uuid) from public, anon;
grant execute on function public.assign_client(uuid, uuid) to authenticated;

-- Un employé retiré rend ses clients au patron
create or replace function public.remove_staff(p_profile_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid := public.my_workshop_id(); v_name text; n int;
begin
  if public.my_role() <> 'tailor_owner' then raise exception 'Seul le propriétaire peut retirer un employé'; end if;
  select full_name into v_name from public.profiles
   where id = p_profile_id and workshop_id = v_ws and role = 'tailor_staff';
  if not found then raise exception 'Employé introuvable dans votre atelier'; end if;
  update public.clients set assigned_to = null where workshop_id = v_ws and assigned_to = p_profile_id;
  get diagnostics n = row_count;
  update public.profiles set role = 'pending', workshop_id = null where id = p_profile_id;
  delete from public.push_subscriptions where user_id = p_profile_id;
  perform public.notify_workshop(v_ws, coalesce(nullif(v_name, ''), 'Un employé') || ' a été retiré de l''atelier'
    || case when n > 0 then ' : ses ' || n || ' client(s) vous reviennent' else '' end, '/plus/employes');
end $$;
