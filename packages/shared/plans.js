const PLAN_LIMITS = {
  free: {
    label: 'Free',
    priceInr: 0,
    durationDays: 0,
    monthlyJobs: 10,
    maxRowsPerJob: 500,
    profileEnrichment: false,
    threadedReplies: false
  },
  starter: {
    label: 'Starter',
    priceInr: 499,
    durationDays: 30,
    monthlyJobs: 120,
    maxRowsPerJob: 10000,
    profileEnrichment: true,
    threadedReplies: true
  },
  pro: {
    label: 'Pro',
    priceInr: 1499,
    durationDays: 30,
    monthlyJobs: 600,
    maxRowsPerJob: 100000,
    profileEnrichment: true,
    threadedReplies: true
  }
};

function normalizePlan(plan) {
  if (!plan) return 'free';
  const lower = String(plan).toLowerCase();
  return PLAN_LIMITS[lower] ? lower : 'free';
}

function getPublicPlans() {
  return Object.entries(PLAN_LIMITS).map(([id, config]) => ({
    id,
    label: config.label,
    priceInr: config.priceInr,
    durationDays: config.durationDays,
    monthlyJobs: config.monthlyJobs,
    maxRowsPerJob: config.maxRowsPerJob
  }));
}

module.exports = {
  PLAN_LIMITS,
  normalizePlan,
  getPublicPlans
};
