-- Fix admin_replace_tournament_brackets inserts by using table-typed JSON recordsets.
-- This avoids enum/type mismatches when payload values arrive as text.

begin;

create or replace function public.admin_replace_tournament_brackets(
  p_tournament_id uuid,
  p_brackets jsonb,
  p_targets jsonb,
  p_matches jsonb,
  p_stale_target_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_existing_bracket_ids uuid[];
begin
  if jsonb_typeof(coalesce(p_brackets, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_targets, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_matches, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_stale_target_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'El payload de brackets es invalido';
  end if;

  select array_agg(id)
  into v_existing_bracket_ids
  from public.elimination_brackets
  where tournament_id = p_tournament_id;

  if coalesce(array_length(v_existing_bracket_ids, 1), 0) > 0 then
    delete from public.elimination_matches
    where bracket_id = any(v_existing_bracket_ids);

    delete from public.elimination_brackets
    where id = any(v_existing_bracket_ids);
  end if;

  if jsonb_array_length(coalesce(p_stale_target_ids, '[]'::jsonb)) > 0 then
    delete from public.targets target_row
    where target_row.id in (
      select value::uuid
      from jsonb_array_elements_text(p_stale_target_ids)
    )
      and not exists (
        select 1
        from public.assignments assignment_row
        where assignment_row.target_id = target_row.id
      );
  end if;

  if jsonb_array_length(coalesce(p_targets, '[]'::jsonb)) > 0 then
    insert into public.targets (
      id,
      tournament_id,
      target_number,
      distance,
      current_status
    )
    select
      row_data.id,
      p_tournament_id,
      row_data.target_number,
      row_data.distance,
      coalesce(row_data.current_status, 'inactive')
    from jsonb_populate_recordset(null::public.targets, p_targets) as row_data;
  end if;

  if jsonb_array_length(coalesce(p_brackets, '[]'::jsonb)) > 0 then
    insert into public.elimination_brackets (
      id,
      tournament_id,
      category,
      gender,
      division,
      bracket_size,
      current_round,
      is_completed
    )
    select
      row_data.id,
      p_tournament_id,
      row_data.category,
      row_data.gender,
      row_data.division,
      row_data.bracket_size,
      row_data.current_round,
      row_data.is_completed
    from jsonb_populate_recordset(null::public.elimination_brackets, p_brackets) as row_data;
  end if;

  if jsonb_array_length(coalesce(p_matches, '[]'::jsonb)) > 0 then
    insert into public.elimination_matches (
      id,
      bracket_id,
      round_number,
      match_position,
      archer1_id,
      archer2_id,
      archer1_seed,
      archer2_seed,
      archer1_set_points,
      archer2_set_points,
      status,
      winner_id,
      target_id
    )
    select
      row_data.id,
      row_data.bracket_id,
      row_data.round_number,
      row_data.match_position,
      row_data.archer1_id,
      row_data.archer2_id,
      row_data.archer1_seed,
      row_data.archer2_seed,
      row_data.archer1_set_points,
      row_data.archer2_set_points,
      row_data.status,
      row_data.winner_id,
      row_data.target_id
    from jsonb_populate_recordset(null::public.elimination_matches, p_matches) as row_data;
  end if;

  return jsonb_build_object(
    'success', true,
    'brackets', jsonb_array_length(coalesce(p_brackets, '[]'::jsonb)),
    'targets', jsonb_array_length(coalesce(p_targets, '[]'::jsonb)),
    'matches', jsonb_array_length(coalesce(p_matches, '[]'::jsonb))
  );
end;
$$;

commit;
