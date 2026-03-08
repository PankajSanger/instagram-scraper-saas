const PLAN_LIMITS = {
  free: {
    label: 'Free',
    priceInr: 0,
    durationDays: 0,
    monthlyJobs: 1,
    maxRowsPerJob: 300,
    profileEnrichment: false,
    threadedReplies: false,
    oneTimeFreePost: true
  },
  starter: {
    label: 'Starter',
    priceInr: 499,
    durationDays: 30,
    monthlyJobs: 120,
    maxRowsPerJob: 10000,
    profileEnrichment: true,
    threadedReplies: true,
    oneTimeFreePost: false
  },
  pro: {
    label: 'Pro',
    priceInr: 1499,
    durationDays: 30,
    monthlyJobs: 600,
    maxRowsPerJob: 100000,
    profileEnrichment: true,
    threadedReplies: true,
    oneTimeFreePost: false
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
    maxRowsPerJob: config.maxRowsPerJob,
    oneTimeFreePost: Boolean(config.oneTimeFreePost)
  }));
}

module.exports = {
  PLAN_LIMITS,
  normalizePlan,
  getPublicPlans
};
