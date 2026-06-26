// ============================================
// PREDICT.JS — Live/Final timing + admin override
// ============================================

let currentUser    = null;
let currentProfile = null;
let jokerMatchId   = null;
let jokerRoundId   = null;
let currentRoundId = null;

// Use shared client from auth.js, with fallback
const _predictDb = (typeof _db !== 'undefined') ? _db : window.supabase.createClient(
  'https://bpmmimvlwuokipawabrk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwbW1pbXZsd3Vva2lwYXdhYnJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjE5NTMsImV4cCI6MjA5NzQzNzk1M30.U9S3vUNhyuqqirMNdamRBqdh67JbHNatBkQvdF3qu3k'
);

// Match duration before showing FINAL (2hrs 5min in ms)
const MATCH_DURATION_MS = (2 * 60 + 5) * 60 * 1000;

// ============================================
// INIT
// ============================================
async function init() {
  const { data: { session } } = await _predictDb.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = session.user;

  if (typeof ADMIN_IDS !== 'undefined' && ADMIN_IDS.includes(currentUser.id)) {
    const adminBtn = document.getElementById('admin-nav-btn');
    if (adminBtn) adminBtn.style.display = 'inline-flex';
  }

  const [profileRes, roundsRes, allProfilesRes] = await Promise.all([
    _predictDb
      .from('profiles')
      .select('username, total_points')
      .eq('id', currentUser.id)
      .single(),
    _predictDb
      .from('rounds')
      .select('id, name, matches(id, home_team, away_team, match_date, home_score, away_score, is_finished)')
      .eq('is_active', true)
      .order('id'),
    _predictDb
      .from('profiles')
      .select('id, total_points')
      .order('total_points', { ascending: false })
  ]);

  currentProfile    = profileRes.data;
  const allProfiles = allProfilesRes.data || [];

  const greeting = document.getElementById('user-greeting');
  if (greeting) {
    greeting.textContent = `Welcome back, ${currentProfile?.username || 'Player'}`;
  }

  const rounds = roundsRes.data || [];

  if (rounds.length === 0) {
    document.getElementById('matches-container').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏟️</div>
        <p>No active rounds yet. Check back soon!</p>
      </div>`;
    renderStats(currentProfile?.total_points || 0, 0, allProfiles);
    return;
  }

  currentRoundId = rounds[0]?.id || null;

  const matchIds = rounds.flatMap(r => (r.matches || []).map(m => m.id));

  if (matchIds.length === 0) {
    document.getElementById('matches-container').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>No matches scheduled yet.</p>
      </div>`;
    renderStats(currentProfile?.total_points || 0, 0, allProfiles);
    return;
  }

  const [predsRes, jokerRes] = await Promise.all([
    _predictDb
      .from('predictions')
      .select('match_id, predicted_home, predicted_away, points_earned')
      .eq('user_id', currentUser.id)
      .in('match_id', matchIds),
    _predictDb
      .from('jokers')
      .select('match_id, round_id')
      .eq('user_id', currentUser.id)
      .eq('round_id', currentRoundId)
      .maybeSingle()
  ]);

  const predMap = {};
  (predsRes.data || []).forEach(p => { predMap[p.match_id] = p; });

  if (jokerRes.data) {
    jokerMatchId = Number(jokerRes.data.match_id);
    jokerRoundId = Number(jokerRes.data.round_id);
  }

  await autoKickoffMatches(rounds);

  renderMatches(rounds, predMap);
  renderStats(currentProfile?.total_points || 0, predsRes.data?.length || 0, allProfiles);
  startCountdownTicker();
}

// ============================================
// AUTO KICKOFF
// ============================================
async function autoKickoffMatches(rounds) {
  const now = new Date();
  for (const round of rounds) {
    for (const match of (round.matches || [])) {
      if (!match.match_date || match.is_finished) continue;
      const matchTime = new Date(match.match_date);
      if (now >= matchTime) {
        const { error } = await _predictDb
          .from('matches')
          .update({
            home_score:  match.home_score ?? 0,
            away_score:  match.away_score ?? 0,
            is_finished: true
          })
          .eq('id', match.id)
          .is('is_finished', false);

        if (!error) {
          match.is_finished = true;
          match.home_score  = match.home_score ?? 0;
          match.away_score  = match.away_score ?? 0;
        }
      }
    }
  }
}

