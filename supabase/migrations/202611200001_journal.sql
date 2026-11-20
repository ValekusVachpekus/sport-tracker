begin;

create table public.programs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  program jsonb not null,
  revision integer not null default 0 check (revision >= 0),
  check (jsonb_typeof(program) = 'object' and program ?& array['days', 'exercises']
    and jsonb_typeof(program->'exercises') = 'array'
    and jsonb_array_length(program->'days') = 7)
);

create table public.workouts (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  workout_date date not null,
  created_at timestamptz not null default now(),
  revision integer not null default 0 check (revision >= 0),
  workout jsonb not null,
  primary key (user_id, id),
  check (jsonb_typeof(workout) = 'object'
    and workout ?& array['id', 'title', 'date', 'day', 'exercises']
    and workout->>'id' is not distinct from id::text
    and (workout->>'date')::date is not distinct from workout_date
    and jsonb_array_length(workout->'exercises') > 0)
);

create index workouts_history on public.workouts(user_id, workout_date desc, created_at desc, id desc);

alter table public.programs enable row level security;
alter table public.workouts enable row level security;
revoke all on public.programs, public.workouts from anon, authenticated;
grant select, insert, update on public.programs, public.workouts to authenticated;

create policy own_program on public.programs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_workouts on public.workouts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

commit;
