import { NextRequest, NextResponse } from 'next/server';

import { getCategory, updateCategoryStrategy } from '@/lib/db/store';
import { guardAdmin } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/session';
import { IncrementStrategyType } from '@/lib/types';
import {
  badOrigin,
  badRequest,
  enumField,
  failure,
  integerField,
  optionalText,
  readJsonBody,
} from '@/lib/http';

export const dynamic = 'force-dynamic';

const STRATEGIES = ['fixed', 'percent', 'expo'] as const;

const MIN_HALF_LIFE_HOURS = 1;
const MAX_HALF_LIFE_HOURS = 8760; // one year

/**
 * Bounds for every knob in `increment_config`.
 *
 * These values decide what it costs to take a rank, so an unvalidated write
 * here is a live pricing change: `pct: 1e9` would make the board
 * undisplaceable, `mult: 0` would make every rank free.
 */
const CONFIG_BOUNDS = {
  pct: { min: 0, max: 1, integer: false },
  floor_cents: { min: 0, max: 10000, integer: true },
  fixed_inc_cents: { min: 0, max: 10000, integer: true },
  mult: { min: 1, max: 10, integer: false },
} as const;

type ConfigKey = keyof typeof CONFIG_BOUNDS;

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return badOrigin();

  const denied = guardAdmin(request);
  if (denied) return denied;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const categoryId = optionalText(body.category_id, { field: 'category_id', max: 64 });
  if (!categoryId.ok) return categoryId.response;

  const strategy = enumField<(typeof STRATEGIES)[number]>(body.strategy, {
    field: 'strategy',
    allowed: STRATEGIES,
  });
  if (!strategy.ok) return strategy.response;

  const halfLife = integerField(body.half_life_hours, {
    field: 'half_life_hours',
    min: MIN_HALF_LIFE_HOURS,
    max: MAX_HALF_LIFE_HOURS,
    fallback: 168,
  });
  if (!halfLife.ok) return halfLife.response;

  // --- increment_config ---------------------------------------------------

  const rawConfig = body.config;
  if (rawConfig !== undefined && rawConfig !== null) {
    if (typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
      return badRequest('config must be an object.', 'INVALID_FIELD', { field: 'config' });
    }
  }

  const config: Record<string, number> = {};
  const configEntries = Object.entries((rawConfig ?? {}) as Record<string, unknown>);

  for (const [key, value] of configEntries) {
    if (!(key in CONFIG_BOUNDS)) {
      return badRequest(`Unknown config key: ${key}.`, 'INVALID_FIELD', {
        field: 'config',
        allowed: Object.keys(CONFIG_BOUNDS),
      });
    }

    const bounds = CONFIG_BOUNDS[key as ConfigKey];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < bounds.min || value > bounds.max) {
      return badRequest(
        `config.${key} must be a number between ${bounds.min} and ${bounds.max}.`,
        'INVALID_FIELD',
        { field: `config.${key}`, min: bounds.min, max: bounds.max }
      );
    }
    if (bounds.integer && !Number.isSafeInteger(value)) {
      return badRequest(`config.${key} must be a whole number.`, 'INVALID_FIELD', { field: `config.${key}` });
    }

    config[key] = value;
  }

  const target = categoryId.value || 'global';

  try {
    const existing = await getCategory(target);
    if (!existing) return badRequest('Unknown category.', 'INVALID_CATEGORY', { field: 'category_id' });

    // An empty config would silently drop the current pricing knobs back to
    // their code defaults, so keep what is stored unless the caller sent one.
    const nextConfig = configEntries.length > 0 ? config : existing.increment_config;

    const category = await updateCategoryStrategy(
      target,
      strategy.value as IncrementStrategyType,
      nextConfig,
      halfLife.value
    );

    return NextResponse.json({
      success: true,
      category,
      message: `Strategy updated to ${strategy.value} with half-life ${halfLife.value}h`,
    });
  } catch (err) {
    return failure('admin.strategy.failed', err, { category_id: target });
  }
}
