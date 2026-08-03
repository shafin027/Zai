-- 0002_tours.sql — adds tour management on top of the personal ledger.
-- A "tour" is a shared budget owned by one leader. Team members are linked
-- through the existing relations table; the leader funds the trip and the
-- system reconciles leftover pot back to each member when the tour closes.

-- =========================================================
-- ROLES INSIDE A TOUR
-- =========================================================
create type tour_role as enum ('leader', 'member');

-- =========================================================
-- TOURS
-- =========================================================
create type tour_status as enum ('planning', 'active', 'closed');

create table tours (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  nickname citext,                       -- voice-friendly alternate ("Dhaka trip")
  destination text,
  status tour_status not null default 'planning',
  currency text not null default 'BDT',
  -- pot = total money the leader puts in initially + any top-ups.
  pot_cents bigint not null default 0 check (pot_cents >= 0),
  starts_at date not null default current_date,
  ends_at date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, nickname)
);
create index tours_owner_idx on tours (owner_id, starts_at desc);
create index tours_nickname_idx on tours (owner_id, nickname);

create trigger tours_touch before update on tours
for each row execute function set_updated_at();

-- =========================================================
-- TOUR MEMBERS — leader + N members, each with their own allocation.
-- =========================================================
create table tour_members (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  role tour_role not null default 'member',
  -- how much of the pot this member is expected to consume
  allocated_cents bigint not null default 0 check (allocated_cents >= 0),
  joined_at timestamptz not null default now(),
  -- tour is closed for this member individually (rare; e.g. dropped out)
  exited_at timestamptz,
  unique (tour_id, profile_id)
);
create index tour_members_tour_idx on tour_members (tour_id);
create index tour_members_profile_idx on tour_members (profile_id);

-- =========================================================
-- TOUR POT TOP-UPS — leader deposits more money mid-trip.
-- =========================================================
create table tour_topups (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  source text not null default 'web',    -- 'web' | 'telegram' | 'telegram_voice'
  memo text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint tour_topups_positive check (amount_cents > 0)
);
create index tour_topups_tour_idx on tour_topups (tour_id);

-- =========================================================
-- EXTEND entries: optional tour scope.
-- =========================================================
alter table entries
  add column tour_id uuid references tours (id) on delete set null,
  add column tour_member_id uuid references tour_members (id) on delete set null;

create index entries_tour_idx on entries (tour_id, occurred_at desc);

-- =========================================================
-- RLS for the new tables
-- =========================================================
alter table tours enable row level security;
alter table tour_members enable row level security;
alter table tour_topups enable row level security;

-- Tour leader: full read+write on their own tours.
create policy tours_owner_read on tours for select
  using (owner_id = current_profile_id());

create policy tours_owner_write on tours for all
  using (owner_id = current_profile_id())
  with check (owner_id = current_profile_id());

-- Any active member of a tour can read the tour.
create policy tours_member_read on tours for select
  using (
    exists (
      select 1 from tour_members m
      where m.tour_id = tours.id
        and m.profile_id = current_profile_id()
        and m.exited_at is null
    )
  );

-- Members can read their own membership + co-members of the same tour.
create policy tour_members_self_read on tour_members for select
  using (profile_id = current_profile_id());

create policy tour_members_leader_read on tour_members for select
  using (
    exists (select 1 from tours t where t.id = tour_members.tour_id and t.owner_id = current_profile_id())
  );

create policy tour_members_tourmate_read on tour_members for select
  using (
    exists (
      select 1 from tour_members m
      where m.tour_id = tour_members.tour_id
        and m.profile_id = current_profile_id()
        and m.exited_at is null
    )
  );

create policy tour_members_leader_write on tour_members for all
  using (
    exists (select 1 from tours t where t.id = tour_members.tour_id and t.owner_id = current_profile_id())
  )
  with check (
    exists (select 1 from tours t where t.id = tour_members.tour_id and t.owner_id = current_profile_id())
  );

-- Top-ups: leader writes/reads; members can read sum only via view.
create policy tour_topups_leader_read on tour_topups for select
  using (
    exists (select 1 from tours t where t.id = tour_topups.tour_id and t.owner_id = current_profile_id())
  );

create policy tour_topups_member_read on tour_topups for select
  using (
    exists (
      select 1 from tour_members m
      where m.tour_id = tour_topups.tour_id
        and m.profile_id = current_profile_id()
        and m.exited_at is null
    )
  );

create policy tour_topups_leader_write on tour_topups for insert
  with check (
    exists (select 1 from tours t where t.id = tour_topups.tour_id and t.owner_id = current_profile_id())
  );

-- Entries scope: if the entry has a tour_id, the writer must be on that tour.
-- (Keeps personal entries private to the leader's personal scope.)
create policy entries_tour_member_read on entries for select
  using (
    tour_id is not null and (
      owner_id = current_profile_id() or
      counterparty_id = current_profile_id() or
      exists (
        select 1 from tour_members m
        where m.tour_id = entries.tour_id
          and m.profile_id = current_profile_id()
          and m.exited_at is null
      )
    )
  );

-- =========================================================
-- VIEWS
-- =========================================================

-- Per-tour dashboard summary
create or replace view v_tour_summary as
select
  t.id as tour_id,
  t.owner_id,
  t.name,
  t.nickname,
  t.destination,
  t.currency,
  t.status,
  coalesce(t.pot_cents, 0) + coalesce((select sum(amount_cents) from tour_topups tt where tt.tour_id = t.id), 0) as total_pot_cents,
  coalesce((select sum(amount_cents)
            from entries e
            where e.tour_id = t.id
              and e.kind in ('expense','lend')), 0) as spent_cents,
  coalesce((select sum(amount_cents)
            from entries e
            where e.tour_id = t.id
              and e.kind = 'settle'), 0) as repaid_cents,
  (
    coalesce(t.pot_cents, 0)
    + coalesce((select sum(amount_cents) from tour_topups tt where tt.tour_id = t.id), 0)
    - coalesce((select sum(amount_cents)
                from entries e
                where e.tour_id = t.id
                  and e.kind in ('expense','lend')), 0)
    + coalesce((select sum(amount_cents)
                from entries e
                where e.tour_id = t.id
                  and e.kind = 'settle'), 0)
  ) as leftover_cents
from tours t;

create or replace view v_tour_member_summary as
select
  m.tour_id,
  m.profile_id,
  m.role,
  m.allocated_cents,
  coalesce((
    select sum(e.amount_cents)
    from entries e
    where e.tour_id = m.tour_id
      and (e.counterparty_id = m.profile_id or (e.kind='expense' and e.tour_member_id = m.id))
  ), 0) as consumed_cents,
  m.allocated_cents - coalesce((
    select sum(e.amount_cents)
    from entries e
    where e.tour_id = m.tour_id
      and (e.counterparty_id = m.profile_id or (e.kind='expense' and e.tour_member_id = m.id))
  ), 0) as leftover_to_member_cents
from tour_members m;

comment on view v_tour_summary is
'Per-tour rollup: pot, spent, repaid, leftover. Negative leftover = the leader is short (members must repay).';
