import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';

// ─────────────────────────────────────────────────────────────
// Hospital definitions
// ─────────────────────────────────────────────────────────────

const HOSPITALS = [
  {
    name:        'Town & Country Animal Hospital',
    slug:        'town-country',
    code:        'TCAH',
    address:     '1234 Main St, Reston, VA 20190',
    phone:       '(703) 555-0101',
    email:       'info@tcah.com',
    website:     'https://tcah.com',
    timezone:    'America/New_York',
    color:       '#2563EB',
    description: 'Full-service companion animal hospital in Reston.',
    departments: [
      { name: 'Medical',            description: 'General medicine and diagnostics',        color: '#2563EB' },
      { name: 'Surgery',            description: 'Soft tissue and orthopedic surgery',      color: '#7C3AED' },
      { name: 'Emergency & Triage', description: 'After-hours urgent care',                 color: '#DC2626' },
      { name: 'Client Services',    description: 'Reception and scheduling',                color: '#D97706' },
      { name: 'Human Resources',    description: 'Staff management and compliance',         color: '#059669' },
    ],
  },
  {
    name:        'Animal Clinic of Clifton',
    slug:        'clifton',
    code:        'ACOC',
    address:     '12900 Lee Hwy, Clifton, VA 20124',
    phone:       '(703) 555-0202',
    email:       'info@cliftonvet.com',
    website:     'https://cliftonvet.com',
    timezone:    'America/New_York',
    color:       '#7C3AED',
    description: 'Neighborhood clinic for dogs, cats, and exotic pets.',
    departments: [
      { name: 'Medical',         description: 'General practice medicine',    color: '#7C3AED' },
      { name: 'Surgery',         description: 'Routine surgical care',        color: '#2563EB' },
      { name: 'Client Services', description: 'Front desk and billing',       color: '#D97706' },
      { name: 'Human Resources', description: 'HR and payroll',               color: '#059669' },
    ],
  },
  {
    name:        'Columbia Pike Animal Hospital & Emergency Center',
    slug:        'columbia-pike',
    code:        'CPAH',
    address:     '6134 Columbia Pike, Falls Church, VA 22041',
    phone:       '(703) 555-0303',
    email:       'info@columbiapikevet.com',
    website:     'https://columbiapikevet.com',
    timezone:    'America/New_York',
    color:       '#059669',
    description: '24/7 emergency and specialty veterinary hospital.',
    departments: [
      { name: 'Medical',                description: 'Internal medicine and oncology',  color: '#059669' },
      { name: 'Surgery',                description: 'Advanced surgical services',      color: '#2563EB' },
      { name: 'Emergency & Critical',   description: '24/7 emergency and ICU',         color: '#DC2626' },
      { name: 'Client Services',        description: 'Reception and triage intake',    color: '#D97706' },
      { name: 'Human Resources',        description: 'HR and credentialing',           color: '#7C3AED' },
      { name: 'Operations',             description: 'Facilities and supply chain',    color: '#6B7280' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// GET — current state
// ─────────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ hospitalCount: 0, deptCount: 0, target: 3 });

  const [{ count: hospitalCount }, { count: deptCount }] = await Promise.all([
    admin.from('hospitals').select('*', { count: 'exact', head: true }).eq('org_id', profile.org_id),
    admin.from('departments').select('*', { count: 'exact', head: true }).eq('org_id', profile.org_id),
  ]);

  return NextResponse.json({ hospitalCount: hospitalCount ?? 0, deptCount: deptCount ?? 0, target: 3 });
}

// ─────────────────────────────────────────────────────────────
// POST — seed hospitals + departments + supporting data
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();

  // Guard — super_admin / org_admin only
  const { data: orgRole } = await admin
    .from('org_user_roles').select('role')
    .eq('user_id', user.id)
    .in('role', ['super_admin', 'org_admin'])
    .maybeSingle();

  const { data: hospRole } = await admin
    .from('user_hospital_roles').select('role')
    .eq('user_id', user.id)
    .in('role', ['super_admin', 'org_admin', 'hospital_admin'])
    .maybeSingle();

  if (!orgRole && !hospRole) {
    return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 });
  }

  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'Profile not found' }, { status: 400 });

  const orgId = profile.org_id;
  const results = { hospitals: 0, departments: 0, events: 0, channels: 0, errors: [] as string[] };

  // ── 1. Upsert hospitals ───────────────────────────────────
  for (const h of HOSPITALS) {
    const { data: existing } = await admin
      .from('hospitals').select('id').eq('org_id', orgId).eq('slug', h.slug).maybeSingle();

    if (existing) {
      // Update existing record to ensure all fields are correct
      await admin.from('hospitals').update({
        name: h.name, address: h.address, phone: h.phone,
        email: h.email, website: h.website, color: h.color,
        description: h.description, is_active: true,
      }).eq('id', existing.id);
    } else {
      const { error } = await admin.from('hospitals').insert({
        org_id: orgId, name: h.name, slug: h.slug,
        address: h.address, phone: h.phone, email: h.email,
        website: h.website, timezone: h.timezone, color: h.color,
        description: h.description, is_active: true,
      });
      if (error) { results.errors.push(`Hospital ${h.name}: ${error.message}`); continue; }
    }
    results.hospitals++;
  }

  // Fetch all 3 hospitals to get their IDs
  const { data: createdHospitals } = await admin
    .from('hospitals').select('id, slug')
    .eq('org_id', orgId)
    .in('slug', HOSPITALS.map(h => h.slug));

  if (!createdHospitals?.length) {
    return NextResponse.json({ error: 'Hospital insert failed', ...results }, { status: 500 });
  }

  const hospMap = Object.fromEntries(createdHospitals.map(h => [h.slug, h.id]));

  // ── 2. Upsert departments ─────────────────────────────────
  for (const h of HOSPITALS) {
    const hospitalId = hospMap[h.slug];
    if (!hospitalId) continue;

    for (const dept of h.departments) {
      const { data: existing } = await admin
        .from('departments').select('id')
        .eq('org_id', orgId).eq('hospital_id', hospitalId).eq('name', dept.name)
        .maybeSingle();

      if (!existing) {
        const { error } = await admin.from('departments').insert({
          org_id: orgId, hospital_id: hospitalId,
          name: dept.name, description: dept.description,
          color: dept.color, is_active: true,
        });
        if (!error) results.departments++;
      }
    }
  }

  // ── 3. Seed channels (if not already present) ────────────
  const channelDefs = [
    { name: 'announcements', description: 'Organization-wide announcements', channel_type: 'announcement', hospital_slug: null },
    { name: 'general',       description: 'General conversation for all staff', channel_type: 'public',  hospital_slug: null },
    { name: 'doctors',       description: 'Doctor-only discussions',            channel_type: 'private', hospital_slug: null },
    { name: 'managers',      description: 'Management team channel',            channel_type: 'private', hospital_slug: null },
    { name: 'hr',            description: 'HR team communications',             channel_type: 'private', hospital_slug: null },
    { name: 'town-country',  description: 'Town & Country team channel',        channel_type: 'public',  hospital_slug: 'town-country' },
    { name: 'clifton',       description: 'Clifton clinic team channel',        channel_type: 'public',  hospital_slug: 'clifton' },
    { name: 'columbia-pike', description: 'Columbia Pike team channel',         channel_type: 'public',  hospital_slug: 'columbia-pike' },
  ];

  for (const ch of channelDefs) {
    const { data: existing } = await admin
      .from('channels').select('id').eq('org_id', orgId).eq('name', ch.name).maybeSingle();
    if (!existing) {
      const { error } = await admin.from('channels').insert({
        org_id: orgId,
        hospital_id: ch.hospital_slug ? hospMap[ch.hospital_slug] ?? null : null,
        name: ch.name,
        description: ch.description,
        channel_type: ch.channel_type,
      });
      if (!error) results.channels++;
    }
  }

  // ── 4. Seed calendar events ───────────────────────────────
  const eventTemplates = [
    { slug: 'town-country', title: 'Staff Meeting — Q3 Review',    type: 'meeting',  daysAhead: 3,  hours: 1,   location: 'Conference Room A',  color: '#2563EB' },
    { slug: 'town-country', title: 'OSHA Training Session',         type: 'training', daysAhead: 5,  hours: 2,   location: 'Training Room',      color: '#DC2626' },
    { slug: 'town-country', title: 'New Ultrasound Equipment Demo', type: 'other',    daysAhead: 7,  hours: 1,   location: 'Treatment Area 2',   color: '#7C3AED' },
    { slug: 'clifton',      title: 'Monthly Team Huddle',           type: 'meeting',  daysAhead: 2,  hours: 0.75,location: 'Break Room',         color: '#7C3AED' },
    { slug: 'clifton',      title: 'Rabies Vaccine Clinic',         type: 'other',    daysAhead: 6,  hours: 4,   location: 'Exam Room 1',        color: '#F97316' },
    { slug: 'clifton',      title: 'CPR Recertification',           type: 'training', daysAhead: 10, hours: 3,   location: 'Training Room',      color: '#EF4444' },
    { slug: 'columbia-pike',title: 'Emergency Team Briefing',       type: 'meeting',  daysAhead: 1,  hours: 1,   location: 'ICU Conference Room',color: '#059669' },
    { slug: 'columbia-pike',title: 'Oncology Specialist Rounds',    type: 'other',    daysAhead: 2,  hours: 2,   location: 'Oncology Suite',     color: '#7C3AED' },
    { slug: 'columbia-pike',title: 'Anesthesia Protocol Update',    type: 'training', daysAhead: 8,  hours: 2,   location: 'Training Lab',       color: '#DC2626' },
    { slug: 'columbia-pike',title: 'Emergency Response Drill',      type: 'training', daysAhead: 12, hours: 3,   location: 'Main Floor',         color: '#EF4444' },
  ];

  const { data: existingEvents } = await admin
    .from('calendar_events').select('title').eq('org_id', orgId);
  const existingTitles = new Set((existingEvents ?? []).map(e => e.title));

  for (const ev of eventTemplates) {
    if (existingTitles.has(ev.title)) continue;
    const hospitalId = hospMap[ev.slug];
    if (!hospitalId) continue;
    const start = new Date(Date.now() + ev.daysAhead * 86_400_000);
    const end   = new Date(start.getTime() + ev.hours * 3_600_000);
    const { error } = await admin.from('calendar_events').insert({
      org_id:      orgId,
      hospital_id: hospitalId,
      title:       ev.title,
      event_type:  ev.type,
      start_time:  start.toISOString(),
      end_time:    end.toISOString(),
      location:    ev.location,
      is_all_day:  false,
      color:       ev.color,
      is_cancelled:false,
      created_by:  user.id,
    });
    if (!error) results.events++;
  }

  // ── 5. Assign super admin to all hospitals ────────────────
  for (const h of createdHospitals) {
    await admin.from('user_hospital_roles').upsert({
      user_id:    user.id,
      hospital_id:h.id,
      org_id:     orgId,
      role:       'super_admin',
      is_active:  true,
    }, { onConflict: 'user_id,hospital_id' }).select();
  }

  return NextResponse.json({
    success: true,
    message: `Seeded ${results.hospitals} hospitals, ${results.departments} departments, ${results.events} events, ${results.channels} channels.`,
    ...results,
  });
}
