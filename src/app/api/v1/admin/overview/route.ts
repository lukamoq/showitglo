import { NextRequest, NextResponse } from 'next/server';

import { getAdminStats, getAllCategories, getAuditLogs, getOpenReportsCount } from '@/lib/db/store';
import { guardAdmin } from '@/lib/auth';
import { failure } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/overview
 *
 * Operator dashboard. `guardAdmin` fails closed: with no ADMIN_SECRET_KEY
 * configured it answers 503 rather than letting the route through, so a
 * forgotten environment variable cannot silently publish this data.
 */
export async function GET(request: NextRequest) {
  const denied = guardAdmin(request);
  if (denied) return denied;

  try {
    const [stats, categories, pendingReportsCount, auditLogs] = await Promise.all([
      getAdminStats(),
      getAllCategories(),
      getOpenReportsCount(),
      getAuditLogs(50),
    ]);

    return NextResponse.json({
      stats,
      categories,
      pending_reports_count: pendingReportsCount,
      recent_audit_logs: auditLogs,
    });
  } catch (err) {
    return failure('admin.overview.failed', err);
  }
}
