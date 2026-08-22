import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { checkDbRateLimit, createDebate, createPost, getCategory, getDebateBySlug, getDebates } from '@/lib/db/store';
import { assertSameOrigin, getOrCreateSessionUser } from '@/lib/session';
import { runGate0Moderation } from '@/lib/moderation/gate0';
import { Debate, DebateSide } from '@/lib/types';
import { slugify } from '@/lib/utils';
import {
  badOrigin,
  badRequest,
  failure,
  optionalText,
  rateLimited,
  readJsonBody,
  requiredText,
} from '@/lib/http';

export const dynamic = 'force-dynamic';

const MIN_SIDES = 2;
const MAX_SIDES = 6;
const MAX_QUESTION = 200;
const MAX_SIDE_LABEL = 80;
const MAX_SIDE_DESCRIPTION = 500;

export async function GET() {
  try {
    const debates = await getDebates();
    return NextResponse.json({ debates });
  } catch (err) {
    return failure('debates.list.failed', err);
  }
}

/**
 * POST /api/v1/debates
 *
 * Opens a multi-sided war. Each side is backed by a real post, so the money
 * and ranking machinery is the same one the main board uses.
 *
 * Every side post starts at `score_base = 0`. The previous implementation
 * seeded them at `1000 + (n - i) * 100`, which put invented money on the board
 * and handed the first-listed side a permanent head start.
 */
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return badOrigin();

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const question = requiredText(body.question, { field: 'question', max: MAX_QUESTION });
  if (!question.ok) return question.response;

  const authorDisplay = optionalText(body.author_display, { field: 'author_display', max: 50 });
  if (!authorDisplay.ok) return authorDisplay.response;

  const categoryId = optionalText(body.category_id, { field: 'category_id', max: 64 });
  if (!categoryId.ok) return categoryId.response;

  const rawSides = body.sides;
  if (!Array.isArray(rawSides) || rawSides.length < MIN_SIDES || rawSides.length > MAX_SIDES) {
    return badRequest(
      `sides must be an array of ${MIN_SIDES} to ${MAX_SIDES} entries.`,
      'INVALID_FIELD',
      { field: 'sides', min: MIN_SIDES, max: MAX_SIDES }
    );
  }

  const sides: Array<{ label: string; description: string | null; key: string }> = [];
  const usedKeys = new Set<string>();

  for (let i = 0; i < rawSides.length; i++) {
    const entry = rawSides[i];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return badRequest(`sides[${i}] must be an object with a label.`, 'INVALID_FIELD', { field: 'sides' });
    }

    const raw = entry as Record<string, unknown>;

    const label = requiredText(raw.label, { field: `sides[${i}].label`, max: MAX_SIDE_LABEL });
    if (!label.ok) return label.response;

    const description = optionalText(raw.description, {
      field: `sides[${i}].description`,
      max: MAX_SIDE_DESCRIPTION,
      multiline: true,
    });
    if (!description.ok) return description.response;

    // Side keys index the debate, so they must be distinct even when two
    // labels slugify to the same string ("Pro!" and "Pro?").
    let key = slugify(label.value).slice(0, 40) || `side-${i + 1}`;
    if (usedKeys.has(key)) key = `${key}-${i + 1}`;
    usedKeys.add(key);

    sides.push({ label: label.value, description: description.value, key });
  }

  const moderation = runGate0Moderation(
    question.value,
    sides.map((s) => `${s.label} ${s.description ?? ''}`).join(' ')
  );
  if (!moderation.passed) {
    return NextResponse.json(
      {
        error: 'War failed automated moderation check',
        code: 'MODERATION_BLOCKED',
        flags: moderation.flags,
        reason: moderation.reason,
      },
      { status: 422 }
    );
  }

  try {
    const user = await getOrCreateSessionUser();

    const limit = await checkDbRateLimit(`debates:u:${user.id}`, 2, 3600);
    if (!limit.allowed) {
      return rateLimited('You have reached the hourly limit for new wars.', limit.resetInMs);
    }

    const category = await getCategory(categoryId.value || 'global');
    if (!category) return badRequest('Unknown category.', 'INVALID_CATEGORY', { field: 'category_id' });

    const display = authorDisplay.value || user.alias || 'Anonymous';
    const debateId = `deb_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
    const slug = `${slugify(question.value).slice(0, 50) || 'war'}-${randomBytes(3).toString('hex')}`;

    const createdSides: DebateSide[] = [];
    for (const side of sides) {
      // createPost mints its own UUID; the returned id is the only valid one.
      const post = await createPost({
        slug: `${slug}-${side.key}`,
        author_id: user.id,
        category_id: category.id,
        kind: 'opinion',
        title: `${side.label}: ${question.value}`,
        body: side.description,
        media_url: null,
        is_ad: false,
        demand_target: null,
        demand_target_user_id: null,
        counter_of: null,
        source_url: null,
        source_platform: null,
        author_display: display,
        status: 'live',
        score_base: 0,
        total_raised_cents: 0,
        backers_count: 0,
        like_units: 0,
        streak_days: 0,
      });

      createdSides.push({
        debate_id: debateId,
        side_key: side.key,
        label: side.label,
        post_id: post.id,
      });
    }

    const debate: Debate = {
      id: debateId,
      slug,
      question: question.value,
      status: 'live',
      curated: false,
      is_political: false,
      category_id: category.id,
      sponsor_user_id: user.id,
      sponsor_label: `Created by ${display}`,
      created_at: new Date().toISOString(),
    };

    await createDebate(debate, createdSides);

    const fullDebate = await getDebateBySlug(slug);
    return NextResponse.json({ debate: fullDebate }, { status: 201 });
  } catch (err) {
    return failure('debates.create.failed', err);
  }
}
