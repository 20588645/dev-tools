// @vitest-environment node
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildAutomaticPricingPlan } = require('./pricing-logic');

describe('automatic pricing plan', () => {
  it('applies reliable and priority-source conflicts without a second confirmation', () => {
    const verified = { modelId: 'verified', source: 'models.dev', confidence: 'verified', status: 'pending' };
    const single = { modelId: 'single', source: 'LiteLLM', confidence: 'single-source', status: 'pending' };
    const conflict = { modelId: 'conflict', source: 'models.dev', confidence: 'conflict', status: 'pending' };

    const plan = buildAutomaticPricingPlan([verified, single, conflict]);

    expect(plan.apply).toEqual([verified, single, conflict]);
    expect(plan).toMatchObject({ total: 3, applied: 3, unchanged: 0, unmatched: 0, conflicts: 1 });
  });

  it('keeps unmatched local values and does not rewrite matching prices', () => {
    const plan = buildAutomaticPricingPlan([
      { modelId: 'same', source: 'models.dev', confidence: 'verified', status: 'matched' },
      { modelId: 'unknown', source: '', confidence: 'unmatched', status: 'unmatched' },
    ]);

    expect(plan.apply).toEqual([]);
    expect(plan).toMatchObject({ total: 2, applied: 0, unchanged: 1, unmatched: 1, conflicts: 0 });
  });
});
