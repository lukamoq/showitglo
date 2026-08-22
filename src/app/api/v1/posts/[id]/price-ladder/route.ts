import { NextRequest, NextResponse } from 'next/server';

import { getPriceLadder } from '@/lib/db/store';
import { failure } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/posts/[id]/price-ladder
 *
 * What it would cost, at this instant, to move this post past a given board
 * position — and where that money would actually land it.
 *
 * This is an observation, not an offer. Nothing is reserved, no price is held
 * and no row is written; the numbers move the moment anyone else spends. The
 * response carries `computed_at` for exactly that reason, and the UI that
 * shows a rung re-reads it rather than settling against a stale figure. Buying
 * still goes through the ordinary priced endpoints, which price themselves
 * from `src/lib/pricing.ts` and ignore anything the client believes.
 *
 * Read-only and public: it discloses only what the board already discloses.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const ladder = await getPriceLadder(id);
    return NextResponse.json(ladder);
  } catch (err) {
    return failure('post.price_ladder.failed', err, { post_ref: id });
  }
}
