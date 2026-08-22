import { NextRequest, NextResponse } from 'next/server';

import { getInsightsDemands } from '@/lib/db/store';
import { getInsightsKMin } from '@/lib/env';
import { authenticateInsights } from '@/lib/insightsAuth';
import { failure } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/insights/demands
 *
 * Money-weighted demand aggregates, k-anonymised in SQL: a target with fewer
 * than `INSIGHTS_K_MIN` distinct backers is omitted entirely rather than
 * reported with a floored count. The floor advertised in the response is the
 * one actually applied, read from the same source the query uses.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateInsights(request);
  if (!auth.ok) return auth.response;

  try {
    const data = await getInsightsDemands();

    return NextResponse.json({
      k_anonymity_floor: getInsightsKMin(),
      dataset: 'money_weighted_demands_v1',
      data_policy: 'ZERO_USER_DATA_SOLD',
      guarantee:
        'We sell aggregate vote counts and market sentiment scores. Individual personal data, emails, IP addresses, aliases, and payment profiles are NEVER sold, rented, or exported.',
      data,
    });
  } catch (err) {
    return failure('insights.demands.failed', err);
  }
}
