import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';

// ─────────────────────────────────────────────────────────────
// Demo employee data
// ─────────────────────────────────────────────────────────────

const EMPLOYEES: Array<{
  firstName: string; lastName: string; role: string;
  jobTitle: string; department: string; hospital: string;
}> = [
  // ── Town & Country Animal Hospital (25) ──────────────────
  { firstName: 'Margaret', lastName: 'Sullivan',  role: 'practice_manager', jobTitle: 'Hospital Manager',           department: 'Human Resources',  hospital: 'town-country' },
  { firstName: 'James',    lastName: 'Hartley',   role: 'doctor',           jobTitle: 'Associate Veterinarian',      department: 'Medical',          hospital: 'town-country' },
  { firstName: 'Priya',    lastName: 'Nair',      role: 'doctor',           jobTitle: 'Senior Veterinarian',         department: 'Medical',          hospital: 'town-country' },
  { firstName: 'Derek',    lastName: 'Okafor',    role: 'doctor',           jobTitle: 'Veterinary Surgeon',          department: 'Surgery',          hospital: 'town-country' },
  { firstName: 'Sophia',   lastName: 'Chen',      role: 'doctor',           jobTitle: 'Emergency Veterinarian',      department: 'Emergency & Triage', hospital: 'town-country' },
  { firstName: 'Lena',     lastName: 'Fischer',   role: 'doctor',           jobTitle: 'Associate Veterinarian',      department: 'Medical',          hospital: 'town-country' },
  { firstName: 'Carlos',   lastName: 'Mendez',    role: 'va',               jobTitle: 'Veterinary Assistant',        department: 'Medical',          hospital: 'town-country' },
  { firstName: 'Aisha',    lastName: 'Thompson',  role: 'va',               jobTitle: 'Veterinary Technician',       department: 'Surgery',          hospital: 'town-country' },
  { firstName: 'Ryan',     lastName: 'Park',      role: 'va',               jobTitle: 'Vet Tech - Emergency',        department: 'Emergency & Triage', hospital: 'town-country' },
  { firstName: 'Brittany', lastName: 'Monroe',    role: 'va',               jobTitle: 'Veterinary Technician',       department: 'Medical',          hospital: 'town-country' },
  { firstName: 'Tyler',    lastName: 'Jenkins',   role: 'va',               jobTitle: 'Veterinary Assistant',        department: 'Medical',          hospital: 'town-country' },
  { firstName: 'Fatima',   lastName: 'Al-Hassan', role: 'va',               jobTitle: 'Surgery Technician',          department: 'Surgery',          hospital: 'town-country' },
  { firstName: 'Kevin',    lastName: 'Nguyen',    role: 'csr',              jobTitle: 'Client Services Representative', department: 'Client Services', hospital: 'town-country' },
  { firstName: 'Ashley',   lastName: 'Brooks',    role: 'csr',              jobTitle: 'Front Desk Coordinator',      department: 'Client Services',  hospital: 'town-country' },
  { firstName: 'Marcus',   lastName: 'Williams',  role: 'csr',              jobTitle: 'Client Experience Specialist', department: 'Client Services', hospital: 'town-country' },
  { firstName: 'Diana',    lastName: 'Reyes',     role: 'csr',              jobTitle: 'Client Services Lead',        department: 'Client Services',  hospital: 'town-country' },
  { firstName: 'Ethan',    lastName: 'Kowalski',  role: 'csr',              jobTitle: 'Reception Coordinator',       department: 'Client Services',  hospital: 'town-country' },
  { firstName: 'Jasmine',  lastName: 'Carter',    role: 'hr',               jobTitle: 'HR Coordinator',              department: 'Human Resources',  hospital: 'town-country' },
  { firstName: 'Nathan',   lastName: 'Bell',      role: 'it_admin',         jobTitle: 'IT Support Specialist',       department: 'Human Resources',  hospital: 'town-country' },
  { firstName: 'Olivia',   lastName: 'Patel',     role: 'va',               jobTitle: 'Veterinary Technician',       department: 'Medical',          hospital: 'town-country' },
  { firstName: 'Samuel',   lastName: 'Greene',    role: 'doctor',           jobTitle: 'Internist Veterinarian',      department: 'Medical',          hospital: 'town-country' },
  { firstName: 'Clara',    lastName: 'Watson',    role: 'va',               jobTitle: 'Vet Assistant - Triage',      department: 'Emergency & Triage', hospital: 'town-country' },
  { firstName: 'Jordan',   lastName: 'Lewis',     role: 'csr',              jobTitle: 'Billing Specialist',          department: 'Client Services',  hospital: 'town-country' },
  { firstName: 'Amara',    lastName: 'Diallo',    role: 'va',               jobTitle: 'Surgery Technician',          department: 'Surgery',          hospital: 'town-country' },
  { firstName: 'Patrick',  lastName: 'O\'Brien',  role: 'marketing',        jobTitle: 'Marketing Coordinator',       department: 'Client Services',  hospital: 'town-country' },

  // ── Animal Clinic of Clifton (20) ────────────────────────
  { firstName: 'Rebecca',  lastName: 'Walsh',     role: 'hospital_admin',   jobTitle: 'Clinic Director',             department: 'Human Resources',  hospital: 'clifton' },
  { firstName: 'Jonathan', lastName: 'Kim',       role: 'doctor',           jobTitle: 'Lead Veterinarian',           department: 'Medical',          hospital: 'clifton' },
  { firstName: 'Vanessa',  lastName: 'Torres',    role: 'doctor',           jobTitle: 'Associate Veterinarian',      department: 'Medical',          hospital: 'clifton' },
  { firstName: 'Michael',  lastName: 'Adeyemi',   role: 'doctor',           jobTitle: 'Avian & Exotic Specialist',   department: 'Medical',          hospital: 'clifton' },
  { firstName: 'Lauren',   lastName: 'Hoffman',   role: 'doctor',           jobTitle: 'Surgical Veterinarian',       department: 'Surgery',          hospital: 'clifton' },
  { firstName: 'Brandon',  lastName: 'Cruz',      role: 'va',               jobTitle: 'Senior Vet Technician',       department: 'Medical',          hospital: 'clifton' },
  { firstName: 'Tanya',    lastName: 'Morrison',  role: 'va',               jobTitle: 'Veterinary Technician',       department: 'Surgery',          hospital: 'clifton' },
  { firstName: 'Isaiah',   lastName: 'Fletcher',  role: 'va',               jobTitle: 'Veterinary Assistant',        department: 'Medical',          hospital: 'clifton' },
  { firstName: 'Natalie',  lastName: 'Sato',      role: 'va',               jobTitle: 'Exotic Animal Technician',    department: 'Medical',          hospital: 'clifton' },
  { firstName: 'Gregory',  lastName: 'Hart',      role: 'va',               jobTitle: 'Veterinary Technician',       department: 'Medical',          hospital: 'clifton' },
  { firstName: 'Simone',   lastName: 'Dubois',    role: 'csr',              jobTitle: 'Client Relations Manager',    department: 'Client Services',  hospital: 'clifton' },
  { firstName: 'Aaron',    lastName: 'Larson',    role: 'csr',              jobTitle: 'Front Desk Associate',        department: 'Client Services',  hospital: 'clifton' },
  { firstName: 'Melissa',  lastName: 'Young',     role: 'csr',              jobTitle: 'Client Services Rep',         department: 'Client Services',  hospital: 'clifton' },
  { firstName: 'Daniel',   lastName: 'Fernandez', role: 'csr',              jobTitle: 'Billing & Records Clerk',     department: 'Client Services',  hospital: 'clifton' },
  { firstName: 'Holly',    lastName: 'Pierce',    role: 'hr',               jobTitle: 'HR & Payroll Specialist',     department: 'Human Resources',  hospital: 'clifton' },
  { firstName: 'Victor',   lastName: 'Romero',    role: 'practice_manager', jobTitle: 'Operations Manager',          department: 'Human Resources',  hospital: 'clifton' },
  { firstName: 'Ingrid',   lastName: 'Strand',    role: 'va',               jobTitle: 'Surgical Technician',         department: 'Surgery',          hospital: 'clifton' },
  { firstName: 'Leon',     lastName: 'Baptiste',  role: 'doctor',           jobTitle: 'Associate Veterinarian',      department: 'Medical',          hospital: 'clifton' },
  { firstName: 'Crystal',  lastName: 'Owens',     role: 'va',               jobTitle: 'Veterinary Technician',       department: 'Medical',          hospital: 'clifton' },
  { firstName: 'Terrence', lastName: 'Hicks',     role: 'csr',              jobTitle: 'Customer Experience Rep',     department: 'Client Services',  hospital: 'clifton' },

  // ── Columbia Pike Animal Hospital & Emergency Center (30) ─
  { firstName: 'Dr. Elena', lastName: 'Vasquez',  role: 'hospital_admin',   jobTitle: 'Medical Director',            department: 'Medical',          hospital: 'columbia-pike' },
  { firstName: 'Frank',    lastName: 'Nakamura',  role: 'practice_manager', jobTitle: 'Hospital Administrator',      department: 'Human Resources',  hospital: 'columbia-pike' },
  { firstName: 'Keisha',   lastName: 'Robinson',  role: 'doctor',           jobTitle: 'Emergency Veterinarian',      department: 'Emergency & Critical', hospital: 'columbia-pike' },
  { firstName: 'Howard',   lastName: 'Chang',     role: 'doctor',           jobTitle: 'Internal Medicine Specialist', department: 'Medical',         hospital: 'columbia-pike' },
  { firstName: 'Alicia',   lastName: 'Ramirez',   role: 'doctor',           jobTitle: 'Oncology Veterinarian',       department: 'Medical',          hospital: 'columbia-pike' },
  { firstName: 'Steven',   lastName: 'Morrow',    role: 'doctor',           jobTitle: 'Surgical Specialist',         department: 'Surgery',          hospital: 'columbia-pike' },
  { firstName: 'Deborah',  lastName: 'Simmons',   role: 'doctor',           jobTitle: 'Critical Care Veterinarian',  department: 'Emergency & Critical', hospital: 'columbia-pike' },
  { firstName: 'Andre',    lastName: 'Leblanc',   role: 'doctor',           jobTitle: 'Emergency Veterinarian',      department: 'Emergency & Critical', hospital: 'columbia-pike' },
  { firstName: 'Monica',   lastName: 'Shah',      role: 'doctor',           jobTitle: 'Associate Veterinarian',      department: 'Medical',          hospital: 'columbia-pike' },
  { firstName: 'Troy',     lastName: 'Baldwin',   role: 'doctor',           jobTitle: 'Surgical Veterinarian',       department: 'Surgery',          hospital: 'columbia-pike' },
  { firstName: 'Zoe',      lastName: 'Andersen',  role: 'va',               jobTitle: 'ICU Technician',              department: 'Emergency & Critical', hospital: 'columbia-pike' },
  { firstName: 'Darius',   lastName: 'Fields',    role: 'va',               jobTitle: 'Emergency Vet Technician',    department: 'Emergency & Critical', hospital: 'columbia-pike' },
  { firstName: 'Carmen',   lastName: 'Ibáñez',    role: 'va',               jobTitle: 'Oncology Technician',         department: 'Medical',          hospital: 'columbia-pike' },
  { firstName: 'Wesley',   lastName: 'Cunningham',role: 'va',               jobTitle: 'Surgical Technician',         department: 'Surgery',          hospital: 'columbia-pike' },
  { firstName: 'Bianca',   lastName: 'Osei',      role: 'va',               jobTitle: 'Veterinary Technician',       department: 'Medical',          hospital: 'columbia-pike' },
  { firstName: 'Julian',   lastName: 'Marsh',     role: 'va',               jobTitle: 'Emergency Vet Technician',    department: 'Emergency & Critical', hospital: 'columbia-pike' },
  { firstName: 'Heather',  lastName: 'Norris',    role: 'va',               jobTitle: 'ICU Vet Technician',          department: 'Emergency & Critical', hospital: 'columbia-pike' },
  { firstName: 'Rashid',   lastName: 'Khalil',    role: 'va',               jobTitle: 'Surgical Assistant',          department: 'Surgery',          hospital: 'columbia-pike' },
  { firstName: 'Serena',   lastName: 'Bloom',     role: 'csr',              jobTitle: 'Client Intake Coordinator',   department: 'Client Services',  hospital: 'columbia-pike' },
  { firstName: 'Omar',     lastName: 'Hassan',    role: 'csr',              jobTitle: 'Triage Coordinator',          department: 'Client Services',  hospital: 'columbia-pike' },
  { firstName: 'Patricia', lastName: 'Dunn',      role: 'csr',              jobTitle: 'Client Relations Lead',       department: 'Client Services',  hospital: 'columbia-pike' },
  { firstName: 'Marcus',   lastName: 'Ewing',     role: 'csr',              jobTitle: 'Front Desk Supervisor',       department: 'Client Services',  hospital: 'columbia-pike' },
  { firstName: 'Grace',    lastName: 'Winters',   role: 'csr',              jobTitle: 'Billing Coordinator',         department: 'Client Services',  hospital: 'columbia-pike' },
  { firstName: 'Felix',    lastName: 'Brandt',    role: 'hr',               jobTitle: 'HR Manager',                  department: 'Human Resources',  hospital: 'columbia-pike' },
  { firstName: 'Constance',lastName: 'Levy',      role: 'hr',               jobTitle: 'HR Specialist',               department: 'Human Resources',  hospital: 'columbia-pike' },
  { firstName: 'Roger',    lastName: 'Tran',      role: 'it_admin',         jobTitle: 'Systems Administrator',       department: 'Operations',       hospital: 'columbia-pike' },
  { firstName: 'Yolanda',  lastName: 'Price',     role: 'marketing',        jobTitle: 'Marketing & Communications',  department: 'Client Services',  hospital: 'columbia-pike' },
  { firstName: 'Eddie',    lastName: 'Sutton',    role: 'va',               jobTitle: 'Veterinary Technician',       department: 'Medical',          hospital: 'columbia-pike' },
  { firstName: 'Lydia',    lastName: 'Coleman',   role: 'va',               jobTitle: 'Vet Technician - Oncology',   department: 'Medical',          hospital: 'columbia-pike' },
  { firstName: 'Ray',      lastName: 'Gutierrez', role: 'practice_manager', jobTitle: 'Operations Supervisor',       department: 'Operations',       hospital: 'columbia-pike' },
];

