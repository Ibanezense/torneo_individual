-- Adds categories/divisions to tournaments and division to elimination_brackets.
-- Safe to run more than once.

begin;

-- tournaments: categories + divisions
alter table public.tournaments
  add column if not exists categories text[] not null
    default array['u10','u13','u15','u18','u21','senior','master','open']::text[],
  add column if not exists divisions text[] not null
    default array['recurvo','compuesto','barebow']::text[];

update public.tournaments t
set categories = coalesce(
      (
        select array_agg(distinct c)
        from unnest(coalesce(t.categories, array[]::text[])) as c
        where c = any(array['u10','u13','u15','u18','u21','senior','master','open']::text[])
      ),
      array['u10','u13','u15','u18','u21','senior','master','open']::text[]
    ),
    divisions = coalesce(
      (
        select array_agg(distinct d)
        from unnest(coalesce(t.divisions, array[]::text[])) as d
        where d = any(array['recurvo','compuesto','barebow']::text[])
      ),
      array['recurvo','compuesto','barebow']::text[]
    );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tournaments_categories_valid_chk'
  ) then
    alter table public.tournaments
      add constraint tournaments_categories_valid_chk
      check (
        cardinality(categories) > 0
        and categories <@ array['u10','u13','u15','u18','u21','senior','master','open']::text[]
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tournaments_divisions_valid_chk'
  ) then
    alter table public.tournaments
      add constraint tournaments_divisions_valid_chk
      check (
        cardinality(divisions) > 0
        and divisions <@ array['recurvo','compuesto','barebow']::text[]
      );
  end if;
end $$;

create index if not exists idx_tournaments_categories_gin
  on public.tournaments using gin (categories);

create index if not exists idx_tournaments_divisions_gin
  on public.tournaments using gin (divisions);

-- elimination_brackets: explicit division
alter table public.elimination_brackets
  add column if not exists division text;

update public.elimination_brackets b
set division = s.division
from (
  select
    em.bracket_id,
    min(a.division) as division
  from public.elimination_matches em
  join public.archers a
    on a.id = coalesce(em.archer1_id, em.archer2_id)
  group by em.bracket_id
) s
where b.id = s.bracket_id
  and b.division is null;

update public.elimination_brackets
set division = 'recurvo'
where division is null;

alter table public.elimination_brackets
  alter column division set default 'recurvo',
  alter column division set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'elimination_brackets_division_valid_chk'
  ) then
    alter table public.elimination_brackets
      add constraint elimination_brackets_division_valid_chk
      check (division = any(array['recurvo','compuesto','barebow']::text[]));
  end if;
end $$;

create index if not exists idx_elimination_brackets_tournament_division
  on public.elimination_brackets (tournament_id, division);

create index if not exists idx_elimination_brackets_tournament_category_gender_division
  on public.elimination_brackets (tournament_id, category, gender, division);

commit;
