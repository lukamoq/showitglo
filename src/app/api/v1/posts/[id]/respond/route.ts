import { NextRequest, NextResponse } from 'next/server';

import { createBrandResponse, getPost } from '@/lib/db/store';
import { guardAdmin } from '@/lib/auth';
import { assertSameOrigin, getOrCreateSessionUser } from '@/lib/session';
import { badOrigin, failure, notFound, readJsonBody, requiredText } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/posts/[id]/respond
 *
 * Publishes an official brand response against a demand.
 *
 * ADMIN ONLY, deliberately. A response carries a company's name on the public
 * record, so publishing one is an act of impersonation unless the publisher is
 * verified as that company — and brand self-serve verification does not exist
 * yet. Until it does, an operator with the admin key is the only party who may
 * post one. The previous handler accepted `author_display` from any anonymous
 * caller and defaulted it to a real corporation's name.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!assertSameOrigin(request)) return badOrigin();

  const denied = guardAdmin(request);
  if (denied) return denied;

  const { id } = await params;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const title = requiredText(body.title, { field: 'title', max: 200 });
  if (!title.ok) return title.response;

  const responseBody = requiredText(body.response_body, {
    field: 'response_body',
    max: 2000,
    multiline: true,
  });
  if (!responseBody.ok) return responseBody.response;

  const authorDisplay = requiredText(body.author_display, { field: 'author_display', max: 80 });
  if (!authorDisplay.ok) return authorDisplay.response;

  try {
    const post = await getPost(id);
    if (!post || post.status !== 'live') return notFound('Demand post not found.', 'POST_NOT_FOUND');

    // `brand_responses.author_user_id` is a real FK, so the response is
    // attributed to the operator's own session identity — never to the author
    // of the demand, which would read as the complainant answering themselves.
    const operator = await getOrCreateSessionUser();

    const response = await createBrandResponse({
      postId: post.id,
      authorUserId: operator.id,
      authorDisplay: authorDisplay.value,
      title: title.value,
      body: responseBody.value,
    });

    return NextResponse.json(
      {
        success: true,
        brand_response: response,
        message: 'Official brand response successfully published on public record.',
      },
      { status: 201 }
    );
  } catch (err) {
    return failure('posts.respond.failed', err, { post_ref: id });
  }
}
