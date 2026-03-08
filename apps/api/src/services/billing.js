const crypto = require('crypto');
const { normalizePlan } = require('../../../../packages/shared/plans');

function createCheckoutSession({ userId, plan }) {
  const normalized = normalizePlan(plan);
  if (normalized === 'free') {
    return { error: 'free_plan_no_checkout' };
  }

  const stripePrice = normalized === 'business'
    ? process.env.STRIPE_PRICE_BUSINESS
    : process.env.STRIPE_PRICE_PRO;

  if (!stripePrice) {
    return { error: 'missing_stripe_price_id' };
  }

  const sessionId = `cs_test_${crypto.randomBytes(12).toString('hex')}`;
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  // Placeholder URL; in production, replace with Stripe SDK session creation.
  return {
    sessionId,
    checkoutUrl: `${appUrl}/billing/mock-checkout?session_id=${sessionId}&plan=${normalized}&user_id=${userId}`,
    stripePrice
  };
}

function applyWebhookEvent(db, event) {
  if (event.type === 'checkout.session.completed') {
    const userId = event.data?.object?.metadata?.userId;
    const plan = normalizePlan(event.data?.object?.metadata?.plan || 'free');
    if (!userId) return { ok: false, reason: 'missing_user' };

    const existing = db.subscriptions.find((s) => s.userId === userId);
    if (existing) {
      existing.plan = plan;
      existing.status = 'active';
      existing.updatedAt = new Date().toISOString();
    } else {
      db.subscriptions.push({
        userId,
        plan,
        status: 'active',
        updatedAt: new Date().toISOString()
      });
    }
    return { ok: true };
  }

  if (event.type === 'customer.subscription.deleted') {
    const userId = event.data?.object?.metadata?.userId;
    if (!userId) return { ok: false, reason: 'missing_user' };
    const existing = db.subscriptions.find((s) => s.userId === userId);
    if (existing) {
      existing.plan = 'free';
      existing.status = 'canceled';
      existing.updatedAt = new Date().toISOString();
      return { ok: true };
    }
  }

  return { ok: true, ignored: true };
}

module.exports = { createCheckoutSession, applyWebhookEvent };
