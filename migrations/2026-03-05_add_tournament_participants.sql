-- Add explicit tournament participant selection before target assignments.
-- Selected participants are used as the source list for assignment workflows.

begin;

create table if not exists public.tournament_participants (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  archer_id uuid not null references public.archers(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid null default auth.uid() references auth.users(id),
  primary key (tournament_id, archer_id)
);

create index if not exists idx_tournament_participants_archer_id
  on public.tournament_participants(archer_id);

-- Backfill current assignments so existing tournaments keep their participant list.
insert into public.tournament_participants (tournament_id, archer_id)
select distinct a.tournament_id, a.archer_id
from public.assignments a
on conflict (tournament_id, archer_id) do nothing;

alter table public.tournament_participants enable row level security;

drop policy if exists auth_all_tournament_participants on public.tournament_participants;
create policy auth_all_tournament_participants
  on public.tournament_participants
  for all
  to authenticated
  using (true)
  with check (true);

commit;
