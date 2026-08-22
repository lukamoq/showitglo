import { NextRequest, NextResponse } from 'next/server';

import { getCategory, getCounterPosts, getPost, getPostInteractions, getRankedPost } from '@/lib/db/store';
import { failure, notFound } from '@/lib/http';

export const dynamic = 'force-dynamic';

const MAX_ROSTER = 50;

/**
 * GET /api/v1/posts/[id]
 *
 * The permanent public record for one live post. Rejected and removed posts
 * return 404 — this endpoint is reachable by id or slug, so anything it
 * serves is effectively published.
 *
 * `pending_review` is the exception. A post pulled off the board by community
 * reports still has a URL people already shared, and answering 404 there
 * claims the post never existed — which is both untrue and, when the review
 * ends in a restore, retroactively wrong. It gets an honest holding state
 * instead: the title, the fact that it is under review, and nothing else. The
 * body, the ledger and the backer roster stay hidden until a moderator
 * decides, because those are what a reported post might be weaponising.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const post = await getRankedPost(id);
    if (!post) {
      const raw = await getPost(id);
      if (raw && raw.status === 'pending_review') {
        return NextResponse.json({
          under_review: true,
          post: {
            id: raw.id,
            slug: raw.slug,
            title: raw.title,
            kind: raw.kind,
            category_id: raw.category_id,
            author_display: raw.author_display,
            status: raw.status,
            created_at: raw.created_at,
            body: null,
            source_url: null,
            source_platform: null,
            media_url: null,
            demand_target: raw.demand_target,
            rank: null,
            display_score: 0,
            total_raised_cents: 0,
            backers_count: 0,
            like_units: 0,
            tap_units: 0,
          },
          boosts: [],
          top_backers: [],
          counter_posts: [],
          brand_response: null,
        });
      }
      return notFound('Post not found.', 'POST_NOT_FOUND');
    }

    const [category, interactions, counterPosts] = await Promise.all([
      getCategory(post.category_id || 'global'),
      getPostInteractions(post.id, 100),
      getCounterPosts(post.id, 10),
    ]);

    // Roster grouped by payer. An interaction backed anonymously is shown as
    // "Anonymous" no matter what display name was attached to it, so a single
    // non-anonymous contribution can never unmask the rest.
    const roster = new Map<string, { name: string; totalCents: number; boostCount: number }>();
    for (const interaction of interactions) {
      const name =
        interaction.visibility === 'anonymous'
          ? 'Anonymous'
          : interaction.payer_display || 'Anonymous Backer';
      const entry = roster.get(name) ?? { name, totalCents: 0, boostCount: 0 };
      entry.totalCents += interaction.amount_cents;
      entry.boostCount += 1;
      roster.set(name, entry);
    }

    const topBackers = Array.from(roster.values())
      .sort((a, b) => b.totalCents - a.totalCents)
      .slice(0, MAX_ROSTER);

    return NextResponse.json({
      post,
      category,
      boosts: interactions,
      top_backers: topBackers,
      counter_posts: counterPosts,
      brand_response: post.brand_response ?? null,
      metrics: {
        total_raised_cents: post.total_raised_cents,
        backers_count: post.backers_count,
        like_units: post.like_units,
        streak_days: post.streak_days,
      },
    });
  } catch (err) {
    return failure('post.read.failed', err, { post_ref: id });
  }
}
