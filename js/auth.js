// ============================================
// AUTH.JS - Shared authentication + supabase
// ============================================

const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---- Admin user IDs (add yours after first login) ----
const ADMIN_IDS = ['YOUR_ADMIN_USER_UUID_HERE'];

// ---- Session check (call on protected pages) ----
async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

// ---- Require admin ----
async function requireAdmin() {
  const session = await requireAuth();
  if (!session) return null;
  if (!ADMIN_IDS.includes(session.user.id)) {
    window.location.href = 'predict.html';
    return null;
  }
  return session;
}

// ---- Logout ----
async function logout() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

// ---- LOGIN PAGE functions ----
function switchTab(tab) {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const tabs = document.querySelectorAll('.tab-btn');
  
  if (!loginForm) return;

  hideMessages();

  if (tab === 'login') {
    loginForm.style.display = 'block';
    signupForm.style.display = 'none';
    tabs[0].classList.add('active');
    tabs[1].classList.remove('active');
  } else {
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
    tabs[0].classList.remove('active');
    tabs[1].classList.add('active');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');

  btn.disabled = true;
  btn.textContent = 'Logging in...';
  hideMessages();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    showError(error.message);
    btn.disabled = false;
    btn.textContent = 'Login';
  } else {
    window.location.href = 'predict.html';
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const username = document.getElementById('signup-username').value.trim();
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const btn = document.getElementById('signup-btn');

  btn.disabled = true;
  btn.textContent = 'Creating account...';
  hideMessages();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } }
  });

  if (error) {
    showError(error.message);
    btn.disabled = false;
    btn.textContent = 'Create Account';
  } else {
    showSuccess('Account created! Check your email to confirm, then login.');
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function showSuccess(msg) {
  const el = document.getElementById('success-msg');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function hideMessages() {
  const err = document.getElementById('error-msg');
  const suc = document.getElementById('success-msg');
  if (err) err.style.display = 'none';
  if (suc) suc.style.display = 'none';
}

// ---- Toast notification ----
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = (type === 'success' ? '✅ ' : '❌ ') + msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// ---- Redirect if already logged in (for login page) ----
if (window.location.pathname.includes('login.html')) {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) window.location.href = 'predict.html';
  });
}