// ============================================
// COUNTDOWN TICKER — runs every second
// ============================================
function startCountdownTicker() {
  setInterval(() => {
    const now     = new Date();
    const oneHour = 60 * 60 * 1000;

    document.querySelectorAll('[data-kickoff]').forEach(el => {
      const matchId   = el.dataset.matchid;
      const kickoff   = new Date(el.dataset.kickoff);
      const diff      = kickoff - now;
      const sinceKick = now - kickoff; // how long since kickoff

      if (diff <= 0) {
        // Match has kicked off
        if (sinceKick >= MATCH_DURATION_MS) {
          // 2h05m has passed — show FINAL
          el.textContent = '🏁 FINAL';
          el.style.color = 'var(--text-muted)';
        } else {
          // Still within match duration — show LIVE + elapsed
          const elapsed   = formatElapsed(sinceKick);
          el.textContent  = `🔴 LIVE | ${elapsed}`;
          el.style.color  = 'var(--red)';
        }
        lockMatchCard(matchId);
      } else if (diff <= oneHour) {
        el.textContent = `🔒 Locked — kicks off in ${formatCountdown(diff)}`;
        el.style.color = 'var(--gold)';
        lockMatchCard(matchId);
      } else {
        el.textContent = `⏱ ${formatCountdown(diff)}`;
        el.style.color = 'var(--text-muted)';
      }
    });
  }, 1000);
}

// Format elapsed time since kickoff (e.g. "45'")
function formatElapsed(ms) {
  const totalMinutes = Math.floor(ms / 60000);

  // First half: 0-45 mins → show 0' to 45'
  if (totalMinutes <= 45) {
    return `${totalMinutes}'`;
  }

  // Half time break: 45-65 mins real time → show 45+' (paused)
  if (totalMinutes <= 65) {
    return `HT`;
  }

  // Second half: 65-125 mins real time → map to 46' to 90'
  const secondHalf = 46 + (totalMinutes - 65);
  const display    = Math.min(secondHalf, 90);
  return `${display}'`;
}

