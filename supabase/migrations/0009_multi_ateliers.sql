-- =====================================================================
-- AtelierPro — un client, plusieurs ateliers
-- Un client garde UN seul compte (son numéro de téléphone). Chaque atelier qui l'invite
-- s'ajoute à son espace. Ici :
--  - get_invitation dit si ce numéro a déjà un compte (le client n'a alors qu'à se connecter) ;
--  - accept_invitation refuse un doublon dans le même atelier ;
--  - les notifications envoyées au client indiquent le nom de l'atelier.
-- =====================================================================

create or replace function public.phone_email(p text) returns text
language sql immutable set search_path = '' as $$
  select case when d like '00%' then substr(d, 3) when length(d) = 8 then '223' || d else d end || '@tel.atelierpro.app'
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;
revoke execute on function public.phone_email(text) from public, anon, authenticated;

create or replace function public.get_invitation(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  select i.kind, i.expires_at, i.used_at, w.name as workshop, c.full_name as client_name, c.phone as client_phone, i.staff_name
    into r
    from public.invitations i
    join public.workshops w on w.id = i.workshop_id
    left join public.clients c on c.id = i.client_id
   where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then return jsonb_build_object('status','invalid'); end if;
  return jsonb_build_object(
    'status', case when r.used_at is not null then 'used' when r.expires_at < now() then 'expired' else 'ok' end,
    'kind', r.kind, 'workshop', r.workshop,
    'name', coalesce(r.client_name, r.staff_name, ''),
    'phone', coalesce(r.client_phone, ''),
    'has_account', coalesce(r.client_phone, '') <> '' and exists (select 1 from auth.users u where u.email = public.phone_email(r.client_phone)),
    'expires_at', r.expires_at);
end $$;
grant execute on function public.get_invitation(text) to anon, authenticated;

create or replace function public.accept_invitation(p_token text, p_full_name text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); i record; v_limit int; v_count int; v_ws record;
begin
  if v_uid is null then raise exception 'Non connecté'; end if;
  select * into i from public.invitations
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found then raise exception 'Lien d''invitation invalide'; end if;
  if i.used_at is not null then raise exception 'Ce lien a déjà été utilisé'; end if;
  if i.expires_at < now() then raise exception 'Ce lien a expiré. Demandez un nouveau lien à votre atelier.'; end if;

  if i.kind = 'client' then
    if (select role from public.profiles where id = v_uid) not in ('pending','client') then
      raise exception 'Ce compte est un compte d''atelier. Déconnectez-vous puis ouvrez le lien avec le compte du client.';
    end if;
    if exists (select 1 from public.clients where workshop_id = i.workshop_id and user_id = v_uid) then
      raise exception 'Vous êtes déjà client de cet atelier : il est déjà dans votre espace.';
    end if;
    update public.clients set user_id = v_uid where id = i.client_id and user_id is null;
    if not found then raise exception 'Ce client a déjà activé son espace'; end if;
    update public.profiles set role = 'client',
           full_name = case when role = 'pending' then coalesce(nullif(trim(p_full_name),''), full_name) else full_name end
     where id = v_uid;
    perform public.notify_workshop(i.workshop_id,
      (select full_name from public.clients where id = i.client_id) || ' a activé son espace client', '/clients/' || i.client_id);
  else
    if (select role from public.profiles where id = v_uid) <> 'pending' then
      raise exception 'Ce compte est déjà utilisé pour un autre espace';
    end if;
    select * into v_ws from public.workshops where id = i.workshop_id;
    if public.workshop_access(v_ws) = 'active' then
      select max_staff into v_limit from public.plans where id = v_ws.plan_id;
    else
      select trial_max_staff into v_limit from public.platform_settings where id = 1;
    end if;
    select count(*) into v_count from public.profiles
     where workshop_id = i.workshop_id and role in ('tailor_owner','tailor_staff');
    if v_count >= coalesce(v_limit, 1) then
      raise exception 'Le forfait de l''atelier ne permet pas d''employé supplémentaire';
    end if;
    update public.profiles set role = 'tailor_staff', workshop_id = i.workshop_id,
           full_name = coalesce(nullif(trim(p_full_name),''), nullif(i.staff_name,''), full_name)
     where id = v_uid;
    perform public.notify_workshop(i.workshop_id, coalesce(nullif(trim(p_full_name),''), i.staff_name, 'Un employé') || ' a rejoint l''atelier', '/plus/employes');
  end if;
  update public.invitations set used_at = now() where id = i.id;
  return i.kind::text;
end $$;

-- Notifications du client : on précise de quel atelier elles viennent
create or replace function public.tg_quote_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status = 'draft') then
    perform public.notify((select user_id from public.clients where id = new.client_id),
      (select name from public.workshops where id = new.workshop_id) || ' · Nouveau devis ' || new.number || ' : ' || new.title,
      '/espace/devis/' || new.id);
  end if;
  return new;
end $$;

create or replace function public.tg_order_step() returns trigger
language plpgsql security definer set search_path = '' as $$
declare steps text[] := array['Mesures prises','Coupe','Couture','Broderie et finition','Prêt à retirer','Livré'];
begin
  new.updated_at := now();
  if new.step is distinct from old.step then
    perform public.notify((select user_id from public.clients where id = new.client_id),
      (select name from public.workshops where id = new.workshop_id) || ' · ' || new.title || ' (' || new.number || ') : ' || steps[new.step + 1],
      '/espace/commandes/' || new.id);
  end if;
  return new;
end $$;

create or replace function public.tg_order_payment_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  select * into o from public.orders where id = new.order_id;
  perform public.notify((select user_id from public.clients where id = o.client_id),
    (select name from public.workshops where id = o.workshop_id) || ' · Paiement de ' || new.amount || ' FCFA enregistré sur ' || o.number || ' (reçu ' || coalesce(new.receipt_no, '') || ')',
    '/espace/commandes/' || o.id);
  return new;
end $$;