// ─────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();

  // Only super_admin / org_admin may seed
  const { data: orgRole } = await admin
    .from('org_user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['super_admin', 'org_admin'])
    .maybeSingle();

  const { data: hospRole } = await admin
    .from('user_hospital_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['super_admin', 'org_admin', 'hospital_admin'])
    .maybeSingle();

  if (!orgRole && !hospRole) {
    return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 });
  }

  // Get org + hospitals
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'Profile not found' }, { status: 400 });

  const { data: hospitals } = await admin
    .from('hospitals')
    .select('id, slug')
    .eq('org_id', profile.org_id)
    .in('slug', ['town-country', 'clifton', 'columbia-pike']);

  if (!hospitals?.length) {
    return NextResponse.json({ error: 'Hospitals not found — run migration 020 first' }, { status: 400 });
  }

  const hospMap = Object.fromEntries(hospitals.map(h => [h.slug, h.id]));

  const results = { created: 0, skipped: 0, errors: [] as string[] };

  for (const emp of EMPLOYEES) {
    const hospitalId = hospMap[emp.hospital];
    if (!hospitalId) { results.errors.push(`Hospital not found: ${emp.hospital}`); continue; }

    const email    = `${emp.firstName.toLowerCase().replace(/[^a-z]/g, '')}.${emp.lastName.toLowerCase().replace(/[^a-z]/g, '')}@vetospro.demo`;
    const password = 'Demo1234!';

    // Create auth user
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: emp.firstName,
        last_name:  emp.lastName,
      },
    });

    if (authErr) {
      if (authErr.message?.includes('already been registered') || authErr.message?.includes('already exists')) {
        results.skipped++;
        continue;
      }
      results.errors.push(`${emp.firstName} ${emp.lastName}: ${authErr.message}`);
      continue;
    }

    const userId = authData.user.id;

    // Upsert profile
    await admin.from('profiles').upsert({
      id:         userId,
      org_id:     profile.org_id,
      email,
      first_name: emp.firstName,
      last_name:  emp.lastName,
      job_title:  emp.jobTitle,
      department: emp.department,
      is_active:  true,
    }, { onConflict: 'id' });

    // Assign hospital role
    await admin.from('user_hospital_roles').upsert({
      user_id:     userId,
      hospital_id: hospitalId,
      role:        emp.role,
      is_active:   true,
    }, { onConflict: 'user_id,hospital_id' });

    results.created++;
  }

  return NextResponse.json({
    success: true,
    message: `Seeded ${results.created} employees, skipped ${results.skipped} existing`,
    ...results,
  });
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();

  const { count } = await admin
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', profile?.org_id ?? '');

  return NextResponse.json({ employeeCount: count ?? 0, totalToSeed: EMPLOYEES.length });
}
