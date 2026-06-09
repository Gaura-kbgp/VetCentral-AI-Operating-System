import { NextRequest, NextResponse } from 'next/server';
import { rejectDocument } from '@/lib/actions/onboarding';

export async function POST(req: NextRequest) {
  try {
    const { docId, reason } = await req.json();
    if (!docId || !reason) return NextResponse.json({ error: 'Missing docId or reason' }, { status: 400 });

    const res = await rejectDocument(docId, reason);
    if (!res.success) return NextResponse.json({ error: res.error }, { status: 400 });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e) {
    console.error('Reject document error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
