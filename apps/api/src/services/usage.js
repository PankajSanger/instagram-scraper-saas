const { PLAN_LIMITS, normalizePlan } = require('../../../../packages/shared/plans');

function getMonthKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function canConsumeUsage(db, userId, plan, rowsCount) {
  const currentPlan = normalizePlan(plan);
  const limits = PLAN_LIMITS[currentPlan];
  const key = getMonthKey();

  const usage = db.usage.find((u) => u.userId === userId && u.monthKey === key) || {
    userId,
    monthKey: key,
    jobsUsed: 0,
    rowsUsed: 0
  };

  const exceededJobs = usage.jobsUsed + 1 > limits.monthlyJobs;
  const exceededRowsPerJob = Number(rowsCount || 0) > limits.maxRowsPerJob;
  return {
    allowed: !(exceededJobs || exceededRowsPerJob),
    exceededJobs,
    exceededRowsPerJob,
    limits,
    usage
  };
}

function consumeUsage(db, userId, rowsCount) {
  const key = getMonthKey();
  const rows = Number(rowsCount || 0);
  const existing = db.usage.find((u) => u.userId === userId && u.monthKey === key);
  if (existing) {
    existing.jobsUsed += 1;
    existing.rowsUsed += rows;
    return existing;
  }
  const created = { userId, monthKey: key, jobsUsed: 1, rowsUsed: rows };
  db.usage.push(created);
  return created;
}

function hasConsumedFreePost(db, userId) {
  return db.jobs.some((j) => j.userId === userId && j.sourceType === 'direct_url');
}

module.exports = { canConsumeUsage, consumeUsage, getMonthKey, hasConsumedFreePost };
