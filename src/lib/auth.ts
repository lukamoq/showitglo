import { NextResponse } from 'next/server';

/**
 * Admin Authentication & Authorization Utility
 * Protects management endpoints in production.
 */
export function verifyAdminAuth(request: Request): boolean {
  const configuredSecret = process.env.ADMIN_SECRET_KEY;

  // In development/demo, if ADMIN_SECRET_KEY is not set, allow operations with a warning
  if (!configuredSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️ WARNING: ADMIN_SECRET_KEY is not configured in production environment.');
    }
    return true;
  }

  // Check x-admin-key header
  const headerKey = request.headers.get('x-admin-key');
  if (headerKey && headerKey === configuredSecret) {
    return true;
  }

  // Check Authorization: Bearer <secret>
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token === configuredSecret) {
      return true;
    }
  }

  return false;
}

export function createUnauthorizedResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'Unauthorized: Invalid or missing admin credentials.',
      code: 'ADMIN_AUTH_REQUIRED',
    },
    { status: 401 }
  );
}
