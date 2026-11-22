-- =====================================================================
-- AtelierPro — employés : limite du forfait toujours respectée, retrait d'un employé
-- Règle : le forfait fixe un nombre de COMPTES d'atelier (propriétaire compris).
--  - Si l'atelier a plus de comptes que son forfait ne le permet (ex. 5 comptes pendant
--    l'essai, puis forfait Solo), les employés passent en lecture seule ; le propriétaire
--    garde la main et retire des employés ou change de forfait.
--  - Le propriétaire peut retirer un employé : son compte perd aussitôt l'accès à l'atelier.
-- =====================================================================

create or replace function public.workshop_user_limit(w public.workshops) returns int
language sql stable security definer set search_path = '' as $$
  select case when public.workshop_access(w) = 'active'
    then coalesce((select max_staff from public.plans where id = w.plan_id), 1)
    else coalesce((select trial_max_staff from public.platform_settings where id = 1), 1) end
$$;

create or replace function public.workshop_over_limit(wid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.profiles where workshop_id = wid and role in ('tailor_owner','tailor_staff'))
       > (select public.workshop_user_limit(w) from public.workshops w where w.id = wid)
$$;
revoke execute on function public.workshop_user_limit(public.workshops), public.workshop_over_limit(uuid) from public, anon;
grant execute on function public.workshop_user_limit(public.workshops), public.workshop_over_limit(uuid) to authenticated;

-- Écriture : employés bloqués tant que l'atelier dépasse son nombre de comptes
create or replace function public.my_writable_workshop_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.workshop_id
  from public.profiles p join public.workshops w on w.id = p.workshop_id
  where p.id = (select auth.uid())
    and p.role in ('tailor_owner','tailor_staff')
    and public.workshop_access(w) in ('trial','active')
    and (p.role = 'tailor_owner' or not public.workshop_over_limit(w.id))
$$;

create or replace function public.can_write_workshop(wid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select wid is not null
     and wid = public.my_workshop_id()
     and public.workshop_access_by_id(wid) in ('trial','active')
     and (public.my_role() = 'tailor_owner' or not public.workshop_over_limit(wid))
$$;

-- Retirer un employé (propriétaire uniquement)
create or replace function public.remove_staff(p_profile_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid := public.my_workshop_id(); v_name text;
begin
  if public.my_role() <> 'tailor_owner' then raise exception 'Seul le propriétaire peut retirer un employé'; end if;
  select full_name into v_name from public.profiles
   where id = p_profile_id and workshop_id = v_ws and role = 'tailor_staff';
  if not found then raise exception 'Employé introuvable dans votre atelier'; end if;
  update public.profiles set role = 'pending', workshop_id = null where id = p_profile_id;
  delete from public.push_subscriptions where user_id = p_profile_id;
  perform public.notify_workshop(v_ws, coalesce(nullif(v_name, ''), 'Un employé') || ' a été retiré de l''atelier', '/plus/employes');
end $$;
revoke execute on function public.remove_staff(uuid) from public, anon;
grant execute on function public.remove_staff(uuid) to authenticated;
