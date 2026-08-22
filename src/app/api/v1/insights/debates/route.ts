import { NextRequest, NextResponse } from 'next/server';

import { getInsightsDebates } from '@/lib/db/store';
import { getInsightsKMin } from '@/lib/env';
import { authenticateInsights } from '@/lib/insightsAuth';
import { failure } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/insights/debates
 *
 * Aggregate faction market share per war.
 *
 * The previous handler stamped `k_anonymity_verified: true` onto every row
 * regardless of how few people were behind it. Here the flag is a consequence
 * of the query: wars below the anonymity floor are never returned, so any row
 * present has genuinely cleared it.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateInsights(request);
  if (!auth.ok) return auth.response;

  try {
    const data = await getInsightsDebates();

    return NextResponse.json({
      k_anonymity_floor: getInsightsKMin(),
      dataset: 'multi_faction_war_votes_v1',
      data_policy: 'ZERO_USER_DATA_SOLD',
      guarantee:
        'Only aggregated vote counts and faction market share percentages are exposed. Zero user accounts, emails, or personal identifiers are ever sold or accessible via API.',
      data,
    });
  } catch (err) {
    return failure('insights.debates.failed', err);
  }
}
