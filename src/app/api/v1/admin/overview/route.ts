import { NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import '@/lib/db/seed';

export async function GET() {
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
