import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import '@/lib/db/seed';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id') || 'usr_marc';

  const wallet = db.getWallet(userId);
  const ledger = db.getWalletLedger(userId);

  return NextResponse.json({
    wallet,
    ledger: ledger.slice(0, 30),
  });
}
