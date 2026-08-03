-- 0001_init.sql — Cofre core schema
-- Run via: supabase db push (or psql -f)

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- =========================================================
-- AUTH PROFILE: 1 row per authenticated Telegram user.
-- Telegram identity is the universal handle.
-- =========================================================
create type user_role as enum ('owner', 'friend');

create table profiles (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique not null,
  telegram_username citext,
  first_name text not null,
  last_name text,
  photo_url text,
  role user_role not null default 'friend',
  locale text not null default 'en',  -- 'en' | 'bn'
  default_currency text not null default 'BDT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_telegram_id_idx on profiles (telegram_id);

-- Trigger to keep updated_at fresh.
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch before update on profiles
for each row execute function set_updated_at();

-- =========================================================
-- LEDGER RELATIONSHIP: friendship between two profiles.
-- Edge between you and a friend. Direction-agnostic.
-- =========================================================
create type relation_status as enum ('pending', 'active', 'blocked');

create table relations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  friend_id uuid not null references profiles (id) on delete cascade,
  status relation_status not null default 'pending',
  invite_token text unique not null default encode(gen_random_bytes(24), 'hex'),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (owner_id, friend_id),
  -- A user can't relate to themselves.
  check (owner_id <> friend_id)
);
create index relations_owner_idx on relations (owner_id);
create index relations_friend_idx on relations (friend_id);
create index relations_invite_token_idx on relations (invite_token);

-- =========================================================
-- LEDGER ENTRIES: every lend/borrow/expense lives here.
-- type='expense'     → my spend (only owner_id matters)
-- type='lend'        → I gave money to counterparty (they owe me)
-- type='borrow'      → I owe counterparty (I took money from them)
-- =========================================================
create type entry_kind as enum ('expense', 'lend', 'borrow');
create type entry_status as enum ('open', 'partially_settled', 'settled', 'disputed');

create table entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  counterparty_id uuid references profiles (id) on delete set null,
  relation_id uuid references relations (id) on delete set null,

  kind entry_kind not null,
  status entry_status not null default 'open',

  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'BDT',
  -- store both: input in requested currency, then canonical BDT for analytics
  amount_bdt_cents bigint,

  occurred_at timestamptz not null default now(),
  memo text not null default '',
  -- provenance: where did this entry come from
  source text not null default 'web', -- 'web' | 'telegram' | 'telegram_voice'
  source_message_id text,
  -- original transcribed text (for telegram) — useful for re-classification
  raw_transcript text,
  -- explicit confirmation of intent (so we don't have to guess later)
  confirmed_by_owner boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index entries_owner_idx on entries (owner_id, occurred_at desc);
create index entries_counterparty_idx on entries (counterparty_id, occurred_at desc);
create index entries_kind_idx on entries (kind, status);

create trigger entries_touch before update on entries
for each row execute function set_updated_at();

-- =========================================================
-- SETTLEMENTS: a payment against an open/partial entry.
-- =========================================================
create table settlements (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  settled_at timestamptz not null default now(),
  note text not null default '',
  source text not null default 'web',
  created_at timestamptz not null default now()
);
create index settlements_entry_idx on settlements (entry_id);

-- =========================================================
-- AUDIT LOG: append-only changes (Telegram edits etc).
-- =========================================================
create type audit_event as enum (
  'entry.created', 'entry.updated', 'entry.deleted',
  'entry.settled', 'relation.invited', 'relation.accepted', 'relation.blocked',
  'auth.login', 'auth.logout'
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles (id),
  event audit_event not null,
  subject_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_actor_idx on audit_log (actor_id, created_at desc);

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table profiles enable row level security;
alter table relations enable row level security;
alter table entries enable row level security;
alter table settlements enable row level security;
alter table audit_log enable row level security;

-- Helper: current authenticated profile id (set by app).
create or replace function current_profile_id() returns uuid
language sql stable as $$
  select id from profiles where telegram_id = nullif(current_setting('app.telegram_id', true), '')::bigint
$$;

-- profiles: a user can read their own profile + profiles of confirmed relations.
create policy profiles_self_read on profiles for select
  using (id = current_profile_id());

create policy profiles_relation_read on profiles for select
  using (
    id in (
      select case when owner_id = current_profile_id() then friend_id else owner_id end
      from relations
      where status = 'active'
        and (owner_id = current_profile_id() or friend_id = current_profile_id())
    )
  );

create policy profiles_self_update on profiles for update
  using (id = current_profile_id()) with check (id = current_profile_id());

-- relations: visibility to both endpoints.
create policy relations_read on relations for select
  using (owner_id = current_profile_id() or friend_id = current_profile_id());

create policy relations_owner_write on relations for all
  using (owner_id = current_profile_id())
  with check (owner_id = current_profile_id());

create policy relations_friend_accept on relations for update
  using (friend_id = current_profile_id())
  with check (friend_id = current_profile_id());

-- entries: visible to owner + counterparty (if any). Only owner writes.
create policy entries_read on entries for select
  using (owner_id = current_profile_id() or counterparty_id = current_profile_id());

create policy entries_owner_write on entries for all
  using (owner_id = current_profile_id())
  with check (owner_id = current_profile_id());

create policy entries_counterparty_settle on entries for update
  using (counterparty_id = current_profile_id())
  with check (counterparty_id = current_profile_id());

-- settlements: visible to anyone who can see the parent entry.
create policy settlements_read on settlements for select
  using (
    exists (
      select 1 from entries e
      where e.id = settlements.entry_id
        and (e.owner_id = current_profile_id() or e.counterparty_id = current_profile_id())
    )
  );

create policy settlements_write on settlements for insert
  with check (
    exists (
      select 1 from entries e
      where e.id = settlements.entry_id
        and (e.owner_id = current_profile_id() or e.counterparty_id = current_profile_id())
    )
  );

-- audit_log: only own events are visible.
create policy audit_self_read on audit_log for select
  using (actor_id = current_profile_id());

-- =========================================================
-- HELPER VIEWS
-- =========================================================

-- Per-counterparty balance for owner.
create or replace view v_balances as
select
  e.owner_id,
  e.counterparty_id,
  -- positive => owed to owner (lend minus repayments)
  coalesce(sum(case when e.kind = 'lend' then e.amount_cents else 0 end), 0)
  - coalesce(sum(case when e.kind = 'borrow' then e.amount_cents else 0 end), 0)
  - coalesce((select sum(amount_cents) from settlements s where s.entry_id in (
      select id from entries where owner_id = e.owner_id and counterparty_id = e.counterparty_id and id = s.entry_id
    )), 0) as net_cents,
  e.currency
from entries e
where e.counterparty_id is not null
group by e.owner_id, e.counterparty_id, e.currency;
