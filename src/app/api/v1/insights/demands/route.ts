import { NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import '@/lib/db/seed';

export async function GET() {
  const demandsAggregates = db.getInsightsDemands();
  return NextResponse.json({
    k_anonymity_floor: 100,
    dataset: 'money_weighted_demands_v1',
    data_policy: 'ZERO_USER_DATA_SOLD',
    guarantee: 'We sell aggregate vote counts and market sentiment scores. Individual personal data, emails, IP addresses, aliases, and payment profiles are NEVER sold, rented, or exported.',
    data: demandsAggregates,
  });
}
