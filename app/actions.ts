'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function optionalInt(formData: FormData, key: string) {
  const value = text(formData, key);
  if (value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number)) return null;
  return number;
}

function requiredInt(formData: FormData, key: string) {
  const number = optionalInt(formData, key);
  if (number === null) throw new Error(`${key} must be a whole number`);
  return number;
}

function messageRedirect(path: string, type: 'success' | 'error', message: string): never {
  redirect(`${path}?${type}=${encodeURIComponent(message)}`);
}

export async function signIn(formData: FormData) {
  const email = text(formData, 'email');
  const password = text(formData, 'password');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) messageRedirect('/login', 'error', error.message);
  redirect('/predict');
}

export async function signUp(formData: FormData) {
  const email = text(formData, 'email');
  const password = text(formData, 'password');
  const username = text(formData, 'username') || email.split('@')[0] || 'Player';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username },
      emailRedirectTo: `${siteUrl}/auth/callback`
    }
  });

  if (error) messageRedirect('/login', 'error', error.message);
  messageRedirect('/login', 'success', 'Account created. If email confirmation is enabled, check your inbox.');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function savePrediction(formData: FormData) {
  const matchId = text(formData, 'match_id');
  const homeScore = requiredInt(formData, 'home_score');
  const awayScore = requiredInt(formData, 'away_score');

  if (homeScore < 0 || awayScore < 0 || homeScore > 99 || awayScore > 99) {
    messageRedirect('/predict', 'error', 'Scores must be between 0 and 99.');
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_prediction', {
    p_match_id: matchId,
    p_home_score: homeScore,
    p_away_score: awayScore
  });

  if (error) messageRedirect('/predict', 'error', error.message);
  revalidatePath('/predict');
  revalidatePath('/leaderboard');
  messageRedirect('/predict', 'success', 'Prediction saved.');
}

export async function createRound(formData: FormData) {
  const name = text(formData, 'name');
  const sortOrder = optionalInt(formData, 'sort_order') ?? 0;

  if (!name) messageRedirect('/admin', 'error', 'Round name is required.');

  const supabase = await createClient();
  const { error } = await supabase.from('rounds').insert({
    name,
    sort_order: sortOrder
  });

  if (error) messageRedirect('/admin', 'error', error.message);
  revalidatePath('/admin');
  revalidatePath('/predict');
  messageRedirect('/admin', 'success', 'Round added.');
}

export async function deleteRound(formData: FormData) {
  const roundId = text(formData, 'round_id');
  const supabase = await createClient();

  const { error } = await supabase.from('rounds').delete().eq('id', roundId);

  if (error) messageRedirect('/admin', 'error', error.message);
  revalidatePath('/admin');
  revalidatePath('/predict');
  messageRedirect('/admin', 'success', 'Round deleted.');
}

function parseKickoffIso(formData: FormData) {
  const isoFromBrowser = text(formData, 'kickoff_at_iso');
  const localValue = text(formData, 'kickoff_at_local');

  const raw = isoFromBrowser || localValue;
  const parsed = new Date(raw);

  if (!raw || Number.isNaN(parsed.getTime())) {
    throw new Error('Kickoff date/time is invalid.');
  }

  return parsed.toISOString();
}

export async function createMatch(formData: FormData) {
  const roundId = text(formData, 'round_id');
  const homeTeam = text(formData, 'home_team');
  const awayTeam = text(formData, 'away_team');
  const sortOrder = optionalInt(formData, 'sort_order') ?? 0;

  let kickoffAt: string;
  try {
    kickoffAt = parseKickoffIso(formData);
  } catch (error) {
    messageRedirect('/admin', 'error', error instanceof Error ? error.message : 'Invalid kickoff date/time.');
  }

  if (!roundId || !homeTeam || !awayTeam) {
    messageRedirect('/admin', 'error', 'Round, home team, and away team are required.');
  }

  const supabase = await createClient();
  const { error } = await supabase.from('matches').insert({
    round_id: roundId,
    home_team: homeTeam,
    away_team: awayTeam,
    kickoff_at: kickoffAt,
    sort_order: sortOrder
  });

  if (error) messageRedirect('/admin', 'error', error.message);
  revalidatePath('/admin');
  revalidatePath('/predict');
  messageRedirect('/admin', 'success', 'Match added.');
}

export async function deleteMatch(formData: FormData) {
  const matchId = text(formData, 'match_id');
  const supabase = await createClient();

  const { error } = await supabase.from('matches').delete().eq('id', matchId);

  if (error) messageRedirect('/admin', 'error', error.message);
  revalidatePath('/admin');
  revalidatePath('/predict');
  revalidatePath('/leaderboard');
  messageRedirect('/admin', 'success', 'Match deleted.');
}

export async function updateMatchResult(formData: FormData) {
  const matchId = text(formData, 'match_id');
  const status = text(formData, 'status') || 'scheduled';
  const homeScore = optionalInt(formData, 'home_score');
  const awayScore = optionalInt(formData, 'away_score');

  if (!['scheduled', 'finished', 'cancelled'].includes(status)) {
    messageRedirect('/admin', 'error', 'Invalid match status.');
  }

  if (status === 'finished' && (homeScore === null || awayScore === null)) {
    messageRedirect('/admin', 'error', 'Finished matches need both scores.');
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('matches')
    .update({
      status,
      home_score: status === 'finished' ? homeScore : null,
      away_score: status === 'finished' ? awayScore : null
    })
    .eq('id', matchId);

  if (error) messageRedirect('/admin', 'error', error.message);
  revalidatePath('/admin');
  revalidatePath('/predict');
  revalidatePath('/leaderboard');
  messageRedirect('/admin', 'success', 'Match result updated.');
}
