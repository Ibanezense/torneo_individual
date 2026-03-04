-- Prevent anon/public scoring flows from modifying finished qualification and elimination records.
-- Safe to run more than once.

begin;

drop policy if exists anon_update_qualification_assignments on public.assignments;
drop policy if exists anon_write_qualification_scores on public.qualification_scores;
drop policy if exists anon_write_qualification_ends on public.qualification_ends;
drop policy if exists anon_update_active_elimination_matches on public.elimination_matches;
drop policy if exists anon_write_active_elimination_sets on public.sets;

create policy anon_update_qualification_assignments
  on public.assignments
  for update
  to anon
  using (
    assignments.is_finished = false
    and exists (
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
        and a.is_finished = false
        and t.status = 'qualification'
    )
  )
  with check (
    exists (
      select 1
      from public.assignments a
      join public.tournaments t on t.id = a.tournament_id
      where a.id = qualification_scores.assignment_id
        and a.is_finished = false
        and t.status = 'qualification'
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
        and a.is_finished = false
        and t.status = 'qualification'
    )
  )
  with check (
    exists (
      select 1
      from public.assignments a
      join public.tournaments t on t.id = a.tournament_id
      where a.id = qualification_ends.assignment_id
        and a.is_finished = false
        and t.status = 'qualification'
    )
  );

create policy anon_update_active_elimination_matches
  on public.elimination_matches
  for update
  to anon
  using (
    elimination_matches.status <> 'completed'
    and exists (
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
        and m.status <> 'completed'
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
        and m.status <> 'completed'
        and t.status = 'elimination'
    )
  );

commit;
