-- =====================================================================
-- AtelierPro — logique métier côté serveur (fonctions + déclencheurs)
-- =====================================================================

-- ---------- Profil créé automatiquement à l'inscription ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name',''),
          coalesce(new.raw_user_meta_data->>'phone',''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Notifications (interne) ----------
create or replace function public.notify(p_user uuid, p_title text, p_link text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, title, link)
  select p_user, p_title, p_link where p_user is not null
$$;

create or replace function public.notify_workshop(p_workshop uuid, p_title text, p_link text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, title, link)
  select owner_id, p_title, p_link from public.workshops where id = p_workshop
$$;

create or replace function public.notify_admins(p_title text, p_link text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, title, link)
  select id, p_title, p_link from public.profiles where role = 'superadmin'
$$;

create or replace function public.log_admin(p_action text, p_workshop uuid, p_details jsonb default '{}') returns void
language sql security definer set search_path = '' as $$
  insert into public.admin_logs (actor_id, action, workshop_id, details)
  values ((select auth.uid()), p_action, p_workshop, coalesce(p_details,'{}'))
$$;

-- ---------- Inscription d'un atelier (essai gratuit automatique) ----------
create or replace function public.register_workshop(p_name text, p_city text, p_phone text, p_full_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_ws uuid; v_days int;
begin
  if v_uid is null then raise exception 'Non connecté'; end if;
  if (select role from public.profiles where id = v_uid) <> 'pending' then
    raise exception 'Ce compte est déjà rattaché à un espace';
  end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Nom d''atelier obligatoire'; end if;
  select trial_days into v_days from public.platform_settings where id = 1;
  insert into public.workshops (name, city, phone, owner_id, trial_ends_at)
  values (trim(p_name), coalesce(trim(p_city),''), coalesce(trim(p_phone),''), v_uid, now() + make_interval(days => v_days))
  returning id into v_ws;
  update public.profiles set role = 'tailor_owner', workshop_id = v_ws,
         full_name = coalesce(nullif(trim(p_full_name),''), full_name),
         phone = coalesce(nullif(trim(p_phone),''), phone)
   where id = v_uid;
  perform public.notify_admins('Nouvel atelier inscrit : ' || trim(p_name), '/admin/ateliers/' || v_ws);
  return v_ws;
end $$;

-- ---------- Invitations sécurisées ----------
create or replace function public.create_invitation(p_kind public.invitation_kind, p_client_id uuid default null, p_staff_name text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_ws uuid := public.my_workshop_id(); v_token text;
begin
  if not public.can_write_workshop(v_ws) then raise exception 'Accès refusé ou abonnement inactif'; end if;
  if p_kind = 'client' then
    if not exists (select 1 from public.clients where id = p_client_id and workshop_id = v_ws) then
      raise exception 'Client introuvable';
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

-- Lecture publique minimale d'une invitation (pour l'écran d'activation)
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
    'expires_at', r.expires_at);
end $$;

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
      raise exception 'Ce compte est déjà utilisé pour un autre espace';
    end if;
    update public.clients set user_id = v_uid where id = i.client_id and user_id is null;
    if not found then raise exception 'Ce client a déjà activé son espace'; end if;
    update public.profiles set role = 'client',
           full_name = coalesce(nullif(trim(p_full_name),''), full_name)
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

-- ---------- Numérotation et totaux ----------
create or replace function public.tg_quote_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.workshops set next_quote_no = next_quote_no + 1 where id = new.workshop_id
  returning next_quote_no - 1 into n;
  new.number := 'D-' || lpad(n::text, 4, '0');
  new.total := coalesce((select sum(greatest((l->>'amount')::int, 0)) from jsonb_array_elements(new.lines) l), 0);
  return new;
end $$;
create trigger quote_before_insert before insert on public.quotes for each row execute function public.tg_quote_before_insert();

create or replace function public.tg_quote_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.total := coalesce((select sum(greatest((l->>'amount')::int, 0)) from jsonb_array_elements(new.lines) l), 0);
  new.number := old.number; new.workshop_id := old.workshop_id;
  return new;
end $$;
create trigger quote_before_update before update on public.quotes for each row execute function public.tg_quote_before_update();

create or replace function public.tg_quote_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status = 'draft') then
    perform public.notify((select user_id from public.clients where id = new.client_id),
      'Nouveau devis ' || new.number || ' : ' || new.title, '/espace/devis/' || new.id);
  end if;
  return new;
end $$;
create trigger quote_notify after insert or update of status on public.quotes for each row execute function public.tg_quote_notify();

create or replace function public.tg_order_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.workshops set next_order_no = next_order_no + 1 where id = new.workshop_id
  returning next_order_no - 1 into n;
  new.number := 'C-' || lpad(n::text, 4, '0');
  return new;
end $$;
create trigger order_before_insert before insert on public.orders for each row execute function public.tg_order_before_insert();

create or replace function public.tg_order_step() returns trigger
language plpgsql security definer set search_path = '' as $$
declare steps text[] := array['Mesures prises','Coupe','Couture','Broderie et finition','Prêt à retirer','Livré'];
begin
  new.updated_at := now();
  if new.step is distinct from old.step then
    perform public.notify((select user_id from public.clients where id = new.client_id),
      new.title || ' (' || new.number || ') : ' || steps[new.step + 1], '/espace/commandes/' || new.id);
  end if;
  return new;
end $$;
create trigger order_step before update on public.orders for each row execute function public.tg_order_step();

create or replace function public.tg_order_payment_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  select * into o from public.orders where id = new.order_id;
  perform public.notify((select user_id from public.clients where id = o.client_id),
    'Paiement de ' || new.amount || ' FCFA enregistré sur ' || o.number, '/espace/commandes/' || o.id);
  return new;
end $$;
create trigger order_payment_notify after insert on public.order_payments for each row execute function public.tg_order_payment_notify();

-- ---------- Réponse du client à un devis ----------
create or replace function public.client_respond_quote(p_quote uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare q record; v_order uuid; v_client text;
begin
  select * into q from public.quotes where id = p_quote for update;
  if not found or q.client_id not in (select public.my_client_ids()) then raise exception 'Devis introuvable'; end if;
  if q.status <> 'sent' then raise exception 'Ce devis a déjà reçu une réponse'; end if;
  select full_name into v_client from public.clients where id = q.client_id;
  update public.quotes set status = case when p_accept then 'accepted'::public.quote_status else 'refused'::public.quote_status end,
         responded_at = now() where id = q.id;
  if p_accept then
    insert into public.orders (workshop_id, client_id, quote_id, title, price)
    values (q.workshop_id, q.client_id, q.id, q.title, q.total) returning id into v_order;
    perform public.notify_workshop(q.workshop_id, v_client || ' a accepté le devis ' || q.number, '/commandes/' || v_order);
  else
    perform public.notify_workshop(q.workshop_id, v_client || ' a refusé le devis ' || q.number, '/commandes');
  end if;
  return v_order;
end $$;

-- ---------- Demande de paiement d'abonnement ----------
create or replace function public.tg_payment_request_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  select * into p from public.plans where id = new.plan_id and is_active;
  if not found then raise exception 'Forfait indisponible'; end if;
  if exists (select 1 from public.payment_requests where workshop_id = new.workshop_id and status = 'pending') then
    raise exception 'Une demande est déjà en cours de vérification';
  end if;
  if (storage.foldername(new.proof_path))[1] is distinct from new.workshop_id::text then
    raise exception 'Preuve de paiement invalide';
  end if;
  new.amount := p.price_monthly * new.months;   -- montant calculé côté serveur
  new.status := 'pending'; new.reviewed_at := null; new.reviewed_by := null;
  return new;
end $$;
create trigger payment_request_before_insert before insert on public.payment_requests
  for each row execute function public.tg_payment_request_before_insert();

create or replace function public.tg_payment_request_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_admins('Paiement à vérifier : ' || (select name from public.workshops where id = new.workshop_id)
    || ' · ' || new.amount || ' FCFA', '/admin/paiements/' || new.id);
  return new;
end $$;
create trigger payment_request_notify after insert on public.payment_requests
  for each row execute function public.tg_payment_request_notify();

-- ---------- Actions du superadministrateur ----------
create or replace function public.admin_review_payment(p_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; v_end timestamptz; v_plan text;
begin
  if not public.is_superadmin() then raise exception 'Réservé au superadministrateur'; end if;
  select * into r from public.payment_requests where id = p_id for update;
  if not found then raise exception 'Demande introuvable'; end if;
  if r.status <> 'pending' then raise exception 'Demande déjà traitée'; end if;
  select name into v_plan from public.plans where id = r.plan_id;
  if p_approve then
    update public.workshops
       set plan_id = r.plan_id,
           subscription_ends_at = greatest(now(), coalesce(subscription_ends_at, now())) + make_interval(months => r.months)
     where id = r.workshop_id returning subscription_ends_at into v_end;
    update public.payment_requests set status = 'validated', reviewed_at = now(), reviewed_by = auth.uid() where id = p_id;
    perform public.log_admin('payment_validated', r.workshop_id,
      jsonb_build_object('request', p_id, 'plan', v_plan, 'months', r.months, 'amount', r.amount, 'reference', r.reference));
    perform public.notify_workshop(r.workshop_id,
      'Paiement validé : forfait ' || v_plan || ' actif jusqu''au ' || to_char(v_end, 'DD/MM/YYYY'), '/plus/abonnement');
  else
    if length(trim(coalesce(p_reason,''))) = 0 then raise exception 'Motif de rejet obligatoire'; end if;
    update public.payment_requests set status = 'rejected', reject_reason = trim(p_reason),
           reviewed_at = now(), reviewed_by = auth.uid() where id = p_id;
    perform public.log_admin('payment_rejected', r.workshop_id,
      jsonb_build_object('request', p_id, 'reason', trim(p_reason), 'reference', r.reference));
    perform public.notify_workshop(r.workshop_id, 'Paiement rejeté : ' || trim(p_reason), '/plus/abonnement');
  end if;
end $$;

create or replace function public.admin_set_suspended(p_workshop uuid, p_suspended boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then raise exception 'Réservé au superadministrateur'; end if;
  update public.workshops set is_suspended = p_suspended where id = p_workshop;
  perform public.log_admin(case when p_suspended then 'workshop_suspended' else 'workshop_reactivated' end,
    p_workshop, jsonb_build_object('reason', p_reason));
  perform public.notify_workshop(p_workshop, case when p_suspended then 'Votre compte a été suspendu' else 'Votre compte a été réactivé' end);
end $$;

create or replace function public.admin_extend_trial(p_workshop uuid, p_days int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then raise exception 'Réservé au superadministrateur'; end if;
  if p_days not between 1 and 365 then raise exception 'Durée invalide'; end if;
  update public.workshops set trial_ends_at = greatest(trial_ends_at, now()) + make_interval(days => p_days) where id = p_workshop;
  perform public.log_admin('trial_extended', p_workshop, jsonb_build_object('days', p_days));
  perform public.notify_workshop(p_workshop, 'Votre essai gratuit a été prolongé de ' || p_days || ' jours', '/plus/abonnement');
end $$;

create or replace function public.admin_extend_subscription(p_workshop uuid, p_plan uuid, p_months int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then raise exception 'Réservé au superadministrateur'; end if;
  if p_months not between 1 and 24 then raise exception 'Durée invalide'; end if;
  update public.workshops
     set plan_id = p_plan,
         subscription_ends_at = greatest(now(), coalesce(subscription_ends_at, now())) + make_interval(months => p_months)
   where id = p_workshop;
  perform public.log_admin('subscription_extended', p_workshop,
    jsonb_build_object('plan', (select name from public.plans where id = p_plan), 'months', p_months));
  perform public.notify_workshop(p_workshop, 'Votre abonnement a été prolongé de ' || p_months || ' mois', '/plus/abonnement');
end $$;

-- Journalisation automatique des forfaits et réglages
create or replace function public.tg_log_plans() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_admin(case when tg_op = 'INSERT' then 'plan_created' else 'plan_updated' end, null,
    jsonb_build_object('plan', new.name, 'price_monthly', new.price_monthly, 'max_staff', new.max_staff, 'active', new.is_active));
  return new;
end $$;
create trigger log_plans after insert or update on public.plans for each row execute function public.tg_log_plans();

create or replace function public.tg_log_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  perform public.log_admin('settings_updated', null, jsonb_build_object(
    'trial_days', new.trial_days, 'orange_money', new.number_orange_money,
    'wave', new.number_wave, 'moov_money', new.number_moov_money));
  return new;
end $$;
create trigger log_settings before update on public.platform_settings for each row execute function public.tg_log_settings();

-- ---------- Droits d'exécution ----------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.get_invitation(text) to anon;
-- Fonctions internes : pas d'appel direct depuis l'application
revoke execute on function public.notify(uuid,text,text), public.notify_workshop(uuid,text,text),
  public.notify_admins(text,text), public.log_admin(text,uuid,jsonb), public.handle_new_user()
  from authenticated;

-- ---------- Stockage des preuves de paiement (bucket privé) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy proofs_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'payment-proofs'
  and (storage.foldername(name))[1] = (select public.my_workshop_id())::text
);
create policy proofs_read on storage.objects for select to authenticated using (
  bucket_id = 'payment-proofs'
  and ((storage.foldername(name))[1] = (select public.my_workshop_id())::text or (select public.is_superadmin()))
);
