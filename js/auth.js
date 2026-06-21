// ============================================
// AUTH.JS
// ============================================

const _sbUrl = 'https://bpmmimvlwuokipawabrk.supabase.co';
const _sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwbW1pbXZsd3Vva2lwYXdhYnJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjE5NTMsImV4cCI6MjA5NzQzNzk1M30.U9S3vUNhyuqqirMNdamRBqdh67JbHNatBkQvdF3qu3k';

// Use a unique name so it never clashes with anything
const _authClient = window.supabase.createClient(_sbUrl, _sbKey);

const ADMIN_IDS = ['9770886f-9c12-4b26-b93f-f355f99e959e'];

// ---- Session check ----
async function requireAuth() {
  const { data: { session } } = await _authClient.auth.getSession();
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
  return session;
}

// ---- Logout ----
async function logout() {
  await _authClient.auth.signOut();
  window.location.href = 'login.html';
}

// ---- Tab switcher ----
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

// ---- Login ----
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');

  btn.disabled = true;
  btn.textContent = 'Logging in...';
  hideMessages();

  const { error } = await _authClient.auth.signInWithPassword({ email, password });

  if (error) {
    showError(error.message);
    btn.disabled = false;
    btn.textContent = 'Login';
  } else {
    window.location.href = 'predict.html';
  }
}

// ---- Signup ----
async function handleSignup(e) {
  e.preventDefault();
  const username = document.getElementById('signup-username').value.trim();
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const btn = document.getElementById('signup-btn');

  btn.disabled = true;
  btn.textContent = 'Creating account...';
  hideMessages();

  const { error } = await _authClient.auth.signUp({
    email,
    password,
    options: { data: { username } }
  });

  if (error) {
    showError(error.message);
    btn.disabled = false;
    btn.textContent = 'Create Account';
  } else {
    showSuccess('Account created! You can now login.');
    btn.disabled = false;
    btn.textContent = 'Create Account';
    switchTab('login');
  }
}

// ---- Messages ----
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

// ---- Toast ----
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = (type === 'success' ? '✅ ' : '❌ ') + msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// ---- Auto redirect if already logged in ----
if (window.location.pathname.includes('login.html')) {
  _authClient.auth.getSession().then(({ data: { session } }) => {
    if (session) window.location.href = 'predict.html';
  });
}
