// ============================================
// ADMIN.JS — Round of 32 scoring rules
// Wrong=0, Correct=5, Perfect=10
// Penalties Win=+2, Penalties Loss=0
// ============================================

let adminSession = null;
let roundsCache  = [];
let matchesCache = [];

const CAIRO_OFFSET_HOURS = 2;

function formatCairoDate(isoString) {
  if (!isoString) return 'No date set';
  return new Date(isoString).toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    weekday:  'short',
    day:      'numeric',
    month:    'short',
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false
  }) + ' (Cairo)';
}

function cairoInputToUTC(localDatetimeStr) {
  if (!localDatetimeStr) return null;
  const [datePart, timePart] = localDatetimeStr.split('T');
  const [year, month, day]   = datePart.split('-').map(Number);
  const [hour, minute]       = timePart.split(':').map(Number);
  return new Date(Date.UTC(
    year, month - 1, day,
    hour - CAIRO_OFFSET_HOURS,
    minute
  )).toISOString();
}

function previewCairoTime(val) {
  const preview = document.getElementById('cairo-preview');
  if (!val) { preview.style.display = 'none'; return; }
  const utcString  = cairoInputToUTC(val);
  if (!utcString)  { preview.style.display = 'none'; return; }
  const displayBack = new Date(utcString).toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    weekday:  'long', day: 'numeric', month: 'long',
    year:     'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  });
  preview.style.display = 'block';
  preview.innerHTML = `Saves as: <strong>${displayBack} (Cairo)</strong>
    <br><span style="color:var(--text-muted); font-size:0.78rem">UTC: ${utcString}</span>`;
}

// ============================================
// POINTS CALCULATOR
// ============================================
function calculatePoints(pred, actualHome, actualAway, penaltiesWinner) {
  const ah = Number(actualHome);
  const aw = Number(actualAway);
  const ph = Number(pred.predicted_home);
  const pw = Number(pred.predicted_away);

  const isPerfect      = ph === ah && pw === aw;
  const actualOutcome  = Math.sign(ah - aw); // -1, 0, 1
  const predOutcome    = Math.sign(ph - pw);
  const isCorrect      = predOutcome === actualOutcome;
  const isDraw         = ah === aw; // actual result is a draw
  const hasPenalties   = !!penaltiesWinner;

  // No penalties scenario
  if (!hasPenalties) {
    if (isPerfect) return 10;
    if (isCorrect) return 5;
    return 0;
  }

  // Penalties scenario — only applies on draw results
  if (isDraw && hasPenalties) {
    // Did the player predict the draw correctly?
    const predictedDraw = predOutcome === 0;

    if (isPerfect) {
      // Perfect exact score (e.g. 1-1) + penalties
      // Did they also predict the correct penalties winner?
      // We store their penalties pick in predicted_penalties field
      // For now: perfect score + correct penalties = 12, wrong penalties = 0
      if (pred.predicted_penalties === penaltiesWinner) return 12;
      return 0; // predicted exact but wrong penalties
    }

    if (predictedDraw) {
      // Correct outcome (draw) but not exact score + penalties
      if (pred.predicted_penalties === penaltiesWinner) return 7;
      return 0;
    }

    // Predicted wrong outcome entirely
    return 0;
  }

  // Non-draw with penalties (shouldn't happen but safe fallback)
  if (isPerfect) return 10;
  if (isCorrect) return 5;
  return 0;
}

// ============================================
// INIT
// ============================================
async function init() {
  if (typeof window.supabase === 'undefined') return;

  const { data: { session } } = await _db.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }

  adminSession = session;
  await loadAll();
}

async function loadAll() {
  const [roundsRes, matchesRes] = await Promise.all([
    _db.from('rounds')
       .select('id, name, is_active')
       .order('id'),
    _db.from('matches')
       .select('id, round_id, home_team, away_team, match_date, home_score, away_score, is_finished, penalties_winner')
       .order('match_date', { ascending: true })
  ]);

  if (roundsRes.error) { showToast('Error: ' + roundsRes.error.message, 'error'); return; }

  roundsCache  = roundsRes.data  || [];
  matchesCache = matchesRes.data || [];

  renderRoundsList();
  renderMatchesList();
  renderResultsList();
  populateRoundSelect();
}

