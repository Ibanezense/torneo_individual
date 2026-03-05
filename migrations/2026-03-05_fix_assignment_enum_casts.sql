-- Fix enum casts in admin_replace_tournament_assignments
-- so position/turn values parsed from JSON are inserted as enums.

begin;

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
    access_code,
    current_end,
    is_finished
  from public.assignments
  where tournament_id = p_tournament_id;

  select coalesce(
    string_agg(
      archer_id::text || '|' || target_id::text || '|' || position || '|' || turn || '|' || access_code,
      ';' order by archer_id::text || '|' || target_id::text || '|' || position || '|' || turn || '|' || access_code
    ),
    ''
  )
  into v_existing_signature
  from tmp_existing_assignments;

  select coalesce(
    string_agg(
      archer_id::text || '|' || target_id::text || '|' || position || '|' || turn || '|' || access_code,
      ';' order by archer_id::text || '|' || target_id::text || '|' || position || '|' || turn || '|' || access_code
    ),
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
    desired.position::target_position,
    desired.turn::shooting_turn,
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

commit;
