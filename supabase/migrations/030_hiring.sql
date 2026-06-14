-- Migration 030: Hiring & Recruitment + Terminations
-- Job postings, applications, hiring events, interviews, termination records

-- ── Job Postings ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_postings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid        NOT NULL,
  hospital_id      uuid,
  title            text        NOT NULL,
  department       text,
  employment_type  text        NOT NULL DEFAULT 'full_time'
                                 CHECK (employment_type IN ('full_time','part_time','contract','per_diem')),
  description      text,
  requirements     text,
  responsibilities text,
  salary_min       numeric(10,2),
  salary_max       numeric(10,2),
  location         text,
  status           text        NOT NULL DEFAULT 'open'
                                 CHECK (status IN ('draft','open','interviewing','offer_made','closed')),
  posted_by        uuid,
  posted_at        timestamptz DEFAULT now(),
  closes_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Job Applications ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_applications (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           uuid        NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  org_id           uuid        NOT NULL,
  applicant_name   text        NOT NULL,
  applicant_email  text        NOT NULL,
  applicant_phone  text,
  cover_letter     text,
  resume_url       text,
  resume_filename  text,
  linkedin_url     text,
  portfolio_url    text,
  years_experience numeric(4,1),
  education_level  text,
  qualifications   jsonb       NOT NULL DEFAULT '[]',
  application_data jsonb       NOT NULL DEFAULT '{}',
  status           text        NOT NULL DEFAULT 'received'
                                 CHECK (status IN ('received','reviewing','interview_scheduled','offer_made','hired','rejected')),
  rating           smallint    CHECK (rating BETWEEN 1 AND 5),
  notes            text,
  applied_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Hiring Events ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hiring_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid        NOT NULL,
  hospital_id    uuid,
  title          text        NOT NULL,
  description    text,
  event_type     text        NOT NULL DEFAULT 'job_fair'
                               CHECK (event_type IN ('job_fair','interview_day','open_house','virtual_hiring')),
  event_date     timestamptz NOT NULL,
  end_date       timestamptz,
  location       text,
  virtual_link   text,
  max_attendees  int,
  status         text        NOT NULL DEFAULT 'upcoming'
                               CHECK (status IN ('upcoming','ongoing','completed','cancelled')),
  linked_jobs    jsonb       NOT NULL DEFAULT '[]',
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Interviews ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interviews (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid        NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  org_id           uuid        NOT NULL,
  interviewer_id   uuid,
  scheduled_at     timestamptz NOT NULL,
  duration_minutes int         NOT NULL DEFAULT 60,
  location         text,
  virtual_link     text,
  interview_type   text        NOT NULL DEFAULT 'video'
                                 CHECK (interview_type IN ('in_person','video','phone')),
  status           text        NOT NULL DEFAULT 'scheduled'
                                 CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  notes            text,
  feedback         text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Termination Records ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS termination_records (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid        NOT NULL,
  employee_id      uuid        NOT NULL,
  hospital_id      uuid,
  terminated_by    uuid,
  reason           text        NOT NULL,
  termination_type text        NOT NULL DEFAULT 'voluntary'
                                 CHECK (termination_type IN ('voluntary','involuntary','layoff','retirement','contract_end')),
  last_working_day date        NOT NULL,
  notes            text,
  rehire_eligible  boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_job_postings_org    ON job_postings(org_id, status);
CREATE INDEX IF NOT EXISTS idx_job_apps_job        ON job_applications(job_id, status);
CREATE INDEX IF NOT EXISTS idx_job_apps_org        ON job_applications(org_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_hiring_events_org   ON hiring_events(org_id, event_date);
CREATE INDEX IF NOT EXISTS idx_interviews_app      ON interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_terminations_emp    ON termination_records(employee_id);

-- ── Seed realistic hiring data ────────────────────────────────────────────────
DO $$
DECLARE
  v_org_id  uuid;
  v_hosp1   uuid;
  v_hosp2   uuid;
  v_hosp3   uuid;
  v_job1    uuid;
  v_job2    uuid;
  v_job3    uuid;
  v_job4    uuid;
  v_app1    uuid;
  v_app2    uuid;
  v_app3    uuid;
  v_app_dr  uuid;
BEGIN
  SELECT id INTO v_org_id FROM organizations LIMIT 1;
  IF v_org_id IS NULL THEN RAISE NOTICE 'No org — skipping 030 seed'; RETURN; END IF;

  -- Pick hospitals by position (works regardless of name)
  SELECT id INTO v_hosp1 FROM hospitals WHERE org_id = v_org_id ORDER BY name LIMIT 1 OFFSET 0;
  SELECT id INTO v_hosp2 FROM hospitals WHERE org_id = v_org_id ORDER BY name LIMIT 1 OFFSET 1;
  SELECT id INTO v_hosp3 FROM hospitals WHERE org_id = v_org_id ORDER BY name LIMIT 1 OFFSET 2;
  -- Fall back to hosp1 if fewer than 3 hospitals exist
  IF v_hosp2 IS NULL THEN v_hosp2 := v_hosp1; END IF;
  IF v_hosp3 IS NULL THEN v_hosp3 := v_hosp1; END IF;

  -- ── Job Postings ──────────────────────────────────────────────────────────
  INSERT INTO job_postings (org_id, hospital_id, title, department, employment_type, description, requirements, responsibilities, salary_min, salary_max, location, status, posted_at)
  VALUES
    (v_org_id, v_hosp1, 'Veterinary Technician', 'Clinical', 'full_time',
     'We are seeking a skilled Veterinary Technician to join our team. You will work alongside experienced veterinarians to provide exceptional care for our patients.',
     E'• Minimum 2 years veterinary experience\n• Associate degree in Veterinary Technology\n• CVT/RVT certification preferred\n• Excellent communication skills',
     E'• Assist veterinarians during exams and procedures\n• Administer medications and vaccines\n• Maintain accurate medical records\n• Educate clients on pet care',
     52000, 68000, 'Arlington, VA', 'open', NOW() - INTERVAL '5 days'),

    (v_org_id, v_hosp2, 'Client Services Representative', 'Front Office', 'full_time',
     'Be the friendly face that welcomes our clients and their beloved pets. Join our front office team and make every visit a positive experience.',
     E'• 1+ year customer service experience\n• Animal handling experience preferred\n• Strong computer & phone skills\n• Bilingual (Spanish) a plus',
     E'• Greet clients and check in patients\n• Schedule and confirm appointments\n• Process payments and insurance claims\n• Manage multi-line phone system',
     38000, 48000, 'Virginia', 'open', NOW() - INTERVAL '3 days'),

    (v_org_id, v_hosp1, 'Emergency Veterinarian', 'Emergency Medicine', 'full_time',
     'Exciting opportunity for an experienced Emergency Veterinarian. Competitive compensation, sign-on bonus, and excellent work-life balance at our 24/7 emergency center.',
     E'• DVM/VMD degree required\n• Emergency medicine experience preferred\n• Active state veterinary license\n• Strong diagnostic and surgical skills',
     E'• Provide emergency care to critically ill animals\n• Perform emergency surgical procedures\n• Lead and mentor technician team\n• Communicate diagnoses and treatment plans to clients',
     140000, 185000, 'Arlington, VA', 'interviewing', NOW() - INTERVAL '12 days'),

    (v_org_id, v_hosp3, 'Veterinary Assistant', 'Clinical', 'part_time',
     'Part-time Veterinary Assistant position. Great for veterinary students or those building a career in animal medicine. Flexible weekend schedule available.',
     E'• High school diploma or equivalent\n• Animal handling experience required\n• Ability to lift 50 lbs\n• Available weekends',
     E'• Restrain and comfort animals during exams\n• Clean and sterilize instruments\n• Maintain facility cleanliness\n• Assist with routine diagnostic procedures',
     18, 22, 'Virginia', 'open', NOW() - INTERVAL '1 day'),

    (v_org_id, v_hosp2, 'Practice Manager', 'Administration', 'full_time',
     'We are looking for an experienced Practice Manager to oversee daily operations, staff management, and client experience across our growing veterinary practice.',
     E'• 3+ years veterinary or medical practice management\n• Strong leadership and communication skills\n• Experience with practice management software\n• Business or healthcare administration degree preferred',
     E'• Manage day-to-day clinic operations\n• Supervise and schedule front office and support staff\n• Monitor KPIs and drive revenue growth\n• Ensure regulatory compliance and staff training',
     70000, 90000, 'Virginia', 'open', NOW() - INTERVAL '7 days'),

    (v_org_id, v_hosp3, 'Veterinary Receptionist', 'Front Office', 'part_time',
     'We need a warm, organized receptionist to join our team on a part-time basis. Prior veterinary experience is a bonus but a love of animals is a must!',
     E'• 1+ year receptionist or admin experience\n• Comfortable with multi-line phones\n• Proficient in MS Office or Google Workspace\n• Animal lover with calm demeanor',
     E'• Answer phones and schedule appointments\n• Check patients in and out\n• Handle billing inquiries\n• Maintain clean and welcoming reception area',
     16, 20, 'Virginia', 'open', NOW() - INTERVAL '2 days')
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_job1 FROM job_postings WHERE org_id = v_org_id AND title = 'Veterinary Technician'           LIMIT 1;
  SELECT id INTO v_job2 FROM job_postings WHERE org_id = v_org_id AND title = 'Client Services Representative'  LIMIT 1;
  SELECT id INTO v_job3 FROM job_postings WHERE org_id = v_org_id AND title = 'Emergency Veterinarian'          LIMIT 1;
  SELECT id INTO v_job4 FROM job_postings WHERE org_id = v_org_id AND title = 'Veterinary Assistant'            LIMIT 1;

  -- ── Applications for Vet Tech ─────────────────────────────────────────────
  IF v_job1 IS NOT NULL THEN
    INSERT INTO job_applications (org_id, job_id, applicant_name, applicant_email, applicant_phone, cover_letter, resume_filename, linkedin_url, years_experience, education_level, status, rating, applied_at, qualifications)
    VALUES
      (v_org_id, v_job1, 'Maria Santos', 'maria.santos@email.com', '(703) 555-0142',
       'I am a passionate veterinary technician with 4 years of experience in both general practice and emergency settings. My expertise in anesthesia monitoring and surgical assistance makes me an excellent fit. I hold my RVT and am committed to continuing education.',
       'maria_santos_resume.pdf', 'linkedin.com/in/mariasantos', 4, 'Associates Degree', 'reviewing', 4, NOW() - INTERVAL '4 days',
       '[{"name": "RVT Certification", "issuer": "NAVTA", "year": 2022}, {"name": "Anesthesia Monitoring Certificate", "issuer": "VetFolio", "year": 2023}]'),

      (v_org_id, v_job1, 'James Chen', 'james.chen@email.com', '(571) 555-0189',
       'Recently certified RVT with hands-on experience in internal medicine and dentistry procedures. Eager to bring my skills and enthusiasm to your team.',
       'james_chen_resume.pdf', NULL, 2, 'Associates Degree', 'received', 3, NOW() - INTERVAL '2 days', '[]'),

      (v_org_id, v_job1, 'Ashley Williams', 'ashley.w@email.com', '(703) 555-0267',
       'Six years as a CVT in a busy small animal practice. Proficient in digital radiography, laboratory procedures, and client education. Looking for a dynamic team where I can grow and take on leadership responsibilities.',
       'ashley_williams_cv.pdf', 'linkedin.com/in/ashleywilliams-cvt', 6, 'Associates Degree', 'interview_scheduled', 5, NOW() - INTERVAL '6 days',
       '[{"name": "CVT License", "issuer": "VA Board", "year": 2019}, {"name": "Dental Radiography Certificate", "issuer": "AVDT", "year": 2021}, {"name": "Fear Free Certified", "issuer": "Fear Free", "year": 2023}]'),

      (v_org_id, v_job1, 'Tyler Brooks', 'tyler.brooks@email.com', '(540) 555-0388',
       'I recently completed my RVT licensure exam and am eager to launch my career in veterinary medicine. I have completed 500+ hours of clinical externship and am passionate about emergency and critical care.',
       'tyler_brooks_resume.pdf', NULL, 1, 'Associates Degree', 'rejected', 2, NOW() - INTERVAL '8 days', '[]')
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_app1 FROM job_applications WHERE org_id = v_org_id AND applicant_name = 'Ashley Williams' LIMIT 1;
  END IF;

  -- ── Applications for CSR ──────────────────────────────────────────────────
  IF v_job2 IS NOT NULL THEN
    INSERT INTO job_applications (org_id, job_id, applicant_name, applicant_email, applicant_phone, cover_letter, resume_filename, years_experience, education_level, status, rating, applied_at, qualifications)
    VALUES
      (v_org_id, v_job2, 'Priya Patel', 'priya.patel@email.com', '(703) 555-0334',
       'Customer-focused professional with 3 years in veterinary reception. I love connecting with pet owners and ensuring their experience is stress-free. Fluent in English, Hindi, and conversational Spanish.',
       'priya_patel_resume.pdf', 3, 'Bachelors Degree', 'offer_made', 4, NOW() - INTERVAL '10 days', '[]'),

      (v_org_id, v_job2, 'Daniel Kim', 'daniel.kim@email.com', '(571) 555-0415',
       'Experienced receptionist transitioning from a human medical practice to veterinary medicine. Strong EHR/practice management software skills. Passionate about animals — I have volunteered at the county shelter for 3 years.',
       'daniel_kim_resume.pdf', 5, 'Some College', 'reviewing', 3, NOW() - INTERVAL '3 days', '[]'),

      (v_org_id, v_job2, 'Sandra Lee', 'sandra.lee88@email.com', '(703) 555-0512',
       'I have worked in customer-facing roles for 7 years and am looking to bring my skills to an animal care environment. I own two dogs and have always been passionate about veterinary wellness.',
       'sandra_lee_resume.pdf', 7, 'High School Diploma', 'rejected', 2, NOW() - INTERVAL '12 days', '[]')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── Applications for Emergency Vet ────────────────────────────────────────
  IF v_job3 IS NOT NULL THEN
    INSERT INTO job_applications (org_id, job_id, applicant_name, applicant_email, applicant_phone, cover_letter, resume_filename, linkedin_url, years_experience, education_level, status, rating, applied_at, qualifications)
    VALUES
      (v_org_id, v_job3, 'Dr. Rachel Morgan', 'r.morgan.dvm@email.com', '(202) 555-0521',
       'Board-eligible emergency veterinarian with 7 years of critical care experience. Led a team of 12 technicians at a Level 1 emergency facility. Seeking a collaborative environment where clinical excellence is the standard. Available for immediate start.',
       'dr_morgan_cv.pdf', 'linkedin.com/in/rachelmorgan-dvm', 7, 'Doctorate (DVM/VMD)', 'interview_scheduled', 5, NOW() - INTERVAL '9 days',
       '[{"name": "DVM", "issuer": "Cornell University", "year": 2017}, {"name": "State Veterinary License", "issuer": "State Board", "year": 2017}, {"name": "ACVECC Diplomate (board-eligible)", "issuer": "ACVECC", "year": 2023}]'),

      (v_org_id, v_job3, 'Dr. Marcus Lee', 'marcus.lee@vetmail.com', '(301) 555-0698',
       'Emergency and critical care veterinarian with 4 years post-residency experience. Strong surgical skills including orthopedic and soft tissue procedures. Published research in JVECC on sepsis management.',
       'dr_lee_resume.pdf', NULL, 4, 'Doctorate (DVM/VMD)', 'reviewing', 4, NOW() - INTERVAL '7 days',
       '[{"name": "DVM", "issuer": "Virginia-Maryland CVM", "year": 2016}, {"name": "State Veterinary License", "issuer": "State Board", "year": 2016}]'),

      (v_org_id, v_job3, 'Dr. Aisha Nwosu', 'a.nwosu.dvm@email.com', '(443) 555-0776',
       'General practice veterinarian with 5 years of experience seeking to transition into emergency medicine. Strong diagnostics background and completed an emergency medicine externship. Passionate about trauma and toxicology cases.',
       'dr_nwosu_resume.pdf', NULL, 5, 'Doctorate (DVM/VMD)', 'received', 3, NOW() - INTERVAL '1 day',
       '[{"name": "DVM", "issuer": "Tuskegee University", "year": 2019}, {"name": "State Veterinary License", "issuer": "State Board", "year": 2019}]')
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_app_dr FROM job_applications WHERE org_id = v_org_id AND applicant_name = 'Dr. Rachel Morgan' LIMIT 1;
  END IF;

  -- ── Applications for Vet Assistant ────────────────────────────────────────
  IF v_job4 IS NOT NULL THEN
    INSERT INTO job_applications (org_id, job_id, applicant_name, applicant_email, applicant_phone, cover_letter, resume_filename, years_experience, education_level, status, rating, applied_at, qualifications)
    VALUES
      (v_org_id, v_job4, 'Emma Johnson', 'emma.j2026@email.com', '(703) 555-0712',
       'Second-year veterinary technology student looking for part-time work to gain real-world clinical experience. I have volunteered at the Animal Welfare League for 2 years and completed a summer externship at a local clinic.',
       'emma_johnson_resume.pdf', 1, 'Some College', 'received', 3, NOW() - INTERVAL '1 day', '[]'),

      (v_org_id, v_job4, 'Carlos Rivera', 'carlos.r@email.com', '(571) 555-0841',
       'Animal lover with 2 years of shelter experience looking for a role that lets me grow in veterinary medicine. I am reliable, a fast learner, and comfortable handling dogs and cats of all sizes.',
       'carlos_rivera_resume.pdf', 2, 'High School Diploma', 'reviewing', 4, NOW() - INTERVAL '3 days', '[]')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── Hiring Events ─────────────────────────────────────────────────────────
  INSERT INTO hiring_events (org_id, hospital_id, title, description, event_type, event_date, end_date, location, max_attendees, status)
  VALUES
    (v_org_id, v_hosp1,
     'VetCentral Career Fair 2026',
     'Join us for our annual career fair! Meet our veterinarians, technicians, and support staff across all hospitals. Learn about open positions, tour our state-of-the-art facility, and be ready for on-the-spot interviews. Light refreshments provided.',
     'job_fair',
     NOW() + INTERVAL '14 days',
     NOW() + INTERVAL '14 days' + INTERVAL '4 hours',
     '4001 Main St, Arlington VA 22204',
     150, 'upcoming'),

    (v_org_id, v_hosp2,
     'Emergency Medicine Interview Day',
     'Dedicated interview day for all Emergency Veterinarian candidates. Panel interviews with our Chief of Medicine and senior vet team. Please bring your CV and license documentation.',
     'interview_day',
     NOW() + INTERVAL '5 days',
     NOW() + INTERVAL '5 days' + INTERVAL '6 hours',
     'Hospital Conference Room B',
     20, 'upcoming'),

    (v_org_id, v_hosp3,
     'Virtual Hiring Open House',
     'Can''t make it in person? Join our virtual open house to learn about all current openings, meet department heads via video, and ask questions in real time.',
     'virtual_hiring',
     NOW() + INTERVAL '3 days',
     NOW() + INTERVAL '3 days' + INTERVAL '2 hours',
     NULL,
     100, 'upcoming')
  ON CONFLICT DO NOTHING;

  -- ── Interviews for interview_scheduled applicants ─────────────────────────
  IF v_app1 IS NOT NULL THEN
    INSERT INTO interviews (application_id, org_id, scheduled_at, duration_minutes, interview_type, status, notes)
    VALUES (
      v_app1, v_org_id,
      NOW() + INTERVAL '3 days' + INTERVAL '10 hours',
      60, 'in_person', 'scheduled',
      'Focus on clinical skills, anesthesia experience, and team fit. Ask about emergency protocol experience.'
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF v_app_dr IS NOT NULL THEN
    INSERT INTO interviews (application_id, org_id, scheduled_at, duration_minutes, interview_type, status, notes)
    VALUES (
      v_app_dr, v_org_id,
      NOW() + INTERVAL '5 days' + INTERVAL '9 hours',
      90, 'in_person', 'scheduled',
      'Panel interview with Chief of Medicine. Assess emergency triage approach, surgical experience, and leadership style.'
    ) ON CONFLICT DO NOTHING;
  END IF;

  RAISE NOTICE 'Migration 030 complete — hiring data seeded';
END $$;
