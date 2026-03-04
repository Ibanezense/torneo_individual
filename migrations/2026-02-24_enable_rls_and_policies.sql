-- Enable RLS and apply policies compatible with:
-- - Admin panel (authenticated users)
-- - Public live views (anon read only on visible tournaments)
-- - Public scoring flows (anon writes limited to active qualification/elimination tournaments)

begin;

-- 1) Enable RLS on core tables
alter table public.tournaments enable row level security;
alter table public.targets enable row level security;
alter table public.archers enable row level security;
alter table public.assignments enable row level security;
alter table public.qualification_scores enable row level security;
alter table public.qualification_ends enable row level security;
alter table public.qualification_rounds enable row level security;
alter table public.elimination_brackets enable row level security;
alter table public.elimination_matches enable row level security;
alter table public.sets enable row level security;

-- 2) Clear previous app-specific policies (safe to re-run)
drop policy if exists auth_all_tournaments on public.tournaments;
drop policy if exists auth_all_targets on public.targets;
drop policy if exists auth_all_archers on public.archers;
drop policy if exists auth_all_assignments on public.assignments;
drop policy if exists auth_all_qualification_scores on public.qualification_scores;
drop policy if exists auth_all_qualification_ends on public.qualification_ends;
drop policy if exists auth_all_qualification_rounds on public.qualification_rounds;
drop policy if exists auth_all_elimination_brackets on public.elimination_brackets;
drop policy if exists auth_all_elimination_matches on public.elimination_matches;
drop policy if exists auth_all_sets on public.sets;

drop policy if exists anon_select_visible_tournaments on public.tournaments;
drop policy if exists anon_select_visible_targets on public.targets;
drop policy if exists anon_select_visible_archers on public.archers;
drop policy if exists anon_select_visible_assignments on public.assignments;
drop policy if exists anon_update_qualification_assignments on public.assignments;
drop policy if exists anon_select_visible_qualification_scores on public.qualification_scores;
drop policy if exists anon_write_qualification_scores on public.qualification_scores;
drop policy if exists anon_select_visible_qualification_ends on public.qualification_ends;
drop policy if exists anon_write_qualification_ends on public.qualification_ends;
drop policy if exists anon_select_visible_qualification_rounds on public.qualification_rounds;
drop policy if exists anon_select_visible_elimination_brackets on public.elimination_brackets;
drop policy if exists anon_select_visible_elimination_matches on public.elimination_matches;
drop policy if exists anon_update_active_elimination_matches on public.elimination_matches;
drop policy if exists anon_select_visible_sets on public.sets;
drop policy if exists anon_write_active_elimination_sets on public.sets;

-- 3) Authenticated users: full access (admin app)
create policy auth_all_tournaments
  on public.tournaments
  for all
  to authenticated
  using (true)
  with check (true);

create policy auth_all_targets
  on public.targets
  for all
  to authenticated
  using (true)
  with check (true);

create policy auth_all_archers
  on public.archers
  for all
  to authenticated
  using (true)
  with check (true);

create policy auth_all_assignments
  on public.assignments
  for all
  to authenticated
  using (true)
  with check (true);

create policy auth_all_qualification_scores
  on public.qualification_scores
  for all
  to authenticated
  using (true)
  with check (true);

create policy auth_all_qualification_ends
  on public.qualification_ends
  for all
  to authenticated
  using (true)
  with check (true);

create policy auth_all_qualification_rounds
  on public.qualification_rounds
  for all
  to authenticated
  using (true)
  with check (true);

create policy auth_all_elimination_brackets
  on public.elimination_brackets
  for all
  to authenticated
  using (true)
  with check (true);

create policy auth_all_elimination_matches
  on public.elimination_matches
  for all
  to authenticated
  using (true)
  with check (true);

create policy auth_all_sets
  on public.sets
  for all
  to authenticated
  using (true)
  with check (true);

-- 4) Anon/public: read only visible tournaments (qualification/elimination/completed)
create policy anon_select_visible_tournaments
  on public.tournaments
  for select
  to anon
  using (status in ('qualification', 'elimination', 'completed'));

create policy anon_select_visible_targets
  on public.targets
  for select
  to anon
  using (
    exists (
      select 1
      from public.tournaments t
      where t.id = targets.tournament_id
        and t.status in ('qualification', 'elimination', 'completed')
    )
  );

create policy anon_select_visible_archers
  on public.archers
  for select
  to anon
  using (
    exists (
      select 1
      from public.assignments a
      join public.tournaments t on t.id = a.tournament_id
      where a.archer_id = archers.id
        and t.status in ('qualification', 'elimination', 'completed')
    )
  );

