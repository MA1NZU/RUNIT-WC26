import { redirect } from 'next/navigation';
import { savePrediction, signOut } from '@/app/actions';
import { createClient } from '@/lib/supabase/server';
import { formatKickoff } from '@/lib/site';
import type { PredictionPageData, PredictionMatch } from '@/lib/types';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resultText(match: PredictionMatch) {
  if (match.status !== 'finished' || match.home_score === null || match.away_score === null) {
    return null;
  }
  return `${match.home_score} - ${match.away_score}`;
}

export default async function PredictPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const success = first(params.success);
  const errorMessage = first(params.error);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data, error } = await supabase.rpc('get_prediction_page');

  if (error) {
    return (
      <main className="container">
        <p className="notice error">Could not load predictions: {error.message}</p>
      </main>
    );
  }

  const page = data as PredictionPageData;

  return (
    <main className="container">
      <div className="page-head">
        <div>
          <span className="kicker">Make your calls</span>
          <h2 style={{ marginTop: 14 }}>Predictions</h2>
          <p>Enter the final score before kickoff. Predictions lock automatically when the match starts.</p>
        </div>
        <form action={signOut}>
          <button className="secondary-button" type="submit">Sign out</button>
        </form>
      </div>

      {success ? <p className="notice success">{success}</p> : null}
      {errorMessage ? <p className="notice error">{errorMessage}</p> : null}

      {!page.rounds?.length ? (
        <div className="empty">No matches yet. Ask the admin to add rounds and matches.</div>
      ) : (
        page.rounds.map((round) => (
          <section className="round-section" key={round.id}>
            <div className="round-title">
              <h3>{round.name}</h3>
              <span className="meta">{round.matches.length} match{round.matches.length === 1 ? '' : 'es'}</span>
            </div>

            <div className="match-list">
              {round.matches.map((match) => {
                const finalResult = resultText(match);
                const hasPrediction = match.prediction_home_score !== null && match.prediction_away_score !== null;

                return (
                  <article className="match-card" key={match.id}>
                    <div className="match-top">
                      <div>
                        <div className="teams">
                          <span>{match.home_team}</span>
                          <span className="vs">vs</span>
                          <span>{match.away_team}</span>
                        </div>
                        <div className="meta">Kickoff: {formatKickoff(match.kickoff_at)}</div>
                      </div>
                      <span className={`status ${match.status}`}>{match.status}</span>
                    </div>

                    {finalResult ? <p className="small">Final result: <strong>{finalResult}</strong></p> : null}

                    {!match.locked ? (
                      <form action={savePrediction} className="prediction-form">
                        <input type="hidden" name="match_id" value={match.id} />
                        <label>
                          {match.home_team}
                          <input
                            name="home_score"
                            type="number"
                            min="0"
                            max="99"
                            defaultValue={match.prediction_home_score ?? ''}
                            required
                          />
                        </label>
                        <label>
                          {match.away_team}
                          <input
                            name="away_score"
                            type="number"
                            min="0"
                            max="99"
                            defaultValue={match.prediction_away_score ?? ''}
                            required
                          />
                        </label>
                        <button className="button" type="submit">
                          {hasPrediction ? 'Update' : 'Save'}
                        </button>
                      </form>
                    ) : (
                      <div className="locked-box">
                        <span className="status">Locked</span>
                        <span className="small">
                          Your prediction:{' '}
                          <strong>
                            {hasPrediction
                              ? `${match.prediction_home_score} - ${match.prediction_away_score}`
                              : 'No prediction'}
                          </strong>
                        </span>
                        {match.prediction_points !== null ? (
                          <span className="points">{match.prediction_points} pts</span>
                        ) : null}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
