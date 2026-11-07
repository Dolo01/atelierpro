-- =====================================================================
-- AtelierPro — schéma principal
-- Montants en FCFA (entiers). Toutes les tables sont protégées par RLS.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Types ----------
create type public.user_role as enum ('pending','superadmin','tailor_owner','tailor_staff','client');
create type public.quote_status as enum ('draft','sent','accepted','refused');
create type public.pay_method as enum ('orange_money','wave','moov_money');
create type public.pay_request_status as enum ('pending','validated','rejected');
create type public.invitation_kind as enum ('client','staff');

-- ---------- Réglages plateforme (1 ligne) ----------
create table public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  trial_days int not null default 30 check (trial_days between 0 and 365),
  trial_max_staff int not null default 1,
  number_orange_money text not null default '',
  number_wave text not null default '',
  number_moov_money text not null default '',
  beneficiary_name text not null default 'AtelierPro',
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (1);

-- ---------- Forfaits ----------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_monthly int not null check (price_monthly >= 0),
  max_staff int not null default 1 check (max_staff >= 1),
  max_clients int check (max_clients is null or max_clients > 0),
  perks text[] not null default '{}',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Ateliers ----------
create table public.workshops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null default '',
  phone text not null default '',
  owner_id uuid not null references auth.users(id) on delete restrict,
  trial_ends_at timestamptz not null,
  plan_id uuid references public.plans(id),
  subscription_ends_at timestamptz,
  is_suspended boolean not null default false,
  next_quote_no int not null default 1,
  next_order_no int not null default 1,
  created_at timestamptz not null default now()
);

-- ---------- Profils ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'pending',
  full_name text not null default '',
  phone text not null default '',
  workshop_id uuid references public.workshops(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Clients ----------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  full_name text not null,
  phone text not null default '',
  notes text not null default '',
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workshop_id, user_id)
);
create index on public.clients (workshop_id);
create index on public.clients (user_id);

-- ---------- Mesures (historique : une ligne par prise) ----------
create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  values jsonb not null,
  taken_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index on public.measurements (client_id, taken_at desc);
create index on public.measurements (workshop_id);

-- ---------- Devis ----------
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  number text not null default '',
  title text not null,
  lines jsonb not null default '[]',      -- [{label, amount}]
  total int not null default 0 check (total >= 0),
  deposit int not null default 0 check (deposit >= 0),
  delay text not null default '',
  status public.quote_status not null default 'sent',
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index on public.quotes (workshop_id, created_at desc);
create index on public.quotes (client_id);

-- ---------- Commandes ----------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  number text not null default '',
  title text not null,
  fabric text not null default '',
  price int not null default 0 check (price >= 0),
  step smallint not null default 0 check (step between 0 and 5),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.orders (workshop_id, created_at desc);
create index on public.orders (client_id);
create index on public.orders (quote_id);

-- ---------- Paiements des commandes ----------
create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  amount int not null check (amount > 0),
  method text not null default 'Espèces',
  note text not null default '',
  paid_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index on public.order_payments (order_id);
create index on public.order_payments (workshop_id, paid_at desc);

-- ---------- Rendez-vous ----------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  starts_at timestamptz not null,
  purpose text not null default '',
  created_at timestamptz not null default now()
);
create index on public.appointments (workshop_id, starts_at);
create index on public.appointments (client_id);

-- ---------- Invitations (liens sécurisés, temporaires, usage unique) ----------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  kind public.invitation_kind not null,
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  staff_name text,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.invitations (workshop_id);
create index on public.invitations (client_id);

-- ---------- Demandes de paiement d'abonnement (validation manuelle) ----------
create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  months int not null check (months in (1,3,6,12)),
  amount int not null check (amount > 0),
  method public.pay_method not null,
  reference text not null check (length(trim(reference)) >= 4),
  proof_path text not null,
  status public.pay_request_status not null default 'pending',
  reject_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create index on public.payment_requests (status, created_at desc);
create index on public.payment_requests (workshop_id);
create index on public.payment_requests (plan_id);

-- ---------- Notifications ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

-- ---------- Journal des opérations administratives ----------
create table public.admin_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  workshop_id uuid references public.workshops(id) on delete set null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.admin_logs (created_at desc);
create index on public.admin_logs (workshop_id);