create policy anon_select_visible_assignments
  on public.assignments
  for select
  to anon
  using (
    exists (
      select 1
      from public.tournaments t
      where t.id = assignments.tournament_id
        and t.status in ('qualification', 'elimination', 'completed')
    )
  );

-- 5) Anon scoring in qualification: limited writes
create policy anon_update_qualification_assignments
  on public.assignments
  for update
  to anon
  using (
    exists (
      select 1
      from public.tournaments t
      where t.id = assignments.tournament_id
        and t.status = 'qualification'
    )
  )
  with check (
    exists (
      select 1
      from public.tournaments t
      where t.id = assignments.tournament_id
        and t.status = 'qualification'
    )
  );

create policy anon_select_visible_qualification_scores
  on public.qualification_scores
  for select
  to anon
  using (
    exists (
      select 1
      from public.assignments a
      join public.tournaments t on t.id = a.tournament_id
      where a.id = qualification_scores.assignment_id
        and t.status in ('qualification', 'elimination', 'completed')
    )
  );

create policy anon_write_qualification_scores
  on public.qualification_scores
  for all
  to anon
  using (
    exists (
      select 1
      from public.assignments a
      join public.tournaments t on t.id = a.tournament_id
      where a.id = qualification_scores.assignment_id
        and t.status = 'qualification'
    )
  )
  with check (
    exists (
      select 1
      from public.assignments a
      join public.tournaments t on t.id = a.tournament_id
      where a.id = qualification_scores.assignment_id
        and t.status = 'qualification'
    )
  );

create policy anon_select_visible_qualification_ends
  on public.qualification_ends
  for select
  to anon
  using (
    exists (
      select 1
      from public.assignments a
      join public.tournaments t on t.id = a.tournament_id
      where a.id = qualification_ends.assignment_id
        and t.status in ('qualification', 'elimination', 'completed')
    )
  );

create policy anon_write_qualification_ends
  on public.qualification_ends
  for all
  to anon
  using (
    exists (
      select 1
      from public.assignments a
      join public.tournaments t on t.id = a.tournament_id
      where a.id = qualification_ends.assignment_id
        and t.status = 'qualification'
    )
  )
  with check (
    exists (
      select 1
      from public.assignments a
      join public.tournaments t on t.id = a.tournament_id
      where a.id = qualification_ends.assignment_id
        and t.status = 'qualification'
    )
  );

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

-- 6) Anon live + elimination scoring: read visible, write only while elimination is active
create policy anon_select_visible_elimination_brackets
  on public.elimination_brackets
  for select
  to anon
  using (
    exists (
      select 1
      from public.tournaments t
      where t.id = elimination_brackets.tournament_id
        and t.status in ('elimination', 'completed')
    )
  );

create policy anon_select_visible_elimination_matches
  on public.elimination_matches
  for select
  to anon
  using (
    exists (
      select 1
      from public.elimination_brackets b
      join public.tournaments t on t.id = b.tournament_id
      where b.id = elimination_matches.bracket_id
        and t.status in ('elimination', 'completed')
    )
  );

create policy anon_update_active_elimination_matches
  on public.elimination_matches
  for update
  to anon
  using (
    exists (
      select 1
      from public.elimination_brackets b
      join public.tournaments t on t.id = b.tournament_id
      where b.id = elimination_matches.bracket_id
        and t.status = 'elimination'
    )
  )
  with check (
    exists (
      select 1
      from public.elimination_brackets b
      join public.tournaments t on t.id = b.tournament_id
      where b.id = elimination_matches.bracket_id
        and t.status = 'elimination'
    )
  );

create policy anon_select_visible_sets
  on public.sets
  for select
  to anon
  using (
    exists (
      select 1
      from public.elimination_matches m
      join public.elimination_brackets b on b.id = m.bracket_id
      join public.tournaments t on t.id = b.tournament_id
      where m.id = sets.match_id
        and t.status in ('elimination', 'completed')
    )
  );

create policy anon_write_active_elimination_sets
  on public.sets
  for all
  to anon
  using (
    exists (
      select 1
      from public.elimination_matches m
      join public.elimination_brackets b on b.id = m.bracket_id
      join public.tournaments t on t.id = b.tournament_id
      where m.id = sets.match_id
        and t.status = 'elimination'
    )
  )
  with check (
    exists (
      select 1
      from public.elimination_matches m
      join public.elimination_brackets b on b.id = m.bracket_id
      join public.tournaments t on t.id = b.tournament_id
      where m.id = sets.match_id
        and t.status = 'elimination'
    )
  );

commit;
