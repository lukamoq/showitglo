import { NextRequest, NextResponse } from 'next/server';

import { getFirstLightRail } from '@/lib/db/store';
import { FIRST_LIGHT_MINUTES, FIRST_LIGHT_RAIL_LIMIT } from '@/lib/firstLight';
import { failure } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/first-light
 *
 * The one board on ShowItGlo that money cannot order. Every post published
 * here is carried for a fixed window, newest first, whatever its wallet says;
 * when the window closes it keeps only the rank it paid for.
 *
 * Public and unauthenticated — it is a shop window, and gating it would defeat
 * the purpose. `window_minutes` is returned so the client never has to hardcode
 * a duration that only the server actually enforces.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const categoryId = url.searchParams.get('category') || 'global';

  try {
    const posts = await getFirstLightRail(categoryId, FIRST_LIGHT_RAIL_LIMIT);

    return NextResponse.json({
      category_id: categoryId,
      window_minutes: FIRST_LIGHT_MINUTES,
      posts,
      server_time: new Date().toISOString(),
    });
  } catch (err) {
    return failure('first_light.read.failed', err, { category_id: categoryId });
  }
}
