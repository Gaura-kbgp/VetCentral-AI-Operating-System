import { NextRequest, NextResponse } from 'next/server';
import { syncAllHospitalCalendars } from '@/lib/microsoft/calendar-sync';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await syncAllHospitalCalendars();
    return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Outlook sync cron failed:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
