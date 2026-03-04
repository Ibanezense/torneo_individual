-- Qualification model refactor:
-- - Keeps arrow-by-arrow detail in qualification_scores
-- - Adds explicit round_number + end_in_round
-- - Adds aggregated tables:
--   * qualification_ends (per end)
--   * qualification_rounds (per round)
-- - Adds tournament format fields:
--   * qualification_rounds_count (1..2)
--   * ends_per_round (5,6,10,12)
--
-- Safe to run more than once.

begin;

-- 1) Tournament qualification format
alter table public.tournaments
  add column if not exists qualification_rounds_count integer not null default 1,
  add column if not exists ends_per_round integer not null default 6;

update public.tournaments t
set qualification_rounds_count = case
      when t.qualification_rounds_count in (1, 2) then t.qualification_rounds_count
      else 1
    end,
    ends_per_round = case
      when t.ends_per_round in (5, 6, 10, 12) then t.ends_per_round
      when t.arrows_per_end > 0 and (t.qualification_arrows / t.arrows_per_end) in (5, 6, 10, 12)
        then (t.qualification_arrows / t.arrows_per_end)
      else 6
    end;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tournaments_qualification_rounds_count_chk'
  ) then
    alter table public.tournaments
      add constraint tournaments_qualification_rounds_count_chk
      check (qualification_rounds_count in (1, 2));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tournaments_ends_per_round_chk'
  ) then
    alter table public.tournaments
      add constraint tournaments_ends_per_round_chk
      check (ends_per_round in (5, 6, 10, 12));
  end if;
end $$;

-- 2) qualification_scores: add round_number + end_in_round
alter table public.qualification_scores
  add column if not exists round_number integer,
  add column if not exists end_in_round integer;

update public.qualification_scores qs
set round_number = floor((greatest(qs.end_number, 1) - 1)::numeric / nullif(t.ends_per_round, 0))::integer + 1,
    end_in_round = ((greatest(qs.end_number, 1) - 1) % nullif(t.ends_per_round, 0)) + 1
from public.assignments a
join public.tournaments t on t.id = a.tournament_id
where qs.assignment_id = a.id
  and (qs.round_number is null or qs.end_in_round is null);

update public.qualification_scores
set round_number = 1
where round_number is null;

update public.qualification_scores
set end_in_round = greatest(end_number, 1)
where end_in_round is null;

alter table public.qualification_scores
  alter column round_number set default 1,
  alter column end_in_round set default 1,
  alter column round_number set not null,
  alter column end_in_round set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'qualification_scores_round_number_chk'
  ) then
    alter table public.qualification_scores
      add constraint qualification_scores_round_number_chk
      check (round_number >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'qualification_scores_end_in_round_chk'
  ) then
    alter table public.qualification_scores
      add constraint qualification_scores_end_in_round_chk
      check (end_in_round >= 1);
  end if;
end $$;

-- 3) qualification_ends: add round fields + end/round stats
alter table public.qualification_ends
  add column if not exists round_number integer,
  add column if not exists end_in_round integer,
  add column if not exists ten_plus_x_count integer not null default 0,
  add column if not exists x_count integer not null default 0,
  add column if not exists arrows_shot integer not null default 0;

-- Backfill end stats from scores where possible
with end_agg as (
  select
    qs.assignment_id,
    qs.end_number,
    min(qs.round_number) as round_number,
    min(qs.end_in_round) as end_in_round,
    sum(case when qs.score = 11 then 10 when qs.score is null then 0 else qs.score end) as end_total,
    count(*) filter (where qs.score in (10, 11)) as ten_plus_x_count,
    count(*) filter (where qs.score = 11) as x_count,
    count(*) filter (where qs.score is not null) as arrows_shot
  from public.qualification_scores qs
  group by qs.assignment_id, qs.end_number
)
update public.qualification_ends qe
set round_number = coalesce(qe.round_number, a.round_number),
    end_in_round = coalesce(qe.end_in_round, a.end_in_round),
    end_total = a.end_total,
    ten_plus_x_count = a.ten_plus_x_count,
    x_count = a.x_count,
    arrows_shot = a.arrows_shot
