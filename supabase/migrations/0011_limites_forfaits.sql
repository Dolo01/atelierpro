-- =====================================================================
-- AtelierPro — limites des forfaits appliquées et textes exacts
--  - Limite de clients (forfait Solo) réellement appliquée à l'ajout d'un client,
--    uniquement avec un abonnement actif (pas pendant l'essai). Les clients déjà
--    enregistrés restent toujours accessibles.
--  - Solo : 80 clients, comme annoncé sur la page des forfaits.
--  - Textes des forfaits alignés sur la règle des comptes (propriétaire compris).
-- =====================================================================

create or replace function public.tg_client_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare w public.workshops; v_max int; v_count int;
begin
  select * into w from public.workshops where id = new.workshop_id;
  if public.workshop_access(w) <> 'active' then return new; end if;
  select max_clients into v_max from public.plans where id = w.plan_id;
  if v_max is null then return new; end if;
  select count(*) into v_count from public.clients where workshop_id = new.workshop_id;
  if v_count >= v_max then
    raise exception 'Votre forfait est limité à % clients. Passez à un forfait supérieur pour en ajouter.', v_max;
  end if;
  return new;
end $$;
revoke execute on function public.tg_client_limit() from public, anon, authenticated;
drop trigger if exists client_limit on public.clients;
create trigger client_limit before insert on public.clients for each row execute function public.tg_client_limit();

update public.plans set max_clients = 80,
  perks = array['1 compte : vous seul', 'Jusqu''à 80 clients', 'Devis et suivi WhatsApp']
 where name = 'Solo' and max_staff = 1;
update public.plans set perks = array['3 comptes : vous + 2 employés', 'Clients illimités', 'Rapports financiers']
 where name = 'Atelier' and max_staff = 3;
update public.plans set perks = array['10 comptes : vous + 9 employés', 'Clients illimités', 'Rapports détaillés']
 where name = 'Maison de couture' and max_staff = 10;
