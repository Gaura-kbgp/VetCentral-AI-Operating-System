/**
 * One-time script: sets the admin user's password to match DEV_ADMIN_PASSWORD in .env.local
 * Run: npx tsx scripts/reset-dev-admin.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL        = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL         = process.env.DEV_ADMIN_EMAIL!;
const ADMIN_PASSWORD      = process.env.DEV_ADMIN_PASSWORD!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Missing env vars. Make sure .env.local is filled in.');
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Looking up user: ${ADMIN_EMAIL}`);

  // Find the user by email
  const { data: { users }, error: listErr } = await adminClient.auth.admin.listUsers();
  if (listErr) { console.error('List error:', listErr.message); process.exit(1); }

  const target = users.find(u => u.email === ADMIN_EMAIL);
  if (!target) {
    console.error(`No user found with email: ${ADMIN_EMAIL}`);
    console.log('\nAvailable users:');
    users.forEach(u => console.log(' -', u.email));
    process.exit(1);
  }

  console.log(`Found user: ${target.email} (id: ${target.id})`);

  // Update password
  const { error: updateErr } = await adminClient.auth.admin.updateUserById(target.id, {
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });

  if (updateErr) {
    console.error('Update failed:', updateErr.message);
    process.exit(1);
  }

  console.log(`\nPassword updated successfully!`);
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
  console.log('\nYou can now log in at localhost:3000/login');
}

main();
