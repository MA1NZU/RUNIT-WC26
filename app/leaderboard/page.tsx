import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import type { LeaderboardRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

const getCachedLeaderboard = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    return supabase.rpc('get_leaderboard', { p_limit: 100 });
  },
  ['leaderboard'],
  { revalidate: 60 }
);

export default async function LeaderboardPage() {
  const { data, error } = await getCachedLeaderboard();
  const rows = (data ?? []) as LeaderboardRow[];

  return (
    <main className="container">
      <div className="page-head">
        <div>
          <span className="kicker">The table</span>
          <h2 style={{ marginTop: 14 }}>Leaderboard</h2>
          <p>This data is cached for 60 seconds on Vercel to avoid unnecessary Supabase reads.</p>
        </div>
        <Link href="/predict" className="button">Make predictions</Link>
      </div>

      {error ? <p className="notice error">Could not load leaderboard: {error.message}</p> : null}

      {!error && rows.length === 0 ? (
        <div className="empty">No players yet. Create an account and make your first prediction.</div>
      ) : null}

      {rows.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Points</th>
                <th>Exact scores</th>
                <th>Scored predictions</th>
                <th>Total predictions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.user_id}>
                  <td><strong>#{row.rank}</strong></td>
                  <td>{row.username}</td>
                  <td><strong>{row.points}</strong></td>
                  <td>{row.exact_scores}</td>
                  <td>{row.scored_predictions}</td>
                  <td>{row.predictions_made}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}