from end_agg a
where qe.assignment_id = a.assignment_id
  and qe.end_number = a.end_number;

-- Fill remaining null round fields from assignment/tournament format
update public.qualification_ends qe
set round_number = floor((greatest(qe.end_number, 1) - 1)::numeric / nullif(t.ends_per_round, 0))::integer + 1,
    end_in_round = ((greatest(qe.end_number, 1) - 1) % nullif(t.ends_per_round, 0)) + 1
from public.assignments a
join public.tournaments t on t.id = a.tournament_id
where qe.assignment_id = a.id
  and (qe.round_number is null or qe.end_in_round is null);

update public.qualification_ends
set round_number = 1
where round_number is null;

update public.qualification_ends
set end_in_round = greatest(end_number, 1)
where end_in_round is null;

alter table public.qualification_ends
  alter column round_number set default 1,
  alter column end_in_round set default 1,
  alter column round_number set not null,
  alter column end_in_round set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'qualification_ends_round_number_chk'
  ) then
    alter table public.qualification_ends
      add constraint qualification_ends_round_number_chk
      check (round_number >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'qualification_ends_end_in_round_chk'
  ) then
    alter table public.qualification_ends
      add constraint qualification_ends_end_in_round_chk
      check (end_in_round >= 1);
  end if;
end $$;

-- 4) New table: qualification_rounds (aggregates per round)
create table if not exists public.qualification_rounds (
  id uuid not null default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  round_number integer not null,
  round_total integer not null default 0,
  ten_plus_x_count integer not null default 0,
  x_count integer not null default 0,
  arrows_shot integer not null default 0,
  ends_completed integer not null default 0,
  is_confirmed boolean not null default false,
  confirmed_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint qualification_rounds_pkey primary key (id)
);

alter table public.qualification_rounds
  add column if not exists assignment_id uuid,
  add column if not exists round_number integer,
  add column if not exists round_total integer not null default 0,
  add column if not exists ten_plus_x_count integer not null default 0,
  add column if not exists x_count integer not null default 0,
  add column if not exists arrows_shot integer not null default 0,
  add column if not exists ends_completed integer not null default 0,
  add column if not exists is_confirmed boolean not null default false,
  add column if not exists confirmed_at timestamp with time zone null,
  add column if not exists created_at timestamp with time zone not null default now(),
  add column if not exists updated_at timestamp with time zone not null default now();

alter table public.qualification_rounds
  alter column assignment_id set not null,
  alter column round_number set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'qualification_rounds_assignment_id_fkey'
  ) then
    alter table public.qualification_rounds
      add constraint qualification_rounds_assignment_id_fkey
      foreign key (assignment_id) references public.assignments(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'qualification_rounds_round_number_chk'
  ) then
    alter table public.qualification_rounds
      add constraint qualification_rounds_round_number_chk
      check (round_number >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'qualification_rounds_assignment_round_unique'
  ) then
    alter table public.qualification_rounds
      add constraint qualification_rounds_assignment_round_unique
      unique (assignment_id, round_number);
  end if;
end $$;

-- 5) Dedupe and indexes/uniques
with ranked_scores as (
  select
    id,
    row_number() over (
      partition by assignment_id, round_number, end_in_round, arrow_number
      order by recorded_at desc nulls last, id desc
    ) as rn
  from public.qualification_scores
)
delete from public.qualification_scores qs
using ranked_scores r
where qs.id = r.id
  and r.rn > 1;

with ranked_ends as (
  select
    id,
    row_number() over (
      partition by assignment_id, round_number, end_in_round
      order by is_confirmed desc, confirmed_at desc nulls last, id desc
    ) as rn
  from public.qualification_ends
)
delete from public.qualification_ends qe
using ranked_ends r
where qe.id = r.id
  and r.rn > 1;

create unique index if not exists uq_qualification_scores_assignment_round_end_arrow
  on public.qualification_scores (assignment_id, round_number, end_in_round, arrow_number);

