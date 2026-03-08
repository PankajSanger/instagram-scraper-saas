const API_BASE = localStorage.getItem('cm_api_base') || (window.location.hostname === 'localhost' ? 'http://localhost:8080' : 'https://commentmint-api.onrender.com');
const REQUEST_TIMEOUT_MS = 15000;

const authSection = document.getElementById('auth');
const showAuthBtn = document.getElementById('showAuth');
const authMessage = document.getElementById('authMessage');
const globalMessage = document.getElementById('globalMessage');
const connectionBadge = document.getElementById('connectionBadge');

const signupForm = document.getElementById('signupForm');
const loginForm = document.getElementById('loginForm');
const signupBtn = document.getElementById('signupBtn');
const loginBtn = document.getElementById('loginBtn');

const sessionText = document.getElementById('sessionText');
const usageText = document.getElementById('usageText');
const usageFill = document.getElementById('usageFill');
const apiKeyText = document.getElementById('apiKeyText');

const copyApiKeyBtn = document.getElementById('copyApiKey');
const rotateApiKeyBtn = document.getElementById('rotateApiKey');
const logoutBtn = document.getElementById('logoutBtn');

const plansGrid = document.getElementById('plansGrid');
const paymentText = document.getElementById('paymentText');
const upiLink = document.getElementById('upiLink');
const upiQr = document.getElementById('upiQr');
const pendingPayment = document.getElementById('pendingPayment');
const utrInput = document.getElementById('utrInput');
const confirmUtrBtn = document.getElementById('confirmUtrBtn');

const jobsList = document.getElementById('jobs');

const state = {
  token: localStorage.getItem('cm_token') || '',
  apiKey: localStorage.getItem('cm_api_key') || '',
  plans: [],
  paymentRequest: null,
  user: null
};

function setSession(token, apiKey) {
  state.token = token || '';
  if (token) {
    localStorage.setItem('cm_token', token);
  } else {
    localStorage.removeItem('cm_token');
  }

  if (typeof apiKey === 'string') {
    state.apiKey = apiKey;
    if (apiKey) localStorage.setItem('cm_api_key', apiKey);
    else localStorage.removeItem('cm_api_key');
  }
}

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

function formatDate(dateLike) {
  if (!dateLike) return 'N/A';
  return new Date(dateLike).toLocaleString('en-IN');
}

function showMessage(element, text, type = '') {
  element.textContent = text;
  element.classList.remove('hidden', 'ok', 'error');
  if (type) element.classList.add(type);
}

function hideMessage(element) {
  element.classList.add('hidden');
  element.classList.remove('ok', 'error');
  element.textContent = '';
}

function setButtonLoading(button, isLoading, loadingText, defaultText) {
  if (isLoading) {
    button.disabled = true;
    button.dataset.defaultText = defaultText || button.textContent;
    button.textContent = loadingText;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.defaultText || defaultText || button.textContent;
  }
}

