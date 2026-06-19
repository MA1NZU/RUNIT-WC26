-- Football predictions database setup for Supabase
-- Run this whole file in Supabase Dashboard -> SQL Editor -> New query.

create extension if not exists pgcrypto;

-- ---------- Types ----------
do $$
begin
  create type public.user_role as enum ('player', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.match_status as enum ('scheduled', 'finished', 'cancelled');
exception
  when duplicate_object then null;
end $$;

-- ---------- Tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(username) between 2 and 32),
  role public.user_role not null default 'player',
  created_at timestamptz not null default now()
);

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  home_team text not null check (char_length(home_team) between 1 and 80),
  away_team text not null check (char_length(away_team) between 1 and 80),
  kickoff_at timestamptz not null,
  status public.match_status not null default 'scheduled',
  home_score integer check (home_score is null or (home_score >= 0 and home_score <= 99)),
  away_score integer check (away_score is null or (away_score >= 0 and away_score <= 99)),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (
    (status = 'finished' and home_score is not null and away_score is not null)
    or
    (status <> 'finished' and home_score is null and away_score is null)
  )
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  home_score integer not null check (home_score >= 0 and home_score <= 99),
  away_score integer not null check (away_score >= 0 and away_score <= 99),
  points integer check (points is null or points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create index if not exists rounds_sort_idx on public.rounds(sort_order, name);
create index if not exists matches_round_kickoff_idx on public.matches(round_id, kickoff_at, sort_order);
create index if not exists matches_status_kickoff_idx on public.matches(status, kickoff_at);
create index if not exists predictions_user_match_idx on public.predictions(user_id, match_id);
create index if not exists predictions_match_idx on public.predictions(match_id);

-- ---------- Helper functions ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    nullif(split_part(new.email, '@', 1), ''),
    'Player'
  );
  v_username := left(regexp_replace(v_username, '\s+', ' ', 'g'), 32);

  if char_length(v_username) < 2 then
    v_username := 'Player';
  end if;

  insert into public.profiles (id, username)
  values (new.id, v_username)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.prediction_points(
  predicted_home integer,
  predicted_away integer,
  actual_home integer,
  actual_away integer
)
returns integer
language sql
immutable
as $$
  select case
    when actual_home is null or actual_away is null then null
    when predicted_home = actual_home and predicted_away = actual_away then 3
    when (
      (predicted_home > predicted_away and actual_home > actual_away)
      or (predicted_home = predicted_away and actual_home = actual_away)
      or (predicted_home < predicted_away and actual_home < actual_away)
    ) then 1
    else 0
  end;
$$;

create or replace function public.touch_prediction_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists predictions_touch_updated_at on public.predictions;
create trigger predictions_touch_updated_at
before update on public.predictions
for each row execute function public.touch_prediction_updated_at();

create or replace function public.recalculate_match_prediction_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'finished' and new.home_score is not null and new.away_score is not null then
    update public.predictions p
    set points = public.prediction_points(p.home_score, p.away_score, new.home_score, new.away_score)
    where p.match_id = new.id;
  else
    update public.predictions p
    set points = null
    where p.match_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists matches_recalculate_points on public.matches;
create trigger matches_recalculate_points
after update of status, home_score, away_score on public.matches
for each row execute function public.recalculate_match_prediction_points();

-- ---------- Low-read RPC functions used by the app ----------
-- One call loads the entire prediction page for the logged-in user.
create or replace function public.get_prediction_page()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Not logged in' using errcode = '28000';
  end if;

  return (
    select jsonb_build_object(
      'rounds',
      coalesce(jsonb_agg(round_object order by sort_order, name), '[]'::jsonb)
    )
    from (
      select
        r.sort_order,
        r.name,
        jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'sort_order', r.sort_order,
          'matches', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', m.id,
                'round_id', m.round_id,
                'home_team', m.home_team,
                'away_team', m.away_team,
                'kickoff_at', m.kickoff_at,
                'status', m.status,
                'home_score', m.home_score,
                'away_score', m.away_score,
                'sort_order', m.sort_order,
                'locked', (m.kickoff_at <= now() or m.status <> 'scheduled'),
                'prediction_home_score', p.home_score,
                'prediction_away_score', p.away_score,
                'prediction_points', p.points
              )
              order by m.kickoff_at, m.sort_order, m.home_team
            )
            from public.matches m
            left join public.predictions p
              on p.match_id = m.id
             and p.user_id = auth.uid()
            where m.round_id = r.id
              and m.status <> 'cancelled'
          ), '[]'::jsonb)
        ) as round_object
      from public.rounds r
      where exists (
        select 1
        from public.matches m
        where m.round_id = r.id
          and m.status <> 'cancelled'
      )
    ) rounds_with_matches
  );
