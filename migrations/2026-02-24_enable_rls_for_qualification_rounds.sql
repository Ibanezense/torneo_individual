-- Enable RLS + policies for qualification_rounds.
-- Safe to run more than once.

begin;

alter table if exists public.qualification_rounds enable row level security;

drop policy if exists auth_all_qualification_rounds on public.qualification_rounds;
drop policy if exists anon_select_visible_qualification_rounds on public.qualification_rounds;

create policy auth_all_qualification_rounds
  on public.qualification_rounds
  for all
  to authenticated
  using (true)
  with check (true);

create policy anon_select_visible_qualification_rounds
  on public.qualification_rounds
  for select
  to anon
  using (
    exists (
      select 1
      from public.assignments a
      join public.tournaments t on t.id = a.tournament_id
      where a.id = qualification_rounds.assignment_id
        and t.status in ('qualification', 'elimination', 'completed')
    )
  );

commit;
