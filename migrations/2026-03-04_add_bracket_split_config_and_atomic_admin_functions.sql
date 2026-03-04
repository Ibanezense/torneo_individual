-- Add bracket split config to tournaments and atomic admin helper functions.
-- Safe to run more than once.

begin;

alter table public.tournaments
  add column if not exists split_brackets_by_gender boolean not null default false,
  add column if not exists split_brackets_by_division boolean not null default false;

create or replace function public.admin_delete_tournament(
  p_tournament_id uuid
)
returns boolean
language plpgsql
as $$
declare
  v_bracket_ids uuid[];
  v_match_ids uuid[];
  v_assignment_ids uuid[];
begin
  select array_agg(id)
  into v_bracket_ids
  from public.elimination_brackets
  where tournament_id = p_tournament_id;

  if coalesce(array_length(v_bracket_ids, 1), 0) > 0 then
    select array_agg(id)
    into v_match_ids
    from public.elimination_matches
    where bracket_id = any(v_bracket_ids);

    if coalesce(array_length(v_match_ids, 1), 0) > 0 then
      delete from public.sets
      where match_id = any(v_match_ids);
    end if;

    delete from public.elimination_matches
    where bracket_id = any(v_bracket_ids);

    delete from public.elimination_brackets
    where id = any(v_bracket_ids);
  end if;

  select array_agg(id)
  into v_assignment_ids
  from public.assignments
  where tournament_id = p_tournament_id;

  if coalesce(array_length(v_assignment_ids, 1), 0) > 0 then
    delete from public.qualification_rounds
    where assignment_id = any(v_assignment_ids);

    delete from public.qualification_scores
    where assignment_id = any(v_assignment_ids);

    delete from public.qualification_ends
    where assignment_id = any(v_assignment_ids);
  end if;

  delete from public.assignments
  where tournament_id = p_tournament_id;

  delete from public.targets
  where tournament_id = p_tournament_id;

  delete from public.tournaments
  where id = p_tournament_id;

  return true;
end;
$$;

create or replace function public.admin_replace_tournament_targets(
  p_tournament_id uuid,
  p_targets jsonb
)
returns jsonb
language plpgsql
as $$
begin
  if jsonb_typeof(coalesce(p_targets, '[]'::jsonb)) <> 'array' then
    raise exception 'La configuracion de pacas debe ser un arreglo JSON';
  end if;

  delete from public.targets
  where tournament_id = p_tournament_id;

  if jsonb_array_length(coalesce(p_targets, '[]'::jsonb)) > 0 then
    insert into public.targets (
      tournament_id,
      target_number,
      distance
    )
    select
      p_tournament_id,
      row_data.target_number,
      row_data.distance
    from jsonb_to_recordset(p_targets) as row_data(
      target_number integer,
      distance integer
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'targets', jsonb_array_length(coalesce(p_targets, '[]'::jsonb))
  );
end;
$$;

