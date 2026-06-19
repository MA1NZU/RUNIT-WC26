-- ============================================
-- FOOTBALL PREDICTIONS - COMPLETE SCHEMA
-- Run this in Supabase → SQL Editor → New Query
-- ============================================


-- ============================================
-- STEP 1: CREATE TABLES
-- ============================================

-- User profiles (extends Supabase built-in auth)
create table if not exists profiles (
  id          uuid references auth.users on delete cascade primary key,
  username    text unique not null,
  total_points integer default 0,
  created_at  timestamp with time zone default now()
);

-- Rounds (e.g. "Matchday 1", "Semi Finals")
create table if not exists rounds (
  id         serial primary key,
  name       text not null,
  is_active  boolean default false,
  created_at timestamp with time zone default now()
);

-- Matches (belong to a round)
create table if not exists matches (
  id         serial primary key,
  round_id   integer references rounds(id) on delete cascade,
  home_team  text not null,
  away_team  text not null,
  match_date timestamp with time zone default null,
  home_score integer default null,
  away_score integer default null,
  is_finished boolean default false,
  created_at timestamp with time zone default now()
);

-- Predictions (one per user per match)
create table if not exists predictions (
  id             serial primary key,
  user_id        uuid references profiles(id) on delete cascade,
  match_id       integer references matches(id) on delete cascade,
  predicted_home integer not null,
  predicted_away integer not null,
  points_earned  integer default 0,
  created_at     timestamp with time zone default now(),
  unique(user_id, match_id)  -- prevents duplicate predictions
);


-- ============================================
-- STEP 2: AUTO-CREATE PROFILE ON SIGNUP
-- Triggered when someone registers via Supabase Auth
-- ============================================

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, username)
  values (
    new.id,
    new.raw_user_meta_data->>'username'
  );
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger first if it exists (safe to rerun)
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();


-- ============================================
-- STEP 3: ENABLE ROW LEVEL SECURITY (RLS)
-- Protects your data from unauthorized access
-- ============================================

alter table profiles    enable row level security;
alter table rounds      enable row level security;
alter table matches     enable row level security;
alter table predictions enable row level security;


-- ============================================
-- STEP 4: RLS POLICIES
-- ============================================

-- ---- PROFILES ----

-- Anyone logged in can read all profiles (needed for leaderboard)
create policy "profiles: anyone can read"
  on profiles for select
  using (true);

-- Users can only update their own profile
create policy "profiles: own update only"
  on profiles for update
  using (auth.uid() = id);


-- ---- ROUNDS ----

-- Anyone logged in can read rounds
create policy "rounds: anyone can read"
  on rounds for select
  using (true);


-- ---- MATCHES ----

-- Anyone logged in can read matches
create policy "matches: anyone can read"
  on matches for select
  using (true);


-- ---- PREDICTIONS ----

-- Anyone logged in can read all predictions (leaderboard/results)
create policy "predictions: anyone can read"
  on predictions for select
  using (true);

-- Users can only insert their own predictions
create policy "predictions: insert own only"
  on predictions for insert
  with check (auth.uid() = user_id);

-- Users can only update their own predictions
create policy "predictions: update own only"
  on predictions for update
  using (auth.uid() = user_id);


-- ============================================
-- STEP 5: ADMIN POLICIES
-- Run this AFTER creating your admin account!
-- Replace the UUID below with your actual user ID
-- Find it in: Supabase → Authentication → Users
-- ============================================

-- Uncomment and run these after you get your UUID:

/*

-- Rounds: admin full access
create policy "rounds: admin full access"
  on rounds for all
  using (auth.uid() = 'PASTE-YOUR-ADMIN-UUID-HERE');

-- Matches: admin full access
create policy "matches: admin full access"
  on matches for all
  using (auth.uid() = 'PASTE-YOUR-ADMIN-UUID-HERE');

-- Profiles: admin can update all (for point corrections)
create policy "profiles: admin full access"
  on profiles for all
  using (auth.uid() = 'PASTE-YOUR-ADMIN-UUID-HERE');

-- Predictions: admin can update all (for scoring)
create policy "predictions: admin full access"
  on predictions for all
  using (auth.uid() = 'PASTE-YOUR-ADMIN-UUID-HERE');

*/


-- ============================================
-- STEP 6: USEFUL INDEXES (speeds up queries)
-- ============================================

create index if not exists idx_matches_round_id
  on matches(round_id);

create index if not exists idx_predictions_user_id
  on predictions(user_id);

create index if not exists idx_predictions_match_id
  on predictions(match_id);

create index if not exists idx_rounds_is_active
  on rounds(is_active);

create index if not exists idx_profiles_total_points
  on profiles(total_points desc);


-- ============================================
-- DONE! Your database is ready.
-- ============================================