async function fetchJson(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal
    });

    let data = {};
    try {
      data = await response.json();
    } catch (e) {
      data = {};
    }

    if (!response.ok) {
      const message = data.message || data.error || `Request failed (${response.status})`;
      throw new Error(message);
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function renderConnectionBadge(ok, text) {
  connectionBadge.textContent = text;
  connectionBadge.style.background = ok ? '#eafcf4' : '#fff2db';
  connectionBadge.style.color = ok ? '#165b45' : '#83510d';
  connectionBadge.style.borderColor = ok ? '#b8ebd3' : '#efdbbe';
}

function resetPaymentUi() {
  upiLink.classList.add('hidden');
  upiLink.href = '#';
  upiQr.classList.add('hidden');
  upiQr.src = '';
  pendingPayment.textContent = '';
  state.paymentRequest = null;
}

function setLoggedOutView() {
  state.user = null;
  sessionText.textContent = 'Not logged in';
  usageText.textContent = 'Usage unavailable';
  usageFill.style.width = '0%';
  apiKeyText.textContent = 'API key: sign up to generate';
  jobsList.innerHTML = '<li>Log in to view jobs</li>';
  resetPaymentUi();
}

function renderUsage(usage, planConfig) {
  if (!usage || !planConfig) {
    usageFill.style.width = '0%';
    return;
  }

  const monthlyLimit = Number(planConfig.monthlyJobs || 0);
  const used = Number(usage.jobsUsed || 0);
  const percent = monthlyLimit > 0 ? Math.min(100, Math.round((used / monthlyLimit) * 100)) : 0;
  usageFill.style.width = `${percent}%`;
}

function renderPlans() {
  plansGrid.innerHTML = '';
  if (!state.plans.length) {
    plansGrid.innerHTML = '<p class="muted">Plans unavailable. Check API connection.</p>';
    return;
  }

  state.plans.forEach((plan) => {
    const article = document.createElement('article');
    article.className = 'panel';

    const isCurrent = state.user && state.user.plan === plan.id;
    const isFree = plan.id === 'free';

    article.innerHTML = `
      <h3>${plan.label}</h3>
      <p><strong>Rs ${plan.priceInr}</strong>${plan.durationDays ? ` / ${plan.durationDays} days` : ''}</p>
      <p class="small muted">${plan.monthlyJobs} jobs/month, ${plan.maxRowsPerJob} rows/job</p>
      <button class="btn ${isCurrent || isFree ? 'btn-ghost' : 'btn-primary'}" data-upgrade-plan="${plan.id}" ${isCurrent || isFree ? 'disabled' : ''}>
        ${isCurrent ? 'Current plan' : isFree ? 'Free plan' : 'Pay with UPI'}
      </button>
    `;

    plansGrid.appendChild(article);
  });
}

function renderJobs(jobs) {
  jobsList.innerHTML = '';
  if (!jobs || !jobs.length) {
    jobsList.innerHTML = '<li>No jobs yet</li>';
    return;
  }

  jobs.slice(0, 10).forEach((job) => {
    const li = document.createElement('li');
    li.textContent = `${formatDate(job.createdAt)} - ${job.rowsCount} rows`;
    jobsList.appendChild(li);
  });
}

function attachPlanActions() {
  const buttons = Array.from(document.querySelectorAll('[data-upgrade-plan]'));
  buttons.forEach((button) => {
    button.addEventListener('click', async () => {
      if (!state.token) {
        showMessage(globalMessage, 'Please log in first to upgrade your plan.', 'error');
        return;
      }

      const plan = button.dataset.upgradePlan;
      await createPaymentRequest(plan, button);
    });
  });
}

async function loadPlans() {
  try {
    const result = await fetchJson('/plans');
    state.plans = Array.isArray(result.plans) ? result.plans : [];
    renderPlans();
    attachPlanActions();
    renderConnectionBadge(true, 'API: connected');
  } catch (error) {
    renderConnectionBadge(false, 'API: unavailable');
    state.plans = [];
    renderPlans();
  }
}

async function refreshDashboard() {
  if (!state.token) {
    setLoggedOutView();
    renderPlans();
    attachPlanActions();
    return;
  }

  try {
    const me = await fetchJson('/me', { headers: { ...authHeaders() } });
    state.user = me.user;

    const expiry = me.user.expiresAt ? `, expires ${new Date(me.user.expiresAt).toLocaleDateString('en-IN')}` : '';
    sessionText.textContent = `Logged in as ${me.user.email} (${me.user.plan}${expiry})`;
    usageText.textContent = `Usage ${me.usage.monthKey}: jobs ${me.usage.jobsUsed}, rows ${me.usage.rowsUsed}`;

    const planConfig = state.plans.find((p) => p.id === me.user.plan);
    renderUsage(me.usage, planConfig);

    apiKeyText.textContent = state.apiKey ? `API key: ${state.apiKey}` : 'API key hidden. Rotate to generate.';

    const jobs = await fetchJson('/jobs', { headers: { ...authHeaders() } });
    renderJobs(jobs.jobs);

    renderPlans();
    attachPlanActions();

    hideMessage(globalMessage);
  } catch (error) {
    showMessage(globalMessage, `Unable to load dashboard: ${error.message}`, 'error');
  }
}

async function createPaymentRequest(plan, button) {
  setButtonLoading(button, true, 'Creating request...', button.textContent);

  try {
    const request = await fetchJson('/billing/upi/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders()
      },
      body: JSON.stringify({ plan })
    });

    state.paymentRequest = request;
    paymentText.textContent = `Pay Rs ${request.amountInr} for ${request.plan}. Payment ID: ${request.paymentId}`;
    upiLink.href = request.upiIntent;
    upiLink.classList.remove('hidden');
    upiQr.src = request.qrImageUrl;
    upiQr.classList.remove('hidden');
    pendingPayment.textContent = `Pending payment: ${request.paymentId} (expires ${formatDate(request.expiresAt)})`;

    showMessage(globalMessage, 'Payment request created. Complete payment in UPI app, then submit UTR below.', 'ok');
  } catch (error) {
    showMessage(globalMessage, `Could not create payment request: ${error.message}`, 'error');
  } finally {
    setButtonLoading(button, false, '', button.dataset.defaultText);
  }
}