create index if not exists idx_qualification_scores_assignment_round
  on public.qualification_scores (assignment_id, round_number);

create index if not exists idx_qualification_scores_assignment_round_end
  on public.qualification_scores (assignment_id, round_number, end_in_round);

create unique index if not exists uq_qualification_ends_assignment_round_end
  on public.qualification_ends (assignment_id, round_number, end_in_round);

create index if not exists idx_qualification_ends_assignment_round
  on public.qualification_ends (assignment_id, round_number);

create index if not exists idx_qualification_rounds_assignment_round
  on public.qualification_rounds (assignment_id, round_number);

-- 6) Helper: normalize round/end fields from assignment/tournament format
create or replace function public.normalize_qualification_round_fields()
returns trigger
language plpgsql
as $$
declare
  v_ends_per_round integer := 6;
begin
  select coalesce(t.ends_per_round, 6)
  into v_ends_per_round
  from public.assignments a
  join public.tournaments t on t.id = a.tournament_id
  where a.id = new.assignment_id
  limit 1;

  if coalesce(v_ends_per_round, 0) <= 0 then
    v_ends_per_round := 6;
  end if;

  if new.end_number is null and new.round_number is not null and new.end_in_round is not null then
    new.end_number := ((greatest(new.round_number, 1) - 1) * v_ends_per_round) + greatest(new.end_in_round, 1);
  end if;

  if new.end_number is null then
    new.end_number := 1;
  end if;

  if new.round_number is null then
    new.round_number := floor((greatest(new.end_number, 1) - 1)::numeric / v_ends_per_round)::integer + 1;
  end if;

  if new.end_in_round is null then
    new.end_in_round := ((greatest(new.end_number, 1) - 1) % v_ends_per_round) + 1;
  end if;

  new.end_number := greatest(new.end_number, 1);
  new.round_number := greatest(new.round_number, 1);
  new.end_in_round := greatest(new.end_in_round, 1);

  return new;
end;
$$;

drop trigger if exists trg_qualification_scores_normalize_round_fields on public.qualification_scores;
create trigger trg_qualification_scores_normalize_round_fields
before insert or update of assignment_id, end_number, round_number, end_in_round
on public.qualification_scores
for each row
execute function public.normalize_qualification_round_fields();

drop trigger if exists trg_qualification_ends_normalize_round_fields on public.qualification_ends;
create trigger trg_qualification_ends_normalize_round_fields
before insert or update of assignment_id, end_number, round_number, end_in_round
on public.qualification_ends
for each row
execute function public.normalize_qualification_round_fields();

-- 7) Aggregation functions (scores -> ends -> rounds)
create or replace function public.recompute_qualification_end(
  p_assignment_id uuid,
  p_round_number integer,
  p_end_in_round integer
)
returns void
language plpgsql
as $$
declare
  v_end_number integer;
