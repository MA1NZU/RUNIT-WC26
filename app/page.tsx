import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <section className="container hero">
        <div>
          <span className="kicker">Simple • Fast • Low Supabase reads</span>
          <h1>Predict football matches with your friends.</h1>
          <p className="lead">
            A clean prediction game with login, score predictions, automatic points, a leaderboard,
            and an admin panel for adding rounds and matches.
          </p>
          <div className="hero-actions">
            <Link href="/predict" className="button">Start predicting</Link>
            <Link href="/leaderboard" className="secondary-button">View leaderboard</Link>
          </div>
          <p className="footer-note">
            Scoring default: 3 points for exact score, 1 point for correct result, 0 otherwise.
          </p>
        </div>

        <aside className="hero-card" aria-label="Example predictions">
          <div className="score-tile">
            <div>
              <strong>Lions FC vs City XI</strong>
              <span className="meta">Round 1 • Tonight</span>
            </div>
            <span className="score-pill">2 - 1</span>
          </div>
          <div className="score-tile">
            <div>
              <strong>North United vs Reds</strong>
              <span className="meta">Prediction locked at kickoff</span>
            </div>
            <span className="score-pill">1 - 1</span>
          </div>
          <div className="score-tile">
            <div>
              <strong>Leaderboard</strong>
              <span className="meta">Cached for visitors to reduce reads</span>
            </div>
            <span className="score-pill">#1</span>
          </div>
        </aside>
      </section>
    </main>
  );
}
