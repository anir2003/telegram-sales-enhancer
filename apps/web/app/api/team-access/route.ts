import { NextRequest, NextResponse } from 'next/server';
import { getTeamAccessCode, isTeamAccessConfigured } from '@/lib/env';

export async function POST(request: NextRequest) {
  if (!isTeamAccessConfigured()) {
    return NextResponse.json({ ok: true, configured: false });
  }

  const body = await request.json().catch(() => ({}));
  const submittedCode = String(body.code ?? '').trim();

  if (!submittedCode || submittedCode !== getTeamAccessCode()) {
    return NextResponse.json({ error: 'Invalid team access code' }, { status: 401 });
  }

  return NextResponse.json({ ok: true, configured: true });
}
