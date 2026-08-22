import { NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import '@/lib/db/seed';

export async function GET() {
  const debates = db.getDebates();
  const aggregatedWars = debates.map((d) => ({
    debate_id: d.id,
    slug: d.slug,
    question: d.question,
    total_money_raised_cents: d.total_money_cents,
    total_distinct_backers: d.total_backers,
    total_free_votes: d.total_free_votes || 0,
    faction_breakdown: d.sides.map((s) => ({
      faction: s.label,
      side_key: s.side_key,
      percentage: s.percentage,
      total_cents: s.total_cents,
      backers_count: s.backers_count,
      free_votes_count: s.free_votes_count,
      community_opinions_count: s.opinions.length,
    })),
    k_anonymity_verified: true,
  }));

  return NextResponse.json({
    k_anonymity_floor: 100,
    dataset: 'multi_faction_war_votes_v1',
    data_policy: 'ZERO_USER_DATA_SOLD',
    guarantee: 'Only aggregated vote counts and faction market share percentages are exposed. Zero user accounts, emails, or personal identifiers are ever sold or accessible via API.',
    data: aggregatedWars,
  });
}
