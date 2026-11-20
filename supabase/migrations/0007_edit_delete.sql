-- =====================================================================
-- AtelierPro — modifier / supprimer devis, commandes et paiements
-- - Devis : modifiable tant qu'il n'est pas accepté ni refusé (déjà le cas) ; le client ne
--   peut plus être changé ; suppression possible s'il n'est pas accepté.
-- - Commandes et paiements : suppression réservée au propriétaire de l'atelier
--   (les paiements d'une commande supprimée partent avec elle).
-- =====================================================================

create or replace function public.tg_quote_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.total := coalesce((select sum(greatest((l->>'amount')::int, 0)) from jsonb_array_elements(new.lines) l), 0);
  new.number := old.number; new.workshop_id := old.workshop_id; new.client_id := old.client_id;
  return new;
end $$;

create or replace function public.my_owned_workshop_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.workshop_id
  from public.profiles p join public.workshops w on w.id = p.workshop_id
  where p.id = (select auth.uid())
    and p.role = 'tailor_owner'
    and public.workshop_access(w) in ('trial','active')
$$;
revoke all on function public.my_owned_workshop_id() from public, anon;
grant execute on function public.my_owned_workshop_id() to authenticated;

drop policy if exists qt_del on public.quotes;
create policy qt_del on public.quotes for delete to authenticated
  using (workshop_id = (select public.my_writable_workshop_id()) and status <> 'accepted');

drop policy if exists od_del on public.orders;
create policy od_del on public.orders for delete to authenticated
  using (workshop_id = (select public.my_owned_workshop_id()));

drop policy if exists op_del on public.order_payments;
create policy op_del on public.order_payments for delete to authenticated
  using (workshop_id = (select public.my_owned_workshop_id()));

grant delete on public.quotes, public.orders, public.order_payments to authenticated;