function formatCountdown(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days         = Math.floor(totalSeconds / 86400);
  const hours        = Math.floor((totalSeconds % 86400) / 3600);
  const minutes      = Math.floor((totalSeconds % 3600) / 60);
  const seconds      = totalSeconds % 60;

  if (days > 0)  return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function lockMatchCard(matchId) {
  const homeInput = document.getElementById(`home-${matchId}`);
  const awayInput = document.getElementById(`away-${matchId}`);
  const saveBtn   = document.getElementById(`save-pred-${matchId}`);
  const jokerBtn  = document.getElementById(`joker-btn-${matchId}`);

  if (homeInput) homeInput.disabled = true;
  if (awayInput) awayInput.disabled = true;
  if (saveBtn) {
    saveBtn.disabled    = true;
    saveBtn.textContent = '🔒 Locked';
  }
  if (jokerBtn && !jokerBtn.classList.contains('joker-used')) {
    jokerBtn.disabled = true;
  }
}

// ============================================
// RENDER STATS
// ============================================
function renderStats(points, predicted, allProfiles) {
  document.getElementById('stats-bar').style.display   = 'grid';
  document.getElementById('stat-points').textContent   = points;
  document.getElementById('stat-predicted').textContent = predicted;

  if (allProfiles && allProfiles.length > 0) {
    const sorted = [...allProfiles].sort((a, b) => b.total_points - a.total_points);
    const rank   = sorted.findIndex(p => p.id === currentUser.id) + 1;
    document.getElementById('stat-rank').textContent = rank > 0 ? `#${rank}` : '#–';
  } else {
    document.getElementById('stat-rank').textContent = '#–';
  }
}

// ============================================
// RENDER MATCHES
// ============================================
function renderMatches(rounds, predMap) {
  const container = document.getElementById('matches-container');
  const isAdmin   = typeof ADMIN_IDS !== 'undefined' && ADMIN_IDS.includes(currentUser?.id);
  const now       = new Date();
  const oneHour   = 60 * 60 * 1000;
  const jokerUsed = jokerMatchId !== null;

  // Find joker match name for banner
  let jokerMatchName = '';
  if (jokerUsed) {
    rounds.forEach(r => {
      (r.matches || []).forEach(m => {
        if (Number(m.id) === Number(jokerMatchId)) {
          jokerMatchName = `${m.home_team} vs ${m.away_team}`;
        }
      });
    });
  }

  let html = ' ';

  // ---- Joker banner ----
  html += `
    <div class="card" style="margin-bottom:24px; display:flex; align-items:center;
         justify-content:space-between; flex-wrap:wrap; gap:12px;
         border-color:${jokerUsed ? 'var(--gold)' : 'var(--border)'}">
      <div>
        <div style="font-weight:700; font-size:1rem; margin-bottom:4px">
          🃏 Double Points Joker
        </div>
        <div style="font-size:0.85rem; color:var(--text-muted)">
          ${jokerUsed
            ? `Used on <strong style="color:var(--gold)">${jokerMatchName}</strong>. Points doubled!`
            : 'Pick one match this round to double your points. Use it wisely!'}
        </div>
      </div>
      <span style="
        background:${jokerUsed ? 'rgba(255,215,0,0.15)' : 'rgba(0,200,83,0.15)'};
        color:${jokerUsed ? 'var(--gold)' : 'var(--green)'};
        border:1px solid ${jokerUsed ? 'rgba(255,215,0,0.3)' : 'rgba(0,200,83,0.3)'};
        font-size:0.85rem; padding:6px 14px; border-radius:20px; font-weight:700">
        ${jokerUsed ? '🃏 Joker Used' : '🃏 1 Joker Available'}
      </span>
    </div>`;

  rounds.forEach(round => {
    if (!round.matches || round.matches.length === 0) return;

    // Sort by date
    round.matches.sort((a, b) => {
      if (!a.match_date) return 1;
      if (!b.match_date) return -1;
      return new Date(a.match_date) - new Date(b.match_date);
    });

    html += `<div class="round-label"><h2>${round.name}</h2></div>`;

    round.matches.forEach(match => {
      const pred               = predMap[match.id];
      const isFinished         = match.is_finished;
      const hasDate            = !!match.match_date;
      const matchTime          = hasDate ? new Date(match.match_date) : null;
      const msUntilKickoff     = matchTime ? matchTime - now : Infinity;
      const msSinceKickoff     = matchTime ? now - matchTime : 0;
      const isWithinLockWindow = hasDate && msUntilKickoff <= oneHour;
      const isKickedOff        = hasDate && msUntilKickoff <= 0;
      const isFinal            = isFinished && isKickedOff && msSinceKickoff >= MATCH_DURATION_MS;
      const isLive             = isFinished && isKickedOff && msSinceKickoff < MATCH_DURATION_MS;
      const isLocked           = isFinished || isWithinLockWindow;

      const isJokerOnThisMatch = jokerMatchId !== null
        && Number(jokerMatchId) === Number(match.id);
      const canPlaceJoker = !jokerUsed && !isLocked;

      // ---- Date string ----
      const dateStr = hasDate
        ? new Date(match.match_date).toLocaleString('en-GB', {
            timeZone: 'Africa/Cairo',
            weekday:  'short',
            month:    'short',
            day:      'numeric',
            hour:     '2-digit',
            minute:   '2-digit',
            hour12:   false
          }) + ''
        : 'Date TBD';

      // ---- Status label ----
      let statusHtml = '';

      if (isFinished && hasDate) {
        if (isFinal) {
          // Past 2h05m — show FINAL
          statusHtml = `
            <div class="match-date"
                 data-kickoff="${match.match_date}"
                 data-matchid="${match.id}"
                 style="color:var(--text-muted); font-weight:600">
              🏁 FINAL
            </div>
            <div class="match-date" style="font-size:0.78rem; margin-top:2px; color:var(--text-muted)">
              ${dateStr}
            </div>`;
        } else if (isLive) {
          // Within 2h05m — show LIVE + elapsed
          const elapsed = formatElapsed(msSinceKickoff);
          statusHtml = `
            <div class="match-date"
                 data-kickoff="${match.match_date}"
                 data-matchid="${match.id}"
                 style="color:var(--red); font-weight:700">
              🔴 LIVE ${elapsed}
            </div>
            <div class="match-date" style="font-size:0.78rem; margin-top:2px; color:var(--text-muted)">
              ${dateStr}
            </div>`;
        } else {
          // Finished but no date context
          statusHtml = `
            <div class="match-date" style="color:var(--text-muted); font-weight:600">
              🏁 FINAL
            </div>`;
        }
      } else if (!isFinished && hasDate) {
        const initialText = isKickedOff
          ? `🔴 LIVE 0'`
          : isWithinLockWindow
            ? `🔒 Locked — kicks off in ${formatCountdown(msUntilKickoff)}`
            : `⏱ ${formatCountdown(msUntilKickoff)}`;

        const initialColor = isKickedOff
          ? 'var(--red)'
          : isWithinLockWindow
            ? 'var(--gold)'
            : 'var(--text-muted)';

        statusHtml = `
          <div class="match-date"
               data-kickoff="${match.match_date}"
               data-matchid="${match.id}"
               style="color:${initialColor}; font-weight:600">
            ${initialText}
          </div>
          <div class="match-date" style="font-size:0.78rem; margin-top:2px; color:var(--text-muted)">
            ${dateStr}
          </div>`;
      } else {
        statusHtml = `<div class="match-date">📅 Date TBD</div>`;
      }

      // ---- Lock notice ----
      const lockNotice = isWithinLockWindow && !isFinished ? `
        <div style="text-align:center; margin-bottom:12px">
          <span style="background:rgba(255,215,0,0.1); color:var(--gold);
                border:1px solid rgba(255,215,0,0.3); border-radius:20px;
                padding:4px 14px; font-size:0.8rem; font-weight:600">
            🔒 Predictions locked 1 hour before kickoff
          </span>
        </div>` : '';

      // ---- Result badge ----
      let resultBadge = '';
      if (isFinished && pred !== undefined) {
        const pts        = pred ? pred.points_earned : 0;
        const isPerfect  = pred
          && pred.predicted_home === match.home_score
          && pred.predicted_away === match.away_score;
        const actualOut  = Math.sign(match.home_score - match.away_score);
        const predOut    = pred
          ? Math.sign(pred.predicted_home - pred.predicted_away)
          : null;
        const isCorrect  = pred && predOut === actualOut;

        if (!pred) {
          resultBadge = `<span class="result-badge wrong">— No prediction</span>`;
        } else if (isPerfect) {
          resultBadge = `
            <span class="result-badge exact">
              ⚡ Perfect! +${pts}pts${isJokerOnThisMatch ? ' 🃏' : ''}
            </span>`;
        } else if (isCorrect) {
          resultBadge = `
            <span class="result-badge correct">
              ✓ Correct +${pts}pts${isJokerOnThisMatch ? ' 🃏' : ''}
            </span>`;
        } else {
          resultBadge = `<span class="result-badge wrong">✗ Wrong • 0pts</span>`;
        }
      }

      // ---- Joker button ----
      let jokerHtml = '';
      if (isJokerOnThisMatch) {
        jokerHtml = `
          <div style="margin-top:14px; display:flex; align-items:center;
               justify-content:center; gap:10px; flex-wrap:wrap">
            <div style="display:flex; align-items:center; gap:8px;
                 background:rgba(255,215,0,0.1);
                 border:1px solid rgba(255,215,0,0.4);
                 border-radius:12px; padding:10px 16px">
              <span style="font-size:1.2rem">🃏</span>
              <span style="color:var(--gold); font-weight:700; font-size:0.9rem">
                Joker Active — Points Doubled!
              </span>
            </div>
            ${!isLocked ? `
              <button class="btn btn-ghost btn-sm joker-used"
                      id="joker-btn-${match.id}"
                      onclick="removeJoker(${match.id})">
                ✕ Remove Joker
              </button>` : ''}
          </div>`;
      } else if (canPlaceJoker) {
        jokerHtml = `
          <div style="margin-top:14px; text-align:center">
            <button class="btn btn-ghost btn-sm"
                    id="joker-btn-${match.id}"
                    onclick="placeJoker(${match.id}, ${round.id})"
                    style="border-color:var(--gold); color:var(--gold)">
              🃏 Use Joker on this match
            </button>
          </div>`;
      }

      // ---- Admin: score editor (always visible for finished matches) ----
      const adminEditor = isAdmin && isFinished ? `
        <div style="border-top:1px solid var(--border);
             margin-top:16px; padding-top:14px">
          <p style="text-align:center; font-size:0.78rem;
               color:var(--text-muted); margin-bottom:10px">
            ⚙️ Admin — Update Score
          </p>
          <div style="display:flex; align-items:center;
               justify-content:center; gap:10px; flex-wrap:wrap">
            <input type="number" id="live-home-${match.id}"
                   value="${match.home_score ?? 0}" min="0" max="20"
                   style="width:56px; background:var(--dark);
                          border:2px solid var(--green); border-radius:8px;
                          padding:8px; color:var(--text); font-size:1.2rem;
                          font-weight:800; text-align:center; outline:none">
            <span style="color:var(--text-muted);
                         font-size:1.3rem; font-weight:800">–</span>
            <input type="number" id="live-away-${match.id}"
                   value="${match.away_score ?? 0}" min="0" max="20"
                   style="width:56px; background:var(--dark);
                          border:2px solid var(--green); border-radius:8px;
                          padding:8px; color:var(--text); font-size:1.2rem;
                          font-weight:800; text-align:center; outline:none">
            <button class="btn btn-primary btn-sm"
                    onclick="updateLiveScore(${match.id})">
              🔄 Update
            </button>
          </div>

          <!-- Admin: extend match time if it runs longer -->
          <div style="margin-top:10px; text-align:center">
            <button class="btn btn-ghost btn-sm"
                    onclick="extendMatch(${match.id}, '${match.match_date}')"
                    style="font-size:0.78rem; color:var(--text-muted)">
              ⏱ Match running longer? Extend FINAL timer
            </button>
          </div>
        </div>` : '';

      // ---- Admin go-live ----
      const adminGoLive = isAdmin && !isFinished && isKickedOff ? `
        <div style="border-top:1px solid var(--border);
             margin-top:16px; padding-top:14px">
          <p style="text-align:center; font-size:0.78rem;
               color:var(--text-muted); margin-bottom:10px">
            ⚙️ Admin — Set Opening Score
          </p>
          <div style="display:flex; align-items:center;
               justify-content:center; gap:10px; flex-wrap:wrap">
            <input type="number" id="live-home-${match.id}"
                   value="0" min="0" max="20"
                   style="width:56px; background:var(--dark);
                          border:2px solid var(--green); border-radius:8px;
                          padding:8px; color:var(--text); font-size:1.2rem;
                          font-weight:800; text-align:center; outline:none">
            <span style="color:var(--text-muted);
                         font-size:1.3rem; font-weight:800">–</span>
            <input type="number" id="live-away-${match.id}"
                   value="0" min="0" max="20"
                   style="width:56px; background:var(--dark);
                          border:2px solid var(--green); border-radius:8px;
                          padding:8px; color:var(--text); font-size:1.2rem;
                          font-weight:800; text-align:center; outline:none">
            <button class="btn btn-primary btn-sm"
                    onclick="updateLiveScore(${match.id})">
              🟢 Go Live
            </button>
          </div>
        </div>` : '';

      const jokerStyle = isJokerOnThisMatch
        ? 'border-color:var(--gold); box-shadow:0 0 16px rgba(255,215,0,0.12);'
        : '';

      // ---- Score display in VS badge ----
      const vsBadgeContent = isFinished
        ? `<span style="color:var(--green); font-size:1rem; font-weight:800">
             ${match.home_score}–${match.away_score}
           </span>`
        : 'VS';

      html += `
        <div class="match-card ${isLocked ? 'locked' : ''} ${pred ? 'saved' : ''}"
             id="match-${match.id}"
             style="${jokerStyle}">

          ${isJokerOnThisMatch ? `
            <div style="text-align:center; margin-bottom:8px">
              <span style="font-size:0.75rem; color:var(--gold); font-weight:700;
                    text-transform:uppercase; letter-spacing:1px">
                🃏 Joker Match
              </span>
            </div>` : ''}

          <!-- Teams -->
          <div class="match-teams">
            <div class="team">
              <div class="team-name home">${match.home_team}</div>
            </div>
            <div class="vs-badge">${vsBadgeContent}</div>
            <div class="team">
              <div class="team-name away">${match.away_team}</div>
            </div>
          </div>

          ${statusHtml}
          ${lockNotice}

          <!-- Prediction inputs OR locked view -->
          ${!isLocked ? `
            <div class="prediction-inputs">
              <input type="number" class="score-input"
                     id="home-${match.id}"
                     min="0" max="20" placeholder="0"
                     value="${pred ? pred.predicted_home : ''}">
              <span class="score-separator">–</span>
              <input type="number" class="score-input"
                     id="away-${match.id}"
                     min="0" max="20" placeholder="0"
                     value="${pred ? pred.predicted_away : ''}">
            </div>
            <div class="save-btn-wrap">
              <button class="btn btn-primary btn-sm"
                      id="save-pred-${match.id}"
                      onclick="savePrediction(${match.id})">
                ${pred ? '✏️ Update' : '💾 Save Prediction'}
              </button>
            </div>
          ` : `
            <div style="text-align:center; padding:8px 0">
              <span style="color:var(--text-muted); font-size:0.9rem">
                Your pick:
              </span>
              <strong>
                ${pred
                  ? `${pred.predicted_home} – ${pred.predicted_away}`
                  : `<span style="color:var(--text-muted)">No prediction made</span>`}
              </strong>
            </div>
            ${resultBadge
              ? `<div style="text-align:center; margin-top:8px">${resultBadge}</div>`
              : ''}
          `}

          ${jokerHtml}
          ${adminEditor}
          ${adminGoLive}

        </div>`;
    });
  });

  container.innerHTML = html || `
    <div class="empty-state">
      <div class="empty-icon">📋</div>
      <p>No matches available.</p>
    </div>`;
}

// ============================================
// ADMIN: EXTEND MATCH TIME
// Shows a prompt to add extra minutes to the FINAL timer
// ============================================
function extendMatch(matchId, matchDate) {
  const extra = prompt(
    'How many extra minutes do you want to add before showing FINAL?\n(e.g. type 30 for 30 extra minutes)',
    '30'
  );

  if (extra === null) return; // cancelled
  const extraMins = parseInt(extra);
  if (isNaN(extraMins) || extraMins <= 0) {
    alert('Please enter a valid number of minutes.');
    return;
  }

  // Store the extended kickoff time in sessionStorage
  // (resets when page is refreshed — that's fine, admin can re-extend)
  const originalKickoff  = new Date(matchDate);
  const extendedKickoff  = new Date(originalKickoff.getTime() - (extraMins * 60 * 1000));
  sessionStorage.setItem(`extend-${matchId}`, extendedKickoff.toISOString());

  // Update the data-kickoff attribute live
  const countdownEl = document.querySelector(`[data-matchid="${matchId}"]`);
  if (countdownEl) {
    countdownEl.dataset.kickoff = extendedKickoff.toISOString();
    countdownEl.textContent     = `🔴 LIVE (extended +${extraMins}')`;
    countdownEl.style.color     = 'var(--red)';
  }

  showToast(`⏱ Extended by ${extraMins} minutes!`);
}

// ============================================
// SAVE PREDICTION
// ============================================
async function savePrediction(matchId) {
  const homeInput = document.getElementById(`home-${matchId}`);
  const awayInput = document.getElementById(`away-${matchId}`);

  if (!homeInput || homeInput.value === '' || awayInput.value === '') {
    showToast('Enter both scores!', 'error');
    return;
  }

  const predicted_home = parseInt(homeInput.value);
  const predicted_away = parseInt(awayInput.value);

  if (isNaN(predicted_home) || isNaN(predicted_away)
      || predicted_home < 0 || predicted_away < 0) {
    showToast('Invalid scores!', 'error');
    return;
  }

  // Double check not locked
  const kickoffEl = document.querySelector(`[data-matchid="${matchId}"]`);
  if (kickoffEl) {
    const kickoff = new Date(kickoffEl.dataset.kickoff);
    if (kickoff - new Date() <= 60 * 60 * 1000) {
      showToast('Predictions are locked for this match!', 'error');
      return;
    }
  }

  const { error } = await _predictDb.from('predictions').upsert({
    user_id:       currentUser.id,
    match_id:      matchId,
    predicted_home,
    predicted_away,
    points_earned: 0
  }, { onConflict: 'user_id,match_id' });

  if (error) {
    showToast('Error saving: ' + error.message, 'error');
  } else {
    showToast('Prediction saved!');
    const btn = document.getElementById(`save-pred-${matchId}`);
    if (btn) btn.textContent = '✏️ Update';
    document.getElementById(`match-${matchId}`)?.classList.add('saved');
  }
}

// ============================================
// JOKER: PLACE
// ============================================
async function placeJoker(matchId, roundId) {
  matchId = Number(matchId);
  roundId = Number(roundId);

  if (!confirm('🃏 Use your joker on this match? Points will be DOUBLED. You can remove it before kickoff.')) return;

  const { error } = await _predictDb.from('jokers').insert({
    user_id:  currentUser.id,
    match_id: matchId,
    round_id: roundId
  });

  if (error) {
    showToast('Error placing joker: ' + error.message, 'error');
    return;
  }

  jokerMatchId = matchId;
  jokerRoundId = roundId;
  showToast('🃏 Joker placed! Points doubled for this match.');
  setTimeout(() => location.reload(), 1000);
}

// ============================================
// JOKER: REMOVE
// ============================================
async function removeJoker(matchId) {
  matchId = Number(matchId);
  if (!confirm('Remove your joker from this match?')) return;

  const { error } = await _predictDb
    .from('jokers')
    .delete()
    .eq('user_id', currentUser.id)
    .eq('match_id', matchId);

  if (error) {
    showToast('Error removing joker: ' + error.message, 'error');
    return;
  }

  jokerMatchId = null;
  jokerRoundId = null;
  showToast('Joker removed.');
  setTimeout(() => location.reload(), 1000);
}

// ============================================
// ADMIN: UPDATE LIVE SCORE
// ============================================
async function updateLiveScore(matchId) {
  const homeScore = parseInt(document.getElementById(`live-home-${matchId}`).value);
  const awayScore = parseInt(document.getElementById(`live-away-${matchId}`).value);

  if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
    showToast('Enter valid scores!', 'error');
    return;
  }

  const { error: matchError } = await _predictDb
    .from('matches')
    .update({ home_score: homeScore, away_score: awayScore, is_finished: true })
    .eq('id', matchId);

  if (matchError) { showToast('Error: ' + matchError.message, 'error'); return; }

  const { data: preds } = await _predictDb
    .from('predictions')
    .select('id, user_id, predicted_home, predicted_away, points_earned')
    .eq('match_id', matchId);

  if (!preds || preds.length === 0) {
    showToast('Score updated!');
    setTimeout(() => location.reload(), 1200);
    return;
  }

  const { data: jokers } = await _predictDb
    .from('jokers')
    .select('user_id')
    .eq('match_id', matchId);

  const jokerUserIds = new Set((jokers || []).map(j => j.user_id));
  const actualResult = Math.sign(homeScore - awayScore);

  for (const p of preds) {
    const isPerfect  = p.predicted_home === homeScore && p.predicted_away === awayScore;
    const predResult = Math.sign(p.predicted_home - p.predicted_away);
    const isCorrect  = predResult === actualResult;

    const basePoints = isPerfect ? 6 : isCorrect ? 3 : 0;
    const newPoints  = jokerUserIds.has(p.user_id) ? basePoints * 2 : basePoints;
    const oldPoints  = p.points_earned || 0;
    const diff       = newPoints - oldPoints;

    await _predictDb
      .from('predictions')
      .update({ points_earned: newPoints })
      .eq('id', p.id);

    if (diff !== 0) {
      const { data: profile } = await _predictDb
        .from('profiles')
        .select('total_points')
        .eq('id', p.user_id)
        .single();

      await _predictDb
        .from('profiles')
        .update({ total_points: Math.max(0, (profile?.total_points || 0) + diff) })
        .eq('id', p.user_id);
    }
  }

  showToast(`Score updated! ${preds.length} predictions recalculated ✅`);
  setTimeout(() => location.reload(), 1500);
}

// ============================================
// TOAST
// ============================================
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = (type === 'success' ? '✅ ' : '❌ ') + msg;
  toast.className   = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

init();
