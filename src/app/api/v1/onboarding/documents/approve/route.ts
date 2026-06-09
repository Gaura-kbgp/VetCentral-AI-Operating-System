import { NextRequest, NextResponse } from 'next/server';
import { approveDocument } from '@/lib/actions/onboarding';

export async function POST(req: NextRequest) {
  try {
    const { docId } = await req.json();
    if (!docId) return NextResponse.json({ error: 'Missing docId' }, { status: 400 });

    const res = await approveDocument(docId);
    if (!res.success) return NextResponse.json({ error: res.error }, { status: 400 });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e) {
    console.error('Approve document error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
