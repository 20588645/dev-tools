function buildAutomaticPricingPlan(candidates) {
  const rows = Array.isArray(candidates) ? candidates : [];
  const apply = [];
  let unchanged = 0;
  let unmatched = 0;
  let conflicts = 0;

  for (const candidate of rows) {
    if (candidate && candidate.confidence === 'conflict') conflicts += 1;
    if (!candidate || candidate.confidence === 'unmatched' || !candidate.source) {
      unmatched += 1;
      continue;
    }
    if (candidate.status === 'matched') {
      unchanged += 1;
      continue;
    }
    apply.push(candidate);
  }

  return {
    apply,
    total: rows.length,
    applied: apply.length,
    unchanged,
    unmatched,
    conflicts,
  };
}

module.exports = {
  buildAutomaticPricingPlan,
};
