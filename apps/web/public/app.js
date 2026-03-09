const API_BASE = localStorage.getItem('cm_api_base') || (window.location.hostname === 'localhost' ? 'http://localhost:8080' : 'https://commentmint-api.onrender.com');
const TIMEOUT_MS = 20000;

const state = {
  token: localStorage.getItem('cm_token') || '',
  apiKey: localStorage.getItem('cm_api_key') || '',
  user: null,
  usage: null,
  freeUsed: false,
  plans: [],
  paymentRequest: null
};

const appMessage = document.getElementById('appMessage');
const authMessage = document.getElementById('authMessage');
const navLinks = Array.from(document.querySelectorAll('[data-view-target]'));
const views = {
  home: document.getElementById('view-home'),
  dashboard: document.getElementById('view-dashboard'),
  billing: document.getElementById('view-billing')
};

const connectionBadge = document.getElementById('connectionBadge');
const authActions = document.getElementById('authActions');

const signupForm = document.getElementById('signupForm');
const loginForm = document.getElementById('loginForm');
const signupBtn = document.getElementById('signupBtn');
const loginBtn = document.getElementById('loginBtn');

const sessionText = document.getElementById('sessionText');
const usageText = document.getElementById('usageText');
const usageBar = document.getElementById('usageBar');
const apiUrlField = document.getElementById('apiUrlField');
const apiKeyField = document.getElementById('apiKeyField');
const generateKeyBtn = document.getElementById('generateKeyBtn');
const copyUrlBtn = document.getElementById('copyUrlBtn');
const copyKeyBtn = document.getElementById('copyKeyBtn');
const jobsList = document.getElementById('jobsList');

const plansGrid = document.getElementById('plansGrid');
const paymentText = document.getElementById('paymentText');
const upiLink = document.getElementById('upiLink');
const upiQr = document.getElementById('upiQr');
const pendingPayment = document.getElementById('pendingPayment');
const utrInput = document.getElementById('utrInput');
const confirmPaymentBtn = document.getElementById('confirmPaymentBtn');

apiUrlField.value = API_BASE;
if (state.apiKey) apiKeyField.value = state.apiKey;

function setSessionToken(token) {
  state.token = token || '';
  if (token) localStorage.setItem('cm_token', token);
  else localStorage.removeItem('cm_token');
}

function setApiKey(apiKey) {
  state.apiKey = apiKey || '';
  if (state.apiKey) localStorage.setItem('cm_api_key', state.apiKey);
  else localStorage.removeItem('cm_api_key');
  apiKeyField.value = state.apiKey;
}

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

function setMessage(text, type = 'ok', target = appMessage) {
  target.textContent = text;
  target.classList.remove('hidden', 'ok', 'error');
  target.classList.add(type);
}

function clearMessage(target = appMessage) {
  target.textContent = '';
  target.classList.remove('ok', 'error');
  target.classList.add('hidden');
}

function setButtonLoading(button, loading, loadingText, defaultText) {
  if (loading) {
    button.disabled = true;
    button.dataset.defaultText = defaultText || button.textContent;
    button.textContent = loadingText;
    return;
  }
  button.disabled = false;
  button.textContent = button.dataset.defaultText || defaultText || button.textContent;
}