begin
  if p_assignment_id is null or p_round_number is null or p_end_in_round is null then
    return;
  end if;

  select ((p_round_number - 1) * coalesce(t.ends_per_round, 6)) + p_end_in_round
  into v_end_number
  from public.assignments a
  join public.tournaments t on t.id = a.tournament_id
  where a.id = p_assignment_id
  limit 1;

  if v_end_number is null then
    return;
  end if;

  insert into public.qualification_ends (
    assignment_id,
    round_number,
    end_in_round,
    end_number,
    end_total,
    ten_plus_x_count,
    x_count,
    arrows_shot,
    is_confirmed,
    confirmed_at
  )
  select
    p_assignment_id,
    p_round_number,
    p_end_in_round,
    v_end_number,
    coalesce(sum(case when qs.score = 11 then 10 when qs.score is null then 0 else qs.score end), 0),
    count(*) filter (where qs.score in (10, 11)),
    count(*) filter (where qs.score = 11),
    count(*) filter (where qs.score is not null),
    coalesce((
      select qe.is_confirmed
      from public.qualification_ends qe
      where qe.assignment_id = p_assignment_id
        and qe.round_number = p_round_number
        and qe.end_in_round = p_end_in_round
      limit 1
    ), false),
    (
      select qe.confirmed_at
      from public.qualification_ends qe
      where qe.assignment_id = p_assignment_id
        and qe.round_number = p_round_number
        and qe.end_in_round = p_end_in_round
      limit 1
    )
  from public.qualification_scores qs
  where qs.assignment_id = p_assignment_id
    and qs.round_number = p_round_number
    and qs.end_in_round = p_end_in_round
  on conflict (assignment_id, round_number, end_in_round)
  do update set
    end_number = excluded.end_number,
    end_total = excluded.end_total,
    ten_plus_x_count = excluded.ten_plus_x_count,
    x_count = excluded.x_count,
    arrows_shot = excluded.arrows_shot,
    is_confirmed = public.qualification_ends.is_confirmed,
    confirmed_at = public.qualification_ends.confirmed_at;

  if not exists (
    select 1
    from public.qualification_scores qs
    where qs.assignment_id = p_assignment_id
      and qs.round_number = p_round_number
      and qs.end_in_round = p_end_in_round
      and qs.score is not null
  ) then
    delete from public.qualification_ends qe
    where qe.assignment_id = p_assignment_id
      and qe.round_number = p_round_number
      and qe.end_in_round = p_end_in_round
      and coalesce(qe.is_confirmed, false) = false;
  end if;
end;
$$;

create or replace function public.recompute_qualification_round(
  p_assignment_id uuid,
  p_round_number integer
)
returns void
language plpgsql
as $$
begin
  if p_assignment_id is null or p_round_number is null then
    return;
  end if;

  insert into public.qualification_rounds (
    assignment_id,
    round_number,
    round_total,
    ten_plus_x_count,
    x_count,
    arrows_shot,
    ends_completed,
    is_confirmed,
    confirmed_at
  )
  with score_agg as (
    select
      coalesce(sum(case when qs.score = 11 then 10 when qs.score is null then 0 else qs.score end), 0) as round_total,
      count(*) filter (where qs.score in (10, 11)) as ten_plus_x_count,
      count(*) filter (where qs.score = 11) as x_count,
      count(*) filter (where qs.score is not null) as arrows_shot
    from public.qualification_scores qs
    where qs.assignment_id = p_assignment_id
      and qs.round_number = p_round_number
  ),
  end_agg as (
    select
      count(*) filter (where qe.is_confirmed) as ends_completed,
      coalesce(bool_and(qe.is_confirmed), false) as is_confirmed,
      max(qe.confirmed_at) filter (where qe.is_confirmed) as confirmed_at
    from public.qualification_ends qe
    where qe.assignment_id = p_assignment_id
      and qe.round_number = p_round_number
  )
  select
    p_assignment_id,
    p_round_number,
    s.round_total,
    s.ten_plus_x_count,
    s.x_count,
    s.arrows_shot,
    e.ends_completed,
    e.is_confirmed,
    e.confirmed_at
  from score_agg s
  cross join end_agg e
  on conflict (assignment_id, round_number)
  do update set
    round_total = excluded.round_total,
    ten_plus_x_count = excluded.ten_plus_x_count,
    x_count = excluded.x_count,
    arrows_shot = excluded.arrows_shot,
    ends_completed = excluded.ends_completed,
    is_confirmed = excluded.is_confirmed,
    confirmed_at = excluded.confirmed_at;

  if not exists (
    select 1
    from public.qualification_scores qs
    where qs.assignment_id = p_assignment_id
      and qs.round_number = p_round_number
      and qs.score is not null
  ) and not exists (
    select 1
    from public.qualification_ends qe
    where qe.assignment_id = p_assignment_id
      and qe.round_number = p_round_number
      and qe.is_confirmed
  ) then
    delete from public.qualification_rounds qr
    where qr.assignment_id = p_assignment_id
      and qr.round_number = p_round_number;
  end if;
end;
$$;

