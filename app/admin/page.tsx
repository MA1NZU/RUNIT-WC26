import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createMatch, createRound, deleteMatch, deleteRound, signOut, updateMatchResult } from '@/app/actions';
import { formatKickoff } from '@/lib/site';
import type { AdminPageData } from '@/lib/types';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const success = first(params.success);
  const errorMessage = first(params.error);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data, error } = await supabase.rpc('get_admin_page');

  if (error) {
    return (
      <main className="container">
        <div className="page-head">
          <div>
            <span className="kicker">Admin</span>
            <h2 style={{ marginTop: 14 }}>Admin panel</h2>
          </div>
          <form action={signOut}>
            <button className="secondary-button" type="submit">Sign out</button>
          </form>
        </div>
        <p className="notice error">
          You are logged in, but you are not an admin yet. Promote yourself in Supabase using the SQL in README.md.
        </p>
        <p className="small">Supabase said: {error.message}</p>
      </main>
    );
  }

  const page = data as AdminPageData;

  return (
    <main className="container">
      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener('submit', function (event) {
              var form = event.target;
              if (!form || !form.querySelector) return;
              var localInput = form.querySelector('input[name="kickoff_at_local"]');
              var isoInput = form.querySelector('input[name="kickoff_at_iso"]');
              if (localInput && isoInput && localInput.value) {
                isoInput.value = new Date(localInput.value).toISOString();
              }
            });
          `
        }}
      />

      <div className="page-head">
        <div>
          <span className="kicker">Control room</span>
          <h2 style={{ marginTop: 14 }}>Admin panel</h2>
          <p>Add rounds, add matches, delete matches, and publish results.</p>
        </div>
        <form action={signOut}>
          <button className="secondary-button" type="submit">Sign out</button>
        </form>
      </div>

      {success ? <p className="notice success">{success}</p> : null}
      {errorMessage ? <p className="notice error">{errorMessage}</p> : null}

      <div className="admin-layout">
        <aside className="admin-stack">
          <section className="admin-card">
            <h3>Add round</h3>
            <p className="small">Examples: Group Stage, Round 1, Quarter-finals.</p>
            <form action={createRound} className="form-grid">
              <label>
                Round name
                <input name="name" placeholder="Round 1" required />
              </label>
              <label>
                Sort order
                <input name="sort_order" type="number" defaultValue="1" />
              </label>
              <button className="button" type="submit">Add round</button>
            </form>
          </section>

          <section className="admin-card">
            <h3>Add match</h3>
            <p className="small">The kickoff time is converted from your browser's local time to UTC before saving.</p>
            {page.rounds.length === 0 ? (
              <div className="empty">Add a round first.</div>
            ) : (
              <form action={createMatch} className="form-grid">
                <label>
                  Round
                  <select name="round_id" required>
                    {page.rounds.map((round) => (
                      <option key={round.id} value={round.id}>{round.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Home team
                  <input name="home_team" placeholder="Home FC" required />
                </label>
                <label>
                  Away team
                  <input name="away_team" placeholder="Away FC" required />
                </label>
                <label>
                  Kickoff
                  <input name="kickoff_at_local" type="datetime-local" required />
                </label>
                <input name="kickoff_at_iso" type="hidden" />
                <label>
                  Sort order
                  <input name="sort_order" type="number" defaultValue="1" />
                </label>
                <button className="button" type="submit">Add match</button>
              </form>
            )}
          </section>

          <section className="admin-card">
            <h3>Rounds</h3>
            <div className="form-grid">
              {page.rounds.length === 0 ? <p className="small">No rounds yet.</p> : null}
              {page.rounds.map((round) => (
                <div className="score-tile" key={round.id}>
                  <div>
                    <strong>{round.name}</strong>
                    <span className="meta">Sort: {round.sort_order}</span>
                  </div>
                  <form action={deleteRound}>
                    <input type="hidden" name="round_id" value={round.id} />
                    <button className="danger-button" type="submit">Delete</button>
                  </form>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <section className="admin-card">
          <h3>Matches</h3>
          <p className="small">Set status to finished and enter the score to automatically calculate prediction points.</p>

          <div className="form-grid">
            {page.matches.length === 0 ? <div className="empty">No matches yet.</div> : null}

            {page.matches.map((match) => (
              <article className="admin-match" key={match.id}>
                <div className="match-top">
                  <div>
                    <div className="teams">
                      <span>{match.home_team}</span>
                      <span className="vs">vs</span>
                      <span>{match.away_team}</span>
                    </div>
                    <div className="meta">{match.round_name} • {formatKickoff(match.kickoff_at)}</div>
                  </div>
                  <span className={`status ${match.status}`}>{match.status}</span>
                </div>

                <form action={updateMatchResult} className="inline-form">
                  <input type="hidden" name="match_id" value={match.id} />
                  <label>
                    Status
                    <select name="status" defaultValue={match.status}>
                      <option value="scheduled">Scheduled</option>
                      <option value="finished">Finished</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </label>
                  <label>
                    Home score
                    <input name="home_score" type="number" min="0" max="99" defaultValue={match.home_score ?? ''} />
                  </label>
                  <label>
                    Away score
                    <input name="away_score" type="number" min="0" max="99" defaultValue={match.away_score ?? ''} />
                  </label>
                  <button className="button" type="submit">Update</button>
                </form>

                <form action={deleteMatch}>
                  <input type="hidden" name="match_id" value={match.id} />
                  <button className="danger-button" type="submit">Delete match</button>
                </form>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