async function confirmPayment() {
  if (!state.token) {
    showMessage(globalMessage, 'Please log in to confirm payment.', 'error');
    return;
  }

  if (!state.paymentRequest || !state.paymentRequest.paymentId) {
    showMessage(globalMessage, 'Please create a payment request first.', 'error');
    return;
  }

  const utr = (utrInput.value || '').trim();
  if (utr.length < 8) {
    showMessage(globalMessage, 'Please enter a valid UTR/transaction ID.', 'error');
    return;
  }

  setButtonLoading(confirmUtrBtn, true, 'Confirming...', 'Confirm and Activate Plan');

  try {
    const confirmed = await fetchJson('/billing/upi/confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders()
      },
      body: JSON.stringify({
        paymentId: state.paymentRequest.paymentId,
        utr
      })
    });

    utrInput.value = '';
    showMessage(globalMessage, `Payment confirmed. Plan ${confirmed.plan} active until ${new Date(confirmed.expiresAt).toLocaleDateString('en-IN')}.`, 'ok');
    resetPaymentUi();
    await refreshDashboard();
  } catch (error) {
    showMessage(globalMessage, `Payment confirmation failed: ${error.message}`, 'error');
  } finally {
    setButtonLoading(confirmUtrBtn, false, '', 'Confirm and Activate Plan');
  }
}

async function rotateApiKey() {
  if (!state.token) {
    showMessage(globalMessage, 'Please log in to rotate API key.', 'error');
    return;
  }

  setButtonLoading(rotateApiKeyBtn, true, 'Rotating...', 'Rotate API Key');

  try {
    const data = await fetchJson('/auth/api-key/rotate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders()
      }
    });

    setSession(state.token, data.apiKey);
    apiKeyText.textContent = `API key: ${data.apiKey}`;
    showMessage(globalMessage, 'API key rotated successfully.', 'ok');
  } catch (error) {
    showMessage(globalMessage, `Could not rotate API key: ${error.message}`, 'error');
  } finally {
    setButtonLoading(rotateApiKeyBtn, false, '', 'Rotate API Key');
  }
}

async function copyApiKey() {
  if (!state.apiKey) {
    showMessage(globalMessage, 'No API key found. Rotate to generate one.', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(state.apiKey);
    showMessage(globalMessage, 'API key copied to clipboard.', 'ok');
  } catch (error) {
    showMessage(globalMessage, 'Clipboard copy failed. Please copy manually.', 'error');
  }
}

function logout() {
  setSession('', '');
  setLoggedOutView();
  renderPlans();
  attachPlanActions();
  showMessage(globalMessage, 'Logged out successfully.', 'ok');
}

showAuthBtn.addEventListener('click', () => {
  authSection.classList.toggle('hidden');
  authSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(signupForm);
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');

  if (!email || password.length < 8) {
    showMessage(authMessage, 'Please provide valid email and password (min 8 chars).', 'error');
    return;
  }

  setButtonLoading(signupBtn, true, 'Creating account...', 'Sign up');

  try {
    const data = await fetchJson('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    setSession(data.token, data.apiKey);
    showMessage(authMessage, 'Account created successfully. You are now logged in.', 'ok');
    hideMessage(globalMessage);
    await refreshDashboard();
  } catch (error) {
    showMessage(authMessage, `Signup failed: ${error.message}`, 'error');
  } finally {
    setButtonLoading(signupBtn, false, '', 'Sign up');
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(loginForm);
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');

  if (!email || !password) {
    showMessage(authMessage, 'Please provide both email and password.', 'error');
    return;
  }

  setButtonLoading(loginBtn, true, 'Logging in...', 'Log in');

  try {
    const data = await fetchJson('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    setSession(data.token);
    showMessage(authMessage, 'Logged in successfully.', 'ok');
    await refreshDashboard();
  } catch (error) {
    showMessage(authMessage, `Login failed: ${error.message}`, 'error');
  } finally {
    setButtonLoading(loginBtn, false, '', 'Log in');
  }
});

copyApiKeyBtn.addEventListener('click', copyApiKey);
rotateApiKeyBtn.addEventListener('click', rotateApiKey);
logoutBtn.addEventListener('click', logout);
confirmUtrBtn.addEventListener('click', confirmPayment);

(async function init() {
  renderConnectionBadge(false, 'API: checking...');
  await loadPlans();
  await refreshDashboard();
})();