async function fetchJson(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}${path}`, { ...options, signal: controller.signal });
    let data = {};
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) throw new Error(data.message || data.error || `Request failed (${response.status})`);
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timeout. Please retry.');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function switchView(viewName) {
  Object.entries(views).forEach(([name, el]) => el.classList.toggle('is-active', name === viewName));
  navLinks.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.viewTarget === viewName));
}

function ensureAuthFor() {
  if (state.token) return true;
  switchView('home');
  setMessage('Please sign in first.', 'error');
  return false;
}

function renderAuthActions() {
  authActions.innerHTML = '';
  if (!state.token) {
    const note = document.createElement('span');
    note.className = 'muted';
    note.textContent = 'Not signed in';
    authActions.appendChild(note);
    return;
  }

  const userLabel = document.createElement('span');
  userLabel.className = 'muted';
  userLabel.textContent = state.user ? state.user.email : 'Signed in';

  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'btn btn-ghost';
  logoutBtn.type = 'button';
  logoutBtn.textContent = 'Logout';
  logoutBtn.addEventListener('click', () => {
    setSessionToken('');
    setApiKey('');
    state.user = null;
    state.usage = null;
    state.freeUsed = false;
    resetPaymentUi();
    renderAuthActions();
    renderDashboard();
    switchView('home');
    setMessage('Logged out.', 'ok');
  });

  authActions.append(userLabel, logoutBtn);
}

function renderDashboard() {
  if (!state.token || !state.user || !state.usage) {
    sessionText.textContent = 'Not logged in';
    usageText.textContent = 'Usage unavailable';
    usageBar.style.width = '0%';
    jobsList.innerHTML = '<li>Login to see scraper job history</li>';
    return;
  }

  const expiry = state.user.expiresAt ? `, expires ${new Date(state.user.expiresAt).toLocaleDateString('en-IN')}` : '';
  const freeInfo = state.user.plan === 'free' ? `, free post used: ${state.freeUsed ? 'yes' : 'no'}` : '';
  sessionText.textContent = `Logged in as ${state.user.email} (${state.user.plan}${expiry}${freeInfo})`;
  usageText.textContent = `Usage ${state.usage.monthKey}: jobs ${state.usage.jobsUsed}, rows ${state.usage.rowsUsed}`;

  const currentPlan = state.plans.find((p) => p.id === state.user.plan);
  const maxJobs = Number(currentPlan?.monthlyJobs || 0);
  const pct = maxJobs > 0 ? Math.min(100, Math.round((state.usage.jobsUsed / maxJobs) * 100)) : 0;
  usageBar.style.width = `${pct}%`;

  apiKeyField.value = state.apiKey || '';
}

function renderJobs(jobs) {
  jobsList.innerHTML = '';
  if (!jobs.length) {
    jobsList.innerHTML = '<li>No scraper jobs yet</li>';
    return;
  }
  jobs.slice(0, 10).forEach((job) => {
    const li = document.createElement('li');
    li.textContent = `${new Date(job.createdAt).toLocaleString('en-IN')} - ${job.rowsCount} rows`;
    jobsList.appendChild(li);
  });
}

function renderPlans() {
  plansGrid.innerHTML = '';
  if (!state.plans.length) {
    plansGrid.innerHTML = '<article class="card"><p class="muted">Plans unavailable.</p></article>';
    return;
  }

  state.plans.forEach((plan) => {
    const card = document.createElement('article');
    card.className = 'card';

    const isCurrent = state.user && state.user.plan === plan.id;
    const isFree = plan.id === 'free';
    const freeTag = plan.oneTimeFreePost ? ' (1 post total)' : '';

    card.innerHTML = `
      <h3>${plan.label}${freeTag}</h3>
      <p><strong>Rs ${plan.priceInr}</strong>${plan.durationDays ? ` / ${plan.durationDays} days` : ''}</p>
      <p class="muted">${plan.monthlyJobs} jobs/month, ${plan.maxRowsPerJob} rows/job</p>
      <button class="btn ${isCurrent || isFree ? 'btn-ghost' : 'btn-primary'}" data-plan="${plan.id}" ${isCurrent || isFree ? 'disabled' : ''}>
        ${isCurrent ? 'Current plan' : isFree ? 'Free plan' : 'Pay with UPI'}
      </button>
    `;

    plansGrid.appendChild(card);
  });

  Array.from(document.querySelectorAll('[data-plan]')).forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!ensureAuthFor()) return;
      await createPaymentRequest(btn.dataset.plan, btn);
    });
  });
}

function resetPaymentUi() {
  state.paymentRequest = null;
  paymentText.textContent = 'Select a paid plan to generate UPI request.';
  upiLink.classList.add('hidden');
  upiLink.removeAttribute('href');
  upiQr.classList.add('hidden');
  upiQr.removeAttribute('src');
  pendingPayment.textContent = '';
}

async function refreshSessionData() {
  if (!state.token) {
    state.user = null;
    state.usage = null;
    state.freeUsed = false;
    return;
  }

  const meResp = await fetchJson('/me', { headers: authHeaders() });
  state.user = meResp.user;
  state.usage = meResp.usage;
  state.freeUsed = Boolean(meResp.freeUsed);

  try {
    const jobsResp = await fetchJson('/jobs', { headers: authHeaders() });
    renderJobs(jobsResp.jobs || []);
  } catch {
    renderJobs([]);
  }
}

async function loadInitialData() {
  try {
    const plansResp = await fetchJson('/plans');
    state.plans = plansResp.plans || [];
    connectionBadge.textContent = 'API connected';
    connectionBadge.style.color = '#065f46';
  } catch {
    state.plans = [];
    connectionBadge.textContent = 'API unavailable';
    connectionBadge.style.color = '#9f1239';
  }

  try {
    await refreshSessionData();
  } catch {
    setSessionToken('');
    setApiKey('');
    state.user = null;
    state.usage = null;
    state.freeUsed = false;
  }

  renderAuthActions();
  renderDashboard();
  renderPlans();
}

async function generateApiKey() {
  if (!ensureAuthFor()) return;

  setButtonLoading(generateKeyBtn, true, 'Generating...', 'Generate API Key');
  try {
    const res = await fetchJson('/auth/api-key/rotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() }
    });

    setApiKey(res.apiKey || '');
    setMessage('API key generated. Paste it in extension popup.', 'ok');
    switchView('dashboard');
  } catch (err) {
    setMessage(`API key generation failed: ${err.message}`, 'error');
  } finally {
    setButtonLoading(generateKeyBtn, false, '', 'Generate API Key');
  }
}

async function copyText(text, label) {
  if (!text) {
    setMessage(`${label} is empty.`, 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    setMessage(`${label} copied.`, 'ok');
  } catch {
    setMessage(`Could not copy ${label.toLowerCase()}.`, 'error');
  }
}

async function createPaymentRequest(plan, triggerBtn) {
  setButtonLoading(triggerBtn, true, 'Creating...', triggerBtn.textContent);
  try {
    const req = await fetchJson('/billing/upi/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ plan })
    });

    state.paymentRequest = req;
    paymentText.textContent = `Pay Rs ${req.amountInr} for ${req.plan}. Payment ID: ${req.paymentId}`;
    upiLink.href = req.upiIntent;
    upiLink.classList.remove('hidden');
    upiQr.src = req.qrImageUrl;
    upiQr.classList.remove('hidden');
    pendingPayment.textContent = `Pending payment: ${req.paymentId} (expires ${new Date(req.expiresAt).toLocaleString('en-IN')})`;

    setMessage('Payment request created. Complete payment and confirm UTR.', 'ok');
    switchView('billing');
  } catch (err) {
    setMessage(`Payment request failed: ${err.message}`, 'error');
  } finally {
    setButtonLoading(triggerBtn, false, '', triggerBtn.dataset.defaultText);
  }
}

async function confirmPayment() {
  if (!ensureAuthFor()) return;
  if (!state.paymentRequest?.paymentId) {
    setMessage('Create a payment request first.', 'error');
    return;
  }

  const utr = (utrInput.value || '').trim();
  if (utr.length < 8) {
    setMessage('Enter a valid UTR/transaction ID.', 'error');
    return;
  }

  setButtonLoading(confirmPaymentBtn, true, 'Confirming...', 'Confirm and Activate');
  try {
    const resp = await fetchJson('/billing/upi/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ paymentId: state.paymentRequest.paymentId, utr })
    });

    setMessage(`Payment confirmed. Plan ${resp.plan} active.`, 'ok');
    utrInput.value = '';
    resetPaymentUi();
    await loadInitialData();
  } catch (err) {
    setMessage(`Payment confirm failed: ${err.message}`, 'error');
  } finally {
    setButtonLoading(confirmPaymentBtn, false, '', 'Confirm and Activate');
  }
}

navLinks.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.viewTarget;
    if ((target === 'dashboard' || target === 'billing') && !ensureAuthFor()) return;
    switchView(target);
    clearMessage();
  });
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(signupForm);
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');

  if (!email || password.length < 8) {
    setMessage('Use valid email and 8+ char password.', 'error', authMessage);
    return;
  }

  setButtonLoading(signupBtn, true, 'Signing up...', 'Sign up');
  try {
    const res = await fetchJson('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    setSessionToken(res.token);
    setApiKey(res.apiKey || '');
    setMessage('Account created. API key is ready in Dashboard.', 'ok', authMessage);
    await loadInitialData();
    switchView('dashboard');
  } catch (err) {
    setMessage(`Signup failed: ${err.message}`, 'error', authMessage);
  } finally {
    setButtonLoading(signupBtn, false, '', 'Sign up');
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(loginForm);
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');

  if (!email || !password) {
    setMessage('Enter both email and password.', 'error', authMessage);
    return;
  }

  setButtonLoading(loginBtn, true, 'Logging in...', 'Log in');
  try {
    const res = await fetchJson('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    setSessionToken(res.token);
    setApiKey(localStorage.getItem('cm_api_key') || '');
    setMessage('Logged in. Generate API key from Dashboard if needed.', 'ok', authMessage);
    await loadInitialData();
    switchView('dashboard');
  } catch (err) {
    setMessage(`Login failed: ${err.message}`, 'error', authMessage);
  } finally {
    setButtonLoading(loginBtn, false, '', 'Log in');
  }
});

generateKeyBtn.addEventListener('click', generateApiKey);
copyUrlBtn.addEventListener('click', () => copyText(API_BASE, 'API URL'));
copyKeyBtn.addEventListener('click', () => copyText(state.apiKey, 'API key'));
confirmPaymentBtn.addEventListener('click', confirmPayment);

(async function init() {
  await loadInitialData();
})();
