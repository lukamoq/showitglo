import { NextRequest, NextResponse } from 'next/server';

import { getCategory, rebaseBoard } from '@/lib/db/store';
import { guardAdmin } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/session';
import { badOrigin, badRequest, failure, optionalText, readJsonBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/admin/rebase
 *
 * Advances the category epoch and rescales every stored score by the same
 * factor. Relative order is invariant under that transform — the operation
 * exists only to stop `score_base` growing without bound as the epoch recedes,
 * and it is audit-logged inside the same transaction that performs it.
 */
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return badOrigin();

  const denied = guardAdmin(request);
  if (denied) return denied;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const categoryId = optionalText(parsed.body.category_id, { field: 'category_id', max: 64 });
  if (!categoryId.ok) return categoryId.response;

  const target = categoryId.value || 'global';

  try {
    const category = await getCategory(target);
    if (!category) return badRequest('Unknown category.', 'INVALID_CATEGORY', { field: 'category_id' });

    const result = await rebaseBoard(target);

    return NextResponse.json({
      success: true,
      category_id: target,
      old_epoch: result.oldEpoch,
      new_epoch: result.newEpoch,
      factor: result.factor,
      message: `Board ${target} epoch rebased to the current timestamp.`,
    });
  } catch (err) {
    return failure('admin.rebase.failed', err, { category_id: target });
  }
}
