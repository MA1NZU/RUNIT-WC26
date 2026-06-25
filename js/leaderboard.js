// ============================================
// LEADERBOARD.JS
// ============================================

const _lbDb = window.supabase.createClient(
  'https://bpmmimvlwuokipawabrk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwbW1pbXZsd3Vva2lwYXdhYnJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjE5NTMsImV4cCI6MjA5NzQzNzk1M30.U9S3vUNhyuqqirMNdamRBqdh67JbHNatBkQvdF3qu3k'
);

let currentUserId = null;
let roundsData    = [];

// ============================================
// INIT
// ============================================
async function init() {
  const { data: { session } } = await _lbDb.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }

  currentUserId = session.user.id;

  if (typeof ADMIN_IDS !== 'undefined' && ADMIN_IDS.includes(currentUserId)) {
    const adminBtn = document.getElementById('admin-nav-btn');
    if (adminBtn) adminBtn.style.display = 'inline-flex';
  }

  const [profilesRes, roundsRes] = await Promise.all([
    _lbDb
      .from('profiles')
      .select('id, username, total_points')
      .order('total_points', { ascending: false })
      .limit(100),
    _lbDb
      .from('rounds')
      .select('id, name, matches(id, home_team, away_team, match_date, home_score, away_score, is_finished)')
      .eq('is_active', true)
      .order('id')
  ]);

  roundsData = roundsRes.data || [];

  const profiles = profilesRes.data || [];

  if (profiles.length === 0) {
    document.getElementById('leaderboard-container').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏆</div>
        <p>No players yet!</p>
      </div>`;
    return;
  }

  renderLeaderboard(profiles);
}

// ============================================
// RENDER LEADERBOARD
// ============================================
function renderLeaderboard(profiles) {
  let html = `
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Player</th>
          <th>Points</th>
        </tr>
      </thead>
      <tbody>`;

  profiles.forEach((profile, index) => {
    const rank      = index + 1;
    const isMe      = profile.id === currentUserId;
    const rankClass = rank === 1 ? 'rank-1'
                    : rank === 2 ? 'rank-2'
                    : rank === 3 ? 'rank-3'
                    : 'rank-other';
    const rankIcon  = rank === 1 ? '🥇'
                    : rank === 2 ? '🥈'
                    : rank === 3 ? '🥉'
                    : rank;

    html += `
      <tr class="${isMe ? 'my-row' : ''}">
        <td><span class="rank-badge ${rankClass}">${rankIcon}</span></td>
        <td>
          <span class="player-name-link"
                onclick="openPlayerModal('${profile.id}', '${profile.username.replace(/'/g, "\\'")}')"
                style="cursor:pointer; font-weight:600;
                       border-bottom:1px dashed var(--text-muted);
                       transition:color 0.2s;"
                onmouseover="this.style.color='var(--green)'"
                onmouseout="this.style.color=''">
            ${profile.username}
          </span>
          ${isMe
            ? '<span class="badge badge-green" style="margin-left:8px">You</span>'
            : ''}
        </td>
        <td><span class="points-chip">${profile.total_points} pts</span></td>
      </tr>`;
  });

  html += '</tbody></table>';
  document.getElementById('leaderboard-container').innerHTML = html;
}

// ============================================
// OPEN PLAYER MODAL
// ============================================
async function openPlayerModal(userId, username) {
  showModal(username, `
    <div class="loading" style="padding:40px 20px">
      <div class="spinner"></div>
      <p>Loading predictions...</p>
    </div>`);

  const matchIds = roundsData.flatMap(r => (r.matches || []).map(m => m.id));

  if (matchIds.length === 0) {
    updateModalBody(`
      <div class="empty-state" style="padding:40px 20px">
        <div class="empty-icon">📋</div>
        <p>No active matches this round.</p>
      </div>`);
    return;
  }

  // Fetch predictions AND jokers for this player in parallel
  const [predsRes, jokersRes] = await Promise.all([
    _lbDb
      .from('predictions')
      .select('match_id, predicted_home, predicted_away, points_earned')
      .eq('user_id', userId)
      .in('match_id', matchIds),
    _lbDb
      .from('jokers')
      .select('match_id')
      .eq('user_id', userId)
  ]);

  if (predsRes.error) {
    updateModalBody(`
      <p style="color:var(--red); padding:20px">
        Error loading predictions.
      </p>`);
    return;
  }

  const predMap   = {};
  (predsRes.data || []).forEach(p => { predMap[p.match_id] = p; });

  // Build a set of match IDs where this user played their joker
  const jokerMatchIds = new Set(
    (jokersRes.data || []).map(j => Number(j.match_id))
  );

  let html = '';

  roundsData.forEach(round => {
    const matches = [...(round.matches || [])].sort((a, b) => {
      if (!a.match_date) return 1;
      if (!b.match_date) return -1;
      return new Date(a.match_date) - new Date(b.match_date);
    });

    if (matches.length === 0) return;

    html += `
      <div style="font-size:0.8rem; font-weight:700; color:var(--green);
           text-transform:uppercase; letter-spacing:1px; margin-bottom:12px">
        ${round.name}
      </div>`;

    matches.forEach(match => {
      const pred       = predMap[match.id];
      const isFinished = match.is_finished;
      const hasDate    = !!match.match_date;
      const matchTime  = hasDate ? new Date(match.match_date) : null;
      const msUntil    = matchTime ? matchTime - new Date() : Infinity;
      const isLocked   = isFinished || (hasDate && msUntil <= 60 * 60 * 1000);

      // Check if joker was played on this match
      const hasJoker   = jokerMatchIds.has(Number(match.id));

      const dateStr = hasDate
        ? new Date(match.match_date).toLocaleString('en-GB', {
            timeZone: 'Africa/Cairo',
            weekday:  'short',
            month:    'short',
            day:      'numeric',
            hour:     '2-digit',
            minute:   '2-digit',
            hour12:   false
          })
        : 'TBD';

      // ---- Result badge — fixed logic ----
      let resultBadge = '';
      if (isFinished && pred !== undefined) {
        const pts        = pred ? pred.points_earned : 0;
        const actualHome = match.home_score;
        const actualAway = match.away_score;

        // Work out what BASE result was (before joker doubling)
        const isPerfect = pred
          && pred.predicted_home === actualHome
          && pred.predicted_away === actualAway;

        const actualOutcome = Math.sign(actualHome - actualAway);
        const predOutcome   = pred
          ? Math.sign(pred.predicted_home - pred.predicted_away)
          : null;
        const isCorrect     = pred && predOutcome === actualOutcome;

        if (!pred) {
          // No prediction made
          resultBadge = `
            <span style="background:rgba(255,23,68,0.1);
                  color:var(--red);
                  border:1px solid rgba(255,23,68,0.2);
                  padding:4px 10px; border-radius:20px;
                  font-size:0.78rem; font-weight:700">
              — No prediction
            </span>`;
        } else if (isPerfect) {
          // Perfect score — YELLOW/GOLD
          resultBadge = `
            <span style="background:rgba(255,215,0,0.15);
                  color:var(--gold);
                  border:1px solid rgba(255,215,0,0.4);
                  padding:4px 10px; border-radius:20px;
                  font-size:0.78rem; font-weight:700">
              ⚡ Perfect! +${pts}pts${hasJoker ? ' 🃏' : ''}
            </span>`;
        } else if (isCorrect) {
          // Correct outcome — GREEN
          resultBadge = `
            <span style="background:rgba(0,200,83,0.12);
                  color:var(--green);
                  border:1px solid rgba(0,200,83,0.3);
                  padding:4px 10px; border-radius:20px;
                  font-size:0.78rem; font-weight:700">
              ✓ Correct +${pts}pts${hasJoker ? ' 🃏' : ''}
            </span>`;
        } else {
          // Wrong — RED
          resultBadge = `
            <span style="background:rgba(255,23,68,0.1);
                  color:var(--red);
                  border:1px solid rgba(255,23,68,0.2);
                  padding:4px 10px; border-radius:20px;
                  font-size:0.78rem; font-weight:700">
              ✗ Wrong • 0pts
            </span>`;
        }
      }

      html += `
        <div style="background:var(--dark-3); border:1px solid ${hasJoker ? 'rgba(255,215,0,0.3)' : 'var(--border)'};
             border-radius:12px; padding:14px 16px; margin-bottom:10px;
             ${hasJoker ? 'box-shadow:0 0 10px rgba(255,215,0,0.08)' : ''}">

          ${hasJoker ? `
            <div style="text-align:center; margin-bottom:8px">
              <span style="font-size:0.72rem; color:var(--gold); font-weight:700;
                    text-transform:uppercase; letter-spacing:1px">
                🃏 Joker Match
              </span>
            </div>` : ''}

          <!-- Teams -->
          <div style="display:grid; grid-template-columns:1fr auto 1fr;
               align-items:center; gap:8px; margin-bottom:10px">
            <div style="text-align:right; font-weight:700; font-size:0.95rem">
              ${match.home_team}
            </div>
            <div style="background:var(--dark); border:1px solid var(--border);
                 border-radius:8px; padding:4px 10px; font-size:0.8rem;
                 font-weight:700; color:var(--text-muted); white-space:nowrap">
              ${isFinished
                ? `<span style="color:var(--green)">
                     ${match.home_score}–${match.away_score}
                   </span>`
                : 'VS'}
            </div>
            <div style="text-align:left; font-weight:700; font-size:0.95rem">
              ${match.away_team}
            </div>
          </div>

          <!-- Date -->
          <div style="text-align:center; font-size:0.75rem;
               color:var(--text-muted); margin-bottom:10px">
            ${dateStr} 
          </div>

          <!-- Prediction + result -->
          <div style="text-align:center">
            ${isLocked
              ? pred
                ? `<div style="display:flex; align-items:center;
                        justify-content:center; gap:12px; flex-wrap:wrap">
                     <div>
                       <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:4px">
                         Predicted
                       </div>
                       <div style="font-size:1.3rem; font-weight:800; color:var(--text)">
                         ${pred.predicted_home} – ${pred.predicted_away}
                       </div>
                     </div>
                     ${resultBadge ? `<div>${resultBadge}</div>` : ''}
                   </div>`
                : `<span style="color:var(--text-muted); font-size:0.85rem; font-style:italic">
                     No prediction made
                   </span>`
              : `<span style="color:var(--text-muted); font-size:0.82rem">
                   🔒 Hidden until 1hr before kickoff
                 </span>`}
          </div>

        </div>`;
    });
  });

  if (!html) {
    html = `
      <div class="empty-state" style="padding:30px">
        <div class="empty-icon">📋</div>
        <p>No matches this round.</p>
      </div>`;
  }

  updateModalBody(html);
}

// ============================================
// MODAL HELPERS
// ============================================
function showModal(title, bodyHtml) {
  const existing = document.getElementById('player-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id    = 'player-modal';
  modal.innerHTML = `
    <div id="modal-overlay"
         onclick="closeModal()"
         style="position:fixed; inset:0; background:rgba(0,0,0,0.7);
                backdrop-filter:blur(4px); z-index:200;
                display:flex; align-items:center; justify-content:center;
                padding:16px; animation:fadeIn 0.2s ease">

      <div onclick="event.stopPropagation()"
           style="background:var(--card); border:1px solid var(--border);
                  border-radius:20px; width:100%; max-width:520px;
                  max-height:85vh; display:flex; flex-direction:column;
                  animation:slideUp 0.25s ease">

        <!-- Header -->
        <div style="display:flex; align-items:center; justify-content:space-between;
             padding:20px 24px; border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted);
                 text-transform:uppercase; letter-spacing:1px; margin-bottom:4px">
              Matchweek Predictions
            </div>
            <h2 id="modal-title"
                style="font-size:1.2rem; font-weight:800; margin:0">
              ${title}
            </h2>
          </div>
          <button onclick="closeModal()"
                  style="background:var(--dark-3); border:1px solid var(--border);
                         color:var(--text-muted); border-radius:8px;
                         width:36px; height:36px; cursor:pointer;
                         font-size:1.1rem; display:flex; align-items:center;
                         justify-content:center; transition:all 0.2s"
                  onmouseover="this.style.borderColor='var(--red)';
                               this.style.color='var(--red)'"
                  onmouseout="this.style.borderColor='var(--border)';
                              this.style.color='var(--text-muted)'">
            ✕
          </button>
        </div>

        <!-- Body -->
        <div id="modal-body"
             style="padding:20px 24px; overflow-y:auto; flex:1">
          ${bodyHtml}
        </div>

      </div>
    </div>`;

  document.body.appendChild(modal);
  document.addEventListener('keydown', handleEscKey);
}

function updateModalBody(html) {
  const body = document.getElementById('modal-body');
  if (body) body.innerHTML = html;
}

function closeModal() {
  const modal = document.getElementById('player-modal');
  if (modal) modal.remove();
  document.removeEventListener('keydown', handleEscKey);
}

function handleEscKey(e) {
  if (e.key === 'Escape') closeModal();
}

init();