create or replace function public.admin_replace_tournament_assignments(
  p_tournament_id uuid,
  p_assignments jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_existing_signature text := '';
  v_desired_signature text := '';
  v_has_scoring_data boolean := false;
begin
  if jsonb_typeof(coalesce(p_assignments, '[]'::jsonb)) <> 'array' then
    raise exception 'Las asignaciones deben enviarse como un arreglo JSON';
  end if;

  create temporary table tmp_desired_assignments (
    archer_id uuid not null,
    target_id uuid not null,
    position text not null,
    turn text not null,
    access_code text not null
  ) on commit drop;

  insert into tmp_desired_assignments (
    archer_id,
    target_id,
    position,
    turn,
    access_code
  )
  select
    row_data.archer_id,
    row_data.target_id,
    row_data.position,
    row_data.turn,
    row_data.access_code
  from jsonb_to_recordset(coalesce(p_assignments, '[]'::jsonb)) as row_data(
    archer_id uuid,
    target_id uuid,
    position text,
    turn text,
    access_code text
  );

  if exists (
    select 1
    from tmp_desired_assignments
    where position not in ('A', 'B', 'C', 'D')
      or turn not in ('AB', 'CD')
      or access_code = ''
  ) then
    raise exception 'Hay asignaciones con datos invalidos';
  end if;

  if (
    select count(*) from tmp_desired_assignments
  ) <> (
    select count(distinct archer_id) from tmp_desired_assignments
  ) then
    raise exception 'Asignacion duplicada para un mismo arquero';
  end if;

  if (
    select count(*) from tmp_desired_assignments
  ) <> (
    select count(distinct target_id::text || ':' || position) from tmp_desired_assignments
  ) then
    raise exception 'Conflicto de posicion en una paca';
  end if;

  create temporary table tmp_existing_assignments on commit drop as
  select
    id,
    archer_id,
    target_id,
    position,
    turn,
    access_token,
    current_end,
    is_finished
  from public.assignments
  where tournament_id = p_tournament_id;

  select coalesce(
    string_agg(archer_id::text || '|' || target_id::text || '|' || position || '|' || turn, ';' order by archer_id::text || '|' || target_id::text || '|' || position || '|' || turn),
    ''
  )
  into v_existing_signature
  from tmp_existing_assignments;

  select coalesce(
    string_agg(archer_id::text || '|' || target_id::text || '|' || position || '|' || turn, ';' order by archer_id::text || '|' || target_id::text || '|' || position || '|' || turn),
    ''
  )
  into v_desired_signature
  from tmp_desired_assignments;

  if v_existing_signature = v_desired_signature then
    return jsonb_build_object('success', true, 'changed', false);
  end if;

  if exists (
    select 1
    from tmp_existing_assignments e
    where exists (
      select 1 from public.qualification_scores qs where qs.assignment_id = e.id
    ) or exists (
      select 1 from public.qualification_ends qe where qe.assignment_id = e.id
    ) or exists (
      select 1 from public.qualification_rounds qr where qr.assignment_id = e.id
    )
  ) then
    v_has_scoring_data := true;
  end if;

  if v_has_scoring_data then
    raise exception 'No se pueden modificar asignaciones despues de registrar puntajes.';
  end if;

  delete from public.assignments
  where tournament_id = p_tournament_id;

  insert into public.assignments (
    id,
    tournament_id,
    archer_id,
    target_id,
    position,
    turn,
    access_token,
    access_code,
    current_end,
    is_finished
  )
  select
    coalesce(existing_row.id, gen_random_uuid()),
    p_tournament_id,
    desired.archer_id,
    desired.target_id,
    desired.position,
    desired.turn,
    coalesce(existing_row.access_token, encode(gen_random_bytes(16), 'hex')),
    desired.access_code,
    coalesce(existing_row.current_end, 0),
    coalesce(existing_row.is_finished, false)
  from tmp_desired_assignments desired
  left join tmp_existing_assignments existing_row
    on existing_row.archer_id = desired.archer_id;

  return jsonb_build_object(
    'success', true,
    'changed', true,
    'assignments', (select count(*) from tmp_desired_assignments)
  );
end;
$$;

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
    from jsonb_to_recordset(p_targets) as row_data(
      id uuid,
      target_number integer,
      distance integer,
      current_status text
    );
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
    from jsonb_to_recordset(p_brackets) as row_data(
      id uuid,
      category text,
      gender text,
      division text,
      bracket_size integer,
      current_round integer,
      is_completed boolean
    );
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
    from jsonb_to_recordset(p_matches) as row_data(
      id uuid,
      bracket_id uuid,
      round_number integer,
      match_position integer,
      archer1_id uuid,
      archer2_id uuid,
      archer1_seed integer,
      archer2_seed integer,
      archer1_set_points integer,
      archer2_set_points integer,
      status text,
      winner_id uuid,
      target_id uuid
    );
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
