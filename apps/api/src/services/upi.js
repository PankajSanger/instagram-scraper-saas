const crypto = require('crypto');
const { PLAN_LIMITS, normalizePlan, getPublicPlans } = require('../../../../packages/shared/plans');

function sanitizeVpa(vpa) {
  return String(vpa || '').trim();
}

function createUpiPaymentRequest({ db, userId, plan }) {
  const normalizedPlan = normalizePlan(plan);
  if (normalizedPlan === 'free') {
    return { error: 'free_plan_no_payment' };
  }

  const planConfig = PLAN_LIMITS[normalizedPlan];
  const payeeVpa = sanitizeVpa(process.env.UPI_VPA);
  const payeeName = String(process.env.UPI_PAYEE_NAME || 'CommentMint').trim();

  if (!payeeVpa) {
    return { error: 'missing_upi_vpa' };
  }

  const paymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;
  const amount = Number(planConfig.priceInr);
  const note = `CommentMint ${normalizedPlan} ${paymentId}`;
  const expiryIso = new Date(Date.now() + 1000 * 60 * 30).toISOString();

  const upiIntent = `upi://pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(amount.toFixed(2))}&cu=INR&tn=${encodeURIComponent(note)}&tr=${encodeURIComponent(paymentId)}`;

  const request = {
    id: paymentId,
    userId,
    plan: normalizedPlan,
    amountInr: amount,
    status: 'pending',
    upiIntent,
    payeeVpa,
    createdAt: new Date().toISOString(),
    expiresAt: expiryIso,
    utr: null,
    confirmedAt: null
  };

  db.payments.push(request);

  return {
    paymentId,
    plan: normalizedPlan,
    amountInr: amount,
    upiIntent,
    qrImageUrl: `https://quickchart.io/qr?text=${encodeURIComponent(upiIntent)}&size=280`,
    expiresAt: expiryIso,
    instructions: [
      'Open any UPI app and pay with this UPI link or QR.',
      'After payment, submit your UTR to activate instantly.'
    ]
  };
}

function activatePlan(db, userId, plan) {
  const normalizedPlan = normalizePlan(plan);
  const config = PLAN_LIMITS[normalizedPlan];
  const now = new Date();
  const expiresAt = config.durationDays > 0
    ? new Date(now.getTime() + config.durationDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const existing = db.subscriptions.find((s) => s.userId === userId);
  if (existing) {
    existing.plan = normalizedPlan;
    existing.status = 'active';
    existing.expiresAt = expiresAt;
    existing.updatedAt = now.toISOString();
    return existing;
  }

  const created = {
    userId,
    plan: normalizedPlan,
    status: 'active',
    expiresAt,
    updatedAt: now.toISOString()
  };
  db.subscriptions.push(created);
  return created;
}

function confirmUpiPayment({ db, userId, paymentId, utr }) {
  const payment = db.payments.find((p) => p.id === paymentId && p.userId === userId);
  if (!payment) {
    return { error: 'payment_not_found' };
  }
  if (payment.status === 'paid') {
    const sub = activatePlan(db, userId, payment.plan);
    return { payment, subscription: sub, alreadyPaid: true };
  }
  if (new Date(payment.expiresAt).getTime() < Date.now()) {
    payment.status = 'expired';
    return { error: 'payment_expired' };
  }

  if (!utr || String(utr).trim().length < 8) {
    return { error: 'invalid_utr' };
  }

  payment.status = 'paid';
  payment.utr = String(utr).trim();
  payment.confirmedAt = new Date().toISOString();

  const sub = activatePlan(db, userId, payment.plan);
  return { payment, subscription: sub, alreadyPaid: false };
}

function getActiveSubscription(db, userId) {
  const sub = db.subscriptions.find((s) => s.userId === userId && s.status === 'active');
  if (!sub) return { plan: 'free', status: 'active', expiresAt: null };

  if (sub.plan !== 'free' && sub.expiresAt && new Date(sub.expiresAt).getTime() < Date.now()) {
    sub.plan = 'free';
    sub.status = 'active';
    sub.expiresAt = null;
    sub.updatedAt = new Date().toISOString();
  }

  return {
    plan: sub.plan || 'free',
    status: sub.status || 'active',
    expiresAt: sub.expiresAt || null
  };
}

module.exports = {
  createUpiPaymentRequest,
  confirmUpiPayment,
  getActiveSubscription,
  getPublicPlans
};