create or replace function public.trg_recompute_from_qualification_scores()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_qualification_end(old.assignment_id, old.round_number, old.end_in_round);
    perform public.recompute_qualification_round(old.assignment_id, old.round_number);
    return old;
  end if;

  perform public.recompute_qualification_end(new.assignment_id, new.round_number, new.end_in_round);
  perform public.recompute_qualification_round(new.assignment_id, new.round_number);

  if tg_op = 'UPDATE' and (
    old.assignment_id is distinct from new.assignment_id
    or old.round_number is distinct from new.round_number
    or old.end_in_round is distinct from new.end_in_round
  ) then
    perform public.recompute_qualification_end(old.assignment_id, old.round_number, old.end_in_round);
    perform public.recompute_qualification_round(old.assignment_id, old.round_number);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_recompute_from_qualification_scores on public.qualification_scores;
create trigger trg_recompute_from_qualification_scores
after insert or update or delete
on public.qualification_scores
for each row
execute function public.trg_recompute_from_qualification_scores();

create or replace function public.trg_recompute_round_from_qualification_ends()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_qualification_round(old.assignment_id, old.round_number);
    return old;
  end if;

  perform public.recompute_qualification_round(new.assignment_id, new.round_number);

  if tg_op = 'UPDATE' and (
    old.assignment_id is distinct from new.assignment_id
    or old.round_number is distinct from new.round_number
  ) then
    perform public.recompute_qualification_round(old.assignment_id, old.round_number);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_recompute_round_from_qualification_ends on public.qualification_ends;
create trigger trg_recompute_round_from_qualification_ends
after insert or update or delete
on public.qualification_ends
for each row
execute function public.trg_recompute_round_from_qualification_ends();

-- 8) Backfill qualification_rounds from current scores/ends
with round_keys as (
  select distinct assignment_id, round_number from public.qualification_scores
  union
  select distinct assignment_id, round_number from public.qualification_ends
),
score_agg as (
  select
    qs.assignment_id,
    qs.round_number,
    coalesce(sum(case when qs.score = 11 then 10 when qs.score is null then 0 else qs.score end), 0) as round_total,
    count(*) filter (where qs.score in (10, 11)) as ten_plus_x_count,
    count(*) filter (where qs.score = 11) as x_count,
    count(*) filter (where qs.score is not null) as arrows_shot
  from public.qualification_scores qs
  group by qs.assignment_id, qs.round_number
),
end_agg as (
  select
    qe.assignment_id,
    qe.round_number,
    count(*) filter (where qe.is_confirmed) as ends_completed,
    coalesce(bool_and(qe.is_confirmed), false) as is_confirmed,
    max(qe.confirmed_at) filter (where qe.is_confirmed) as confirmed_at
  from public.qualification_ends qe
  group by qe.assignment_id, qe.round_number
)
insert into public.qualification_rounds (
  assignment_id,
  round_number,
  round_total,
  ten_plus_x_count,
  x_count,
  arrows_shot,
  ends_completed,
  is_confirmed,
  confirmed_at
)
select
  k.assignment_id,
  k.round_number,
  coalesce(s.round_total, 0),
  coalesce(s.ten_plus_x_count, 0),
  coalesce(s.x_count, 0),
  coalesce(s.arrows_shot, 0),
  coalesce(e.ends_completed, 0),
  coalesce(e.is_confirmed, false),
  e.confirmed_at
from round_keys k
left join score_agg s
  on s.assignment_id = k.assignment_id
 and s.round_number = k.round_number
left join end_agg e
  on e.assignment_id = k.assignment_id
 and e.round_number = k.round_number
on conflict (assignment_id, round_number)
do update set
  round_total = excluded.round_total,
  ten_plus_x_count = excluded.ten_plus_x_count,
  x_count = excluded.x_count,
  arrows_shot = excluded.arrows_shot,
  ends_completed = excluded.ends_completed,
  is_confirmed = excluded.is_confirmed,
  confirmed_at = excluded.confirmed_at;

-- 9) Updated-at trigger for qualification_rounds
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'update_qualification_rounds_updated_at'
  ) then
    create trigger update_qualification_rounds_updated_at
    before update on public.qualification_rounds
    for each row
    execute function public.update_updated_at_column();
  end if;
end $$;

commit;
