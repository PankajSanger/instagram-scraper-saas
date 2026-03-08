const API_BASE = localStorage.getItem('cm_api_base') || (window.location.hostname === 'localhost' ? 'http://localhost:8080' : 'https://api.yourdomain.com');

const sessionText = document.getElementById('sessionText');
const usageText = document.getElementById('usageText');
const apiKeyText = document.getElementById('apiKeyText');
const paymentText = document.getElementById('paymentText');
const upiLink = document.getElementById('upiLink');
const upiQr = document.getElementById('upiQr');
const jobsList = document.getElementById('jobs');
const authSection = document.getElementById('auth');

const showAuthBtn = document.getElementById('showAuth');
const signupForm = document.getElementById('signupForm');
const loginForm = document.getElementById('loginForm');
const rotateApiKeyBtn = document.getElementById('rotateApiKey');
const planButtons = Array.from(document.querySelectorAll('.plan-btn'));

function getToken() {
  return localStorage.getItem('cm_token') || '';
}

function setSession(token, apiKey) {
  localStorage.setItem('cm_token', token);
  if (apiKey) localStorage.setItem('cm_api_key', apiKey);
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}

function resetPaymentUi() {
  upiLink.classList.add('hidden');
  upiLink.href = '#';
  upiQr.classList.add('hidden');
  upiQr.src = '';
}

async function refreshDashboard() {
  const token = getToken();
  if (!token) {
    sessionText.textContent = 'Not logged in';
    usageText.textContent = 'Usage unavailable';
    apiKeyText.textContent = 'API key: sign up to generate';
    paymentText.textContent = 'Sign in to create UPI payment request.';
    jobsList.innerHTML = '<li>Log in to view jobs</li>';
    resetPaymentUi();
    return;
  }

  try {
    const me = await fetchJson(`${API_BASE}/me`, { headers: { ...authHeaders() } });
    const expiry = me.user.expiresAt ? `, expires ${new Date(me.user.expiresAt).toLocaleDateString('en-IN')}` : '';
    sessionText.textContent = `Logged in as ${me.user.email} (${me.user.plan}${expiry})`;
    usageText.textContent = `Usage ${me.usage.monthKey}: jobs ${me.usage.jobsUsed}, rows ${me.usage.rowsUsed}`;

    const apiKey = localStorage.getItem('cm_api_key');
    apiKeyText.textContent = apiKey ? `API key: ${apiKey}` : 'API key hidden. Rotate to generate.';

    const jobs = await fetchJson(`${API_BASE}/jobs`, { headers: { ...authHeaders() } });
    jobsList.innerHTML = '';
    if (!jobs.jobs.length) {
      jobsList.innerHTML = '<li>No jobs yet</li>';
    } else {
      jobs.jobs.slice(0, 10).forEach((job) => {
        const li = document.createElement('li');
        li.textContent = `${new Date(job.createdAt).toLocaleString('en-IN')} - ${job.rowsCount} rows`;
        jobsList.appendChild(li);
      });
    }
  } catch (err) {
    sessionText.textContent = `Session error: ${err.message}`;
  }
}

showAuthBtn.addEventListener('click', () => {
  authSection.classList.toggle('hidden');
});

signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(signupForm);
  try {
    const data = await fetchJson(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password')
      })
    });

    setSession(data.token, data.apiKey);
    await refreshDashboard();
    alert('Account created. API key is ready in dashboard.');
  } catch (err) {
    alert(`Signup failed: ${err.message}`);
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(loginForm);
  try {
    const data = await fetchJson(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password')
      })
    });

    setSession(data.token);
    await refreshDashboard();
  } catch (err) {
    alert(`Login failed: ${err.message}`);
  }
});

rotateApiKeyBtn.addEventListener('click', async () => {
  try {
    const data = await fetchJson(`${API_BASE}/auth/api-key/rotate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders()
      }
    });

    localStorage.setItem('cm_api_key', data.apiKey);
    await refreshDashboard();
  } catch (err) {
    alert(`Rotate failed: ${err.message}`);
  }
});

planButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    const plan = button.dataset.plan;
    if (plan === 'free') return;

    try {
      const request = await fetchJson(`${API_BASE}/billing/upi/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify({ plan })
      });

      paymentText.textContent = `Pay Rs ${request.amountInr} for ${request.plan}. Payment ID: ${request.paymentId}`;
      upiLink.href = request.upiIntent;
      upiLink.classList.remove('hidden');
      upiQr.src = request.qrImageUrl;
      upiQr.classList.remove('hidden');

      const utr = window.prompt('After payment, paste UTR/UPI transaction ID to activate your plan:');
      if (!utr) {
        alert('You can confirm later by creating a fresh payment request.');
        return;
      }

      const confirm = await fetchJson(`${API_BASE}/billing/upi/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify({ paymentId: request.paymentId, utr })
      });

      await refreshDashboard();
      alert(`Payment confirmed. Plan ${confirm.plan} active until ${new Date(confirm.expiresAt).toLocaleDateString('en-IN')}.`);
    } catch (err) {
      alert(`UPI flow failed: ${err.message}`);
    }
  });
});

refreshDashboard();