end;
$$;

-- One call loads the public leaderboard. The Next.js page caches this for 60 seconds.
create or replace function public.get_leaderboard(p_limit integer default 50)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with totals as (
    select
      pr.id as user_id,
      pr.username,
      coalesce(sum(p.points), 0)::integer as points,
      coalesce(sum(case when p.points = 3 then 1 else 0 end), 0)::integer as exact_scores,
      count(p.id) filter (where p.points is not null)::integer as scored_predictions,
      count(p.id)::integer as predictions_made
    from public.profiles pr
    left join public.predictions p on p.user_id = pr.id
    group by pr.id, pr.username
  ), ranked as (
    select
      rank() over (
        order by points desc, exact_scores desc, scored_predictions asc, username asc
      )::integer as position,
      user_id,
      username,
      points,
      exact_scores,
      scored_predictions,
      predictions_made
    from totals
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', position,
        'user_id', user_id,
        'username', username,
        'points', points,
        'exact_scores', exact_scores,
        'scored_predictions', scored_predictions,
        'predictions_made', predictions_made
      )
      order by position, username
    ),
    '[]'::jsonb
  )
  from ranked
  where position <= least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- One call loads admin data. It throws an error if the user is not admin.
create or replace function public.get_admin_page()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'rounds', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'name', name,
            'sort_order', sort_order,
            'created_at', created_at
          )
          order by sort_order, name
        ),
        '[]'::jsonb
      )
      from public.rounds
    ),
    'matches', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'round_id', m.round_id,
            'round_name', r.name,
            'home_team', m.home_team,
            'away_team', m.away_team,
            'kickoff_at', m.kickoff_at,
            'status', m.status,
            'home_score', m.home_score,
            'away_score', m.away_score,
            'sort_order', m.sort_order
          )
          order by r.sort_order, m.kickoff_at, m.sort_order, m.home_team
        ),
        '[]'::jsonb
      )
      from public.matches m
      join public.rounds r on r.id = m.round_id
    )
  );
end;
$$;

-- One write call saves/updates the logged-in user's prediction.
create or replace function public.set_prediction(
  p_match_id uuid,
  p_home_score integer,
  p_away_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_match public.matches%rowtype;
begin
  if v_user is null then
    raise exception 'Not logged in' using errcode = '28000';
  end if;

  if p_home_score is null or p_away_score is null or p_home_score < 0 or p_away_score < 0 or p_home_score > 99 or p_away_score > 99 then
    raise exception 'Scores must be between 0 and 99' using errcode = '22003';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id;

  if not found then
    raise exception 'Match not found' using errcode = '02000';
  end if;

  if v_match.status <> 'scheduled' or v_match.kickoff_at <= now() then
    raise exception 'Predictions are closed for this match' using errcode = '22023';
  end if;

  insert into public.predictions (user_id, match_id, home_score, away_score, points)
  values (v_user, p_match_id, p_home_score, p_away_score, null)
  on conflict (user_id, match_id)
  do update set
    home_score = excluded.home_score,
    away_score = excluded.away_score,
    points = null;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.rounds enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;

-- Profiles: users can read themselves; admins can manage profiles.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all
on public.profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Rounds and matches: only admins access tables directly. Normal pages use RPCs.
drop policy if exists rounds_admin_all on public.rounds;
create policy rounds_admin_all
on public.rounds
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists matches_admin_all on public.matches;
create policy matches_admin_all
on public.matches
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Predictions: users can only read their own rows directly. Writes go through set_prediction().
drop policy if exists predictions_select_own on public.predictions;
create policy predictions_select_own
on public.predictions
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists predictions_admin_all on public.predictions;
create policy predictions_admin_all
on public.predictions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------- API grants ----------
grant usage on schema public to anon, authenticated;

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.rounds to authenticated;
grant select, insert, update, delete on public.matches to authenticated;
grant select on public.predictions to authenticated;

grant execute on function public.get_leaderboard(integer) to anon, authenticated;
grant execute on function public.get_prediction_page() to authenticated;
grant execute on function public.get_admin_page() to authenticated;
grant execute on function public.set_prediction(uuid, integer, integer) to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------- Make your first admin ----------
-- 1) Sign up in the website first.
-- 2) Then run this in the Supabase SQL Editor, replacing the email:
-- update public.profiles
-- set role = 'admin'
-- where id = (select id from auth.users where email = 'YOUR_EMAIL@example.com');

-- ---------- Optional sample data ----------
-- insert into public.rounds (name, sort_order) values ('Round 1', 1);
-- insert into public.matches (round_id, home_team, away_team, kickoff_at, sort_order)
-- select id, 'Lions FC', 'City XI', now() + interval '2 days', 1 from public.rounds where name = 'Round 1' limit 1;