// ============================================
// TAB SWITCHING
// ============================================
function switchAdminTab(tab, el) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(`section-${tab}`).classList.add('active');
}

// ============================================
// ROUNDS
// ============================================
function renderRoundsList() {
  const container = document.getElementById('rounds-list');
  if (roundsCache.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No rounds yet. Add one above!</p></div>';
    return;
  }
  let html = '';
  roundsCache.forEach(r => {
    html += `
      <div class="admin-match-item">
        <div class="admin-match-info">
          <strong>${r.name}</strong>
          <small>${r.is_active ? 'Active - shown to players' : 'Inactive'}</small>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
          ${!r.is_active ? `
            <button class="btn btn-ghost btn-sm" onclick="setActiveRound(${r.id})">
              Set Active
            </button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="deleteRound(${r.id})">
            Delete
          </button>
        </div>
      </div>`;
  });
  container.innerHTML = html;
}

async function addRound() {
  const name     = document.getElementById('round-name').value.trim();
  const isActive = document.getElementById('round-active').checked;
  if (!name) { showToast('Enter a round name!', 'error'); return; }
  const { error } = await _db.from('rounds').insert({ name, is_active: isActive });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  document.getElementById('round-name').value    = '';
  document.getElementById('round-active').checked = false;
  showToast('Round added!');
  await loadAll();
}

async function setActiveRound(roundId) {
  await _db.from('rounds').update({ is_active: false }).neq('id', 0);
  await _db.from('rounds').update({ is_active: true }).eq('id', roundId);
  showToast('Active round updated!');
  await loadAll();
}

async function deleteRound(roundId) {
  if (!confirm('Delete this round and ALL its matches?')) return;
  const { error } = await _db.from('rounds').delete().eq('id', roundId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Round deleted');
  await loadAll();
}

// ============================================
// MATCHES
// ============================================
function populateRoundSelect() {
  const select = document.getElementById('match-round');
  if (!select) return;
  if (roundsCache.length === 0) {
    select.innerHTML = '<option value="">No rounds yet</option>';
    return;
  }
  select.innerHTML = roundsCache.map(r =>
    `<option value="${r.id}">${r.name}${r.is_active ? ' (Active)' : ''}</option>`
  ).join('');
}

function renderMatchesList() {
  const container = document.getElementById('matches-list');
  if (matchesCache.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No matches yet.</p></div>';
    return;
  }
  const byRound = {};
  matchesCache.forEach(m => {
    if (!byRound[m.round_id]) byRound[m.round_id] = [];
    byRound[m.round_id].push(m);
  });
  let html = '';
  roundsCache.forEach(r => {
    const ms = byRound[r.id] || [];
    if (ms.length === 0) return;
    html += `<div class="round-label"><h2>${r.name}</h2></div>`;
    ms.forEach(m => {
      html += `
        <div class="admin-match-item">
          <div class="admin-match-info">
            <strong>${m.home_team} vs ${m.away_team}</strong>
            <small>${formatCairoDate(m.match_date)}</small>
          </div>
          <button class="btn btn-danger btn-sm" onclick="deleteMatch(${m.id})">
            Delete
          </button>
        </div>`;
    });
  });
  container.innerHTML = html || '<div class="empty-state"><p>No matches.</p></div>';
}

async function addMatch() {
  const roundId   = document.getElementById('match-round').value;
  const homeTeam  = document.getElementById('home-team').value.trim();
  const awayTeam  = document.getElementById('away-team').value.trim();
  const localTime = document.getElementById('match-date').value;
  if (!roundId || !homeTeam || !awayTeam) {
    showToast('Fill in all required fields!', 'error');
    return;
  }
  const utcTime = localTime ? cairoInputToUTC(localTime) : null;
  const { error } = await _db.from('matches').insert({
    round_id: parseInt(roundId), home_team: homeTeam,
    away_team: awayTeam, match_date: utcTime
  });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  document.getElementById('home-team').value      = '';
  document.getElementById('away-team').value      = '';
  document.getElementById('match-date').value     = '';
  document.getElementById('cairo-preview').style.display = 'none';
  showToast('Match added! ' + formatCairoDate(utcTime));
  await loadAll();
}

async function deleteMatch(matchId) {
  if (!confirm('Delete this match and all its predictions?')) return;
  const { error } = await _db.from('matches').delete().eq('id', matchId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Match deleted');
  await loadAll();
}

// ============================================
// RESULTS
// ============================================
function renderResultsList() {
  const container = document.getElementById('results-list');
  if (matchesCache.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No matches yet.</p></div>';
    return;
  }

  const byRound = {};
  matchesCache.forEach(m => {
    if (!byRound[m.round_id]) byRound[m.round_id] = [];
    byRound[m.round_id].push(m);
  });

  let html = '';

  roundsCache.forEach(r => {
    const ms = byRound[r.id] || [];
    if (ms.length === 0) return;
    html += `<div class="round-label"><h2>${r.name}</h2></div>`;

    ms.forEach(m => {
      const isFinished       = m.is_finished;
      const currentHome      = m.home_score ?? '';
      const currentAway      = m.away_score ?? '';
      const penWinner        = m.penalties_winner || '';
      const isDraw           = isFinished && Number(m.home_score) === Number(m.away_score);

      html += `
        <div class="admin-match-item"
             style="flex-direction:column; align-items:stretch; gap:16px;
                    ${isFinished ? 'border-color:var(--green)' : ''}">

          <!-- Header -->
          <div style="display:flex; justify-content:space-between;
               align-items:center; flex-wrap:wrap; gap:8px">
            <div class="admin-match-info">
              <strong style="font-size:1rem">${m.home_team} vs ${m.away_team}</strong>
              <small>${formatCairoDate(m.match_date)}</small>
              <small style="margin-top:2px">
                ${isFinished
                  ? `Current score: <strong style="color:var(--green)">
                       ${m.home_score} - ${m.away_score}
                       ${m.penalties_winner
                         ? `(Pen: ${m.penalties_winner === 'home' ? m.home_team : m.away_team})`
                         : ''}
                     </strong>`
                  : 'Not started yet'}
              </small>
            </div>
            ${isFinished ? `
              <button class="btn btn-ghost btn-sm" onclick="unfinishMatch(${m.id})">
                Revert
              </button>` : ''}
          </div>

          <!-- Score inputs -->
          <div style="display:flex; align-items:flex-end; gap:16px; flex-wrap:wrap">

            <!-- Home score -->
            <div style="display:flex; flex-direction:column; align-items:center; gap:8px">
              <span style="font-size:0.75rem; color:var(--text-muted);
                    text-transform:uppercase; letter-spacing:0.5px; font-weight:600">
                ${m.home_team}
              </span>
              <div style="display:flex; align-items:center; gap:6px">
                <button class="stepper-btn"
                        onclick="changeScore('res-home-${m.id}', -1)">-</button>
                <input type="number" id="res-home-${m.id}"
                       value="${currentHome}" min="0" max="20"
                       style="width:64px; background:var(--dark);
                              border:2px solid var(--green); border-radius:10px;
                              padding:10px; color:var(--text); font-size:1.4rem;
                              font-weight:800; text-align:center; outline:none"
                       oninput="checkDrawPenalties(${m.id})">
                <button class="stepper-btn"
                        onclick="changeScore('res-home-${m.id}', 1);
                                 checkDrawPenalties(${m.id})">+</button>
              </div>
            </div>

            <span style="font-size:1.8rem; color:var(--text-muted);
                         font-weight:800; padding-bottom:10px">-</span>

            <!-- Away score -->
            <div style="display:flex; flex-direction:column; align-items:center; gap:8px">
              <span style="font-size:0.75rem; color:var(--text-muted);
                    text-transform:uppercase; letter-spacing:0.5px; font-weight:600">
                ${m.away_team}
              </span>
              <div style="display:flex; align-items:center; gap:6px">
                <button class="stepper-btn"
                        onclick="changeScore('res-away-${m.id}', -1);
                                 checkDrawPenalties(${m.id})">-</button>
                <input type="number" id="res-away-${m.id}"
                       value="${currentAway}" min="0" max="20"
                       style="width:64px; background:var(--dark);
                              border:2px solid var(--green); border-radius:10px;
                              padding:10px; color:var(--text); font-size:1.4rem;
                              font-weight:800; text-align:center; outline:none"
                       oninput="checkDrawPenalties(${m.id})">
                <button class="stepper-btn"
                        onclick="changeScore('res-away-${m.id}', 1);
                                 checkDrawPenalties(${m.id})">+</button>
              </div>
            </div>

            <!-- Save button -->
            <div style="margin-left:auto; padding-bottom:4px">
              <button class="btn btn-primary"
                      id="save-btn-${m.id}"
                      onclick="saveResult(${m.id})">
                ${isFinished ? 'Update Score' : 'Go Live'}
              </button>
            </div>

          </div>

          <!-- Penalties section — shows when scores are equal -->
          <div id="pen-section-${m.id}"
               style="display:${isDraw || currentHome === currentAway && currentHome !== '' ? 'block' : 'none'};
                      background:var(--dark-3); border:1px solid var(--border);
                      border-radius:12px; padding:16px">
            <div style="font-size:0.82rem; font-weight:700; color:var(--text-muted);
                 text-transform:uppercase; letter-spacing:0.5px; margin-bottom:12px">
              Draw - Penalties Winner (optional)
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center">
              <label style="display:flex; align-items:center; gap:8px;
                     cursor:pointer; padding:10px 16px;
                     background:var(--dark); border:2px solid ${penWinner === 'home' ? 'var(--green)' : 'var(--border)'};
                     border-radius:10px; transition:all 0.2s"
                     id="pen-home-label-${m.id}">
                <input type="radio" name="penalties-${m.id}" value="home"
                       id="pen-home-${m.id}"
                       ${penWinner === 'home' ? 'checked' : ''}
                       onchange="updatePenLabel(${m.id})"
                       style="accent-color:var(--green)">
                <span style="font-weight:700">${m.home_team} wins on pens</span>
              </label>

              <label style="display:flex; align-items:center; gap:8px;
                     cursor:pointer; padding:10px 16px;
                     background:var(--dark); border:2px solid ${penWinner === 'away' ? 'var(--green)' : 'var(--border)'};
                     border-radius:10px; transition:all 0.2s"
                     id="pen-away-label-${m.id}">
                <input type="radio" name="penalties-${m.id}" value="away"
                       id="pen-away-${m.id}"
                       ${penWinner === 'away' ? 'checked' : ''}
                       onchange="updatePenLabel(${m.id})"
                       style="accent-color:var(--green)">
                <span style="font-weight:700">${m.away_team} wins on pens</span>
              </label>

              <label style="display:flex; align-items:center; gap:8px;
                     cursor:pointer; padding:10px 16px;
                     background:var(--dark); border:2px solid ${!penWinner ? 'var(--green)' : 'var(--border)'};
                     border-radius:10px; transition:all 0.2s"
                     id="pen-none-label-${m.id}">
                <input type="radio" name="penalties-${m.id}" value="none"
                       id="pen-none-${m.id}"
                       ${!penWinner ? 'checked' : ''}
                       onchange="updatePenLabel(${m.id})"
                       style="accent-color:var(--green)">
                <span style="font-weight:700">No penalties</span>
              </label>
            </div>

            <div style="margin-top:10px; font-size:0.78rem; color:var(--text-muted)">
              If selected, players who predicted the draw correctly AND
              the penalties winner get bonus points.
            </div>
          </div>

        </div>`;
    });
  });

  container.innerHTML = html;
}

// Show/hide penalties section when scores become equal
function checkDrawPenalties(matchId) {
  const home    = document.getElementById(`res-home-${matchId}`).value;
  const away    = document.getElementById(`res-away-${matchId}`).value;
  const section = document.getElementById(`pen-section-${matchId}`);
  if (!section) return;

  if (home !== '' && away !== '' && Number(home) === Number(away)) {
    section.style.display = 'block';
  } else {
    section.style.display = 'none';
  }
}

// Update radio button border colors
function updatePenLabel(matchId) {
  const selected = document.querySelector(
    `input[name="penalties-${matchId}"]:checked`
  )?.value;

  ['home', 'away', 'none'].forEach(opt => {
    const label = document.getElementById(`pen-${opt}-label-${matchId}`);
    if (label) {
      label.style.borderColor = selected === opt
        ? 'var(--green)'
        : 'var(--border)';
    }
  });
}

function changeScore(inputId, delta) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = Math.max(0, Math.min(20, (parseInt(input.value) || 0) + delta));
}

// ============================================
// SAVE RESULT
// ============================================
async function saveResult(matchId) {
  const homeScore = parseInt(document.getElementById(`res-home-${matchId}`).value);
  const awayScore = parseInt(document.getElementById(`res-away-${matchId}`).value);
  const btn       = document.getElementById(`save-btn-${matchId}`);

  if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
    showToast('Enter valid scores!', 'error');
    return;
  }

  // Get penalties winner if applicable
  const penRadio = document.querySelector(
    `input[name="penalties-${matchId}"]:checked`
  );
  const penVal           = penRadio?.value || 'none';
  const penaltiesWinner  = (penVal === 'none') ? null : penVal;

  btn.disabled    = true;
  btn.textContent = 'Saving...';

  // Update match
  const { error: matchError } = await _db
    .from('matches')
    .update({
      home_score:        homeScore,
      away_score:        awayScore,
      is_finished:       true,
      penalties_winner:  penaltiesWinner
    })
    .eq('id', matchId);

  if (matchError) {
    showToast('Error: ' + matchError.message, 'error');
    btn.disabled    = false;
    btn.textContent = 'Update Score';
    return;
  }

  // Get predictions
  const { data: preds } = await _db
    .from('predictions')
    .select('id, user_id, predicted_home, predicted_away, predicted_penalties, points_earned')
    .eq('match_id', matchId);

  if (!preds || preds.length === 0) {
    showToast('Score saved! No predictions to score.');
    await loadAll();
    return;
  }

  // Get jokers
  const { data: jokers } = await _db
    .from('jokers')
    .select('user_id')
    .eq('match_id', matchId);

  const jokerUserIds = new Set((jokers || []).map(j => j.user_id));

  for (const p of preds) {
    const basePoints = calculatePoints(p, homeScore, awayScore, penaltiesWinner);
    const newPoints  = jokerUserIds.has(p.user_id) ? basePoints * 2 : basePoints;
    const oldPoints  = p.points_earned || 0;
    const diff       = newPoints - oldPoints;

    await _db
      .from('predictions')
      .update({ points_earned: newPoints })
      .eq('id', p.id);

    if (diff !== 0) {
      const { data: profile } = await _db
        .from('profiles')
        .select('total_points')
        .eq('id', p.user_id)
        .single();

      await _db
        .from('profiles')
        .update({ total_points: Math.max(0, (profile?.total_points || 0) + diff) })
        .eq('id', p.user_id);
    }
  }

  showToast('Score saved! ' + preds.length + ' predictions scored.');
  await loadAll();
}

// ============================================
// REVERT MATCH
// ============================================
async function unfinishMatch(matchId) {
  if (!confirm('Revert this match and remove all points earned from it?')) return;

  const { data: preds } = await _db
    .from('predictions')
    .select('id, user_id, points_earned')
    .eq('match_id', matchId);

  if (preds && preds.length > 0) {
    for (const p of preds) {
      if (p.points_earned > 0) {
        const { data: profile } = await _db
          .from('profiles')
          .select('total_points')
          .eq('id', p.user_id)
          .single();

        await _db
          .from('profiles')
          .update({ total_points: Math.max(0, (profile?.total_points || 0) - p.points_earned) })
          .eq('id', p.user_id);
      }
      await _db.from('predictions').update({ points_earned: 0 }).eq('id', p.id);
    }
  }

  await _db
    .from('matches')
    .update({ home_score: null, away_score: null, is_finished: false, penalties_winner: null })
    .eq('id', matchId);

  showToast('Match reverted');
  await loadAll();
}

// ============================================
// TOAST
// ============================================
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = (type === 'success' ? 'Done: ' : 'Error: ') + msg;
  toast.className   = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 3500);
}

init();
