import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { verifyAdminAuth, createUnauthorizedResponse } from '@/lib/auth';
import '@/lib/db/seed';

export async function GET(request: NextRequest) {
  if (!verifyAdminAuth(request)) {
    return createUnauthorizedResponse();
  }

  const stats = db.getAdminStats();
  const categories = db.getAllCategories();
  const reports = db.getReports();
  const auditLogs = db.getAuditLogs().slice(0, 50);

  return NextResponse.json({
    stats,
    categories,
    pending_reports_count: reports.filter((r) => r.status === 'open').length,
    recent_audit_logs: auditLogs,
  });
}
