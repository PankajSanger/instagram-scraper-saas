const http = require('http');
const crypto = require('crypto');
const { withDb, readDb } = require('./services/store');
const { hashPassword, verifyPassword, createToken } = require('./services/auth');
const { sendJson, parseJsonBody } = require('./services/http');
const { requireAuth } = require('./middleware/auth');
const { canConsumeUsage, consumeUsage, getMonthKey } = require('./services/usage');
const { createUpiPaymentRequest, confirmUpiPayment, getActiveSubscription, getPublicPlans } = require('./services/upi');

const port = Number(process.env.PORT || 8080);
const jwtSecret = process.env.JWT_SECRET || 'dev-secret';

function getUserSubscription(db, userId) {
  return getActiveSubscription(db, userId);
}

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function generateApiKey() {
  return `igs_${crypto.randomBytes(24).toString('hex')}`;
}

function notFound(res) {
  sendJson(res, 404, { error: 'not_found' });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, service: 'ig-scraper-api', date: new Date().toISOString() });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/plans') {
      sendJson(res, 200, { plans: getPublicPlans(), currency: 'INR' });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/auth/signup') {
      const body = await parseJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');

      if (!email || !password || password.length < 8) {
        sendJson(res, 400, { error: 'invalid_credentials', message: 'Email required and password must be at least 8 chars.' });
        return;
      }

      let output;
      withDb((db) => {
        const exists = db.users.find((u) => u.email === email);
        if (exists) {
          output = { status: 409, body: { error: 'email_taken' } };
          return;
        }

        const userId = crypto.randomUUID();
        const apiKey = generateApiKey();
        const user = {
          id: userId,
          email,
          passwordHash: hashPassword(password),
          apiKeyHash: hashApiKey(apiKey),
          createdAt: new Date().toISOString()
        };

        db.users.push(user);
        db.subscriptions.push({
          userId,
          plan: 'free',
          status: 'active',
          expiresAt: null,
          updatedAt: new Date().toISOString()
        });

        const token = createToken({ userId, email }, jwtSecret);

        output = {
          status: 201,
          body: {
            token,
            user: { id: userId, email, plan: 'free' },
            apiKey
          }
        };
      });

      sendJson(res, output.status, output.body);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/auth/login') {
      const body = await parseJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');

      const db = readDb();
      const user = db.users.find((u) => u.email === email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        sendJson(res, 401, { error: 'invalid_credentials' });
        return;
      }

      const sub = getUserSubscription(db, user.id);
      const token = createToken({ userId: user.id, email: user.email }, jwtSecret);
      sendJson(res, 200, {
        token,
        user: { id: user.id, email: user.email, plan: sub.plan, expiresAt: sub.expiresAt }
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/auth/api-key/rotate') {
      const auth = requireAuth(req, res, sendJson);
      if (!auth) return;

      let result;
      withDb((db) => {
        const user = db.users.find((u) => u.id === auth.userId);
        if (!user) {
          result = { status: 404, body: { error: 'user_not_found' } };
          return;
        }
        const apiKey = generateApiKey();
        user.apiKeyHash = hashApiKey(apiKey);
        result = { status: 200, body: { apiKey } };
      });

      sendJson(res, result.status, result.body);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/me') {
      const auth = requireAuth(req, res, sendJson);
      if (!auth) return;

      const db = readDb();
      const user = db.users.find((u) => u.id === auth.userId);
      if (!user) {
        sendJson(res, 404, { error: 'user_not_found' });
        return;
      }

      const sub = getUserSubscription(db, user.id);
      const monthKey = getMonthKey();
      const usage = db.usage.find((u) => u.userId === user.id && u.monthKey === monthKey) || { jobsUsed: 0, rowsUsed: 0, monthKey };

      sendJson(res, 200, {
        user: { id: user.id, email: user.email, plan: sub.plan, expiresAt: sub.expiresAt },
        usage
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/billing/upi/create') {
      const auth = requireAuth(req, res, sendJson);
      if (!auth) return;
      const body = await parseJsonBody(req);
      const plan = body.plan || 'starter';

      let output;
      withDb((db) => {
        const created = createUpiPaymentRequest({ db, userId: auth.userId, plan });
        if (created.error) {
          output = { status: 400, body: { error: created.error } };
          return;
        }
        output = { status: 201, body: created };
      });

      sendJson(res, output.status, output.body);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/billing/upi/confirm') {
      const auth = requireAuth(req, res, sendJson);
      if (!auth) return;
      const body = await parseJsonBody(req);
      const paymentId = String(body.paymentId || '');
      const utr = String(body.utr || '');

      let output;
      withDb((db) => {
        const result = confirmUpiPayment({ db, userId: auth.userId, paymentId, utr });
        if (result.error) {
          output = { status: 400, body: { error: result.error } };
          return;
        }
        output = {
          status: 200,
          body: {
            ok: true,
            paymentId: result.payment.id,
            plan: result.subscription.plan,
            expiresAt: result.subscription.expiresAt,
            alreadyPaid: result.alreadyPaid
          }
        };
      });

      sendJson(res, output.status, output.body);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/billing/upi/history') {
      const auth = requireAuth(req, res, sendJson);
      if (!auth) return;

      const db = readDb();
      const payments = db.payments
        .filter((p) => p.userId === auth.userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      sendJson(res, 200, { payments });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/scrape-jobs') {
      const apiKeyHeader = req.headers['x-api-key'];
      if (!apiKeyHeader) {
        sendJson(res, 401, { error: 'missing_api_key' });
        return;
      }

      const body = await parseJsonBody(req);
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const metadata = body.metadata || {};

      let output;
      withDb((db) => {
        const apiHash = hashApiKey(String(apiKeyHeader));
        const user = db.users.find((u) => u.apiKeyHash === apiHash);

        if (!user) {
          output = { status: 401, body: { error: 'invalid_api_key' } };
          return;
        }

        const sub = getUserSubscription(db, user.id);
        const plan = sub.plan;
        const check = canConsumeUsage(db, user.id, plan, rows.length);
        if (!check.allowed) {
          output = {
            status: 402,
            body: {
              error: 'plan_limit_exceeded',
              details: {
                exceededJobs: check.exceededJobs,
                exceededRowsPerJob: check.exceededRowsPerJob,
                limits: check.limits,
                usage: check.usage,
                plan,
                expiresAt: sub.expiresAt
              }
            }
          };
          return;
        }

        const job = {
          id: crypto.randomUUID(),
          userId: user.id,
          rowsCount: rows.length,
          metadata,
          createdAt: new Date().toISOString(),
          sample: rows.slice(0, 5)
        };
        db.jobs.push(job);
        const usage = consumeUsage(db, user.id, rows.length);

        output = {
          status: 201,
          body: {
            jobId: job.id,
            rowsStored: rows.length,
            usage,
            plan,
            expiresAt: sub.expiresAt
          }
        };
      });

      sendJson(res, output.status, output.body);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/jobs') {
      const auth = requireAuth(req, res, sendJson);
      if (!auth) return;

      const db = readDb();
      const jobs = db.jobs
        .filter((j) => j.userId === auth.userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      sendJson(res, 200, { jobs });
      return;
    }

    notFound(res);
  } catch (err) {
    sendJson(res, 500, { error: 'internal_error', message: err.message || String(err) });
  }
});

server.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`);
});
