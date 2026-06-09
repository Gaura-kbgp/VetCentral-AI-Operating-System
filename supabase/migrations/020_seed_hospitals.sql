-- Migration 020: Seed Hospital Data
DO $$
DECLARE
  v_org UUID; h1 UUID; h2 UUID; h3 UUID;
BEGIN
  SELECT id INTO v_org FROM organizations LIMIT 1;
  IF v_org IS NULL THEN RETURN; END IF;

  -- 3 hospitals
  INSERT INTO hospitals (org_id,name,slug,address,phone,email,website,timezone,color,description,is_active) VALUES
    (v_org,'Town & Country Animal Hospital','town-country','1234 Main St, Reston, VA 20190','(703) 555-0101','info@tcah.com','https://tcah.com','America/New_York','#2563EB','Full-service companion animal hospital in Reston.',true),
    (v_org,'Animal Clinic of Clifton','clifton','12900 Lee Hwy, Clifton, VA 20124','(703) 555-0202','info@cliftonvet.com','https://cliftonvet.com','America/New_York','#7C3AED','Neighborhood clinic for dogs, cats, and exotic pets.',true),
    (v_org,'Columbia Pike Animal Hospital & Emergency Center','columbia-pike','6134 Columbia Pike, Falls Church, VA 22041','(703) 555-0303','info@columbiapikevet.com','https://columbiapikevet.com','America/New_York','#059669','24/7 emergency and specialty veterinary hospital.',true)
  ON CONFLICT (org_id,slug) DO UPDATE SET name=EXCLUDED.name,color=EXCLUDED.color,is_active=EXCLUDED.is_active;

  SELECT id INTO h1 FROM hospitals WHERE org_id=v_org AND slug='town-country';
  SELECT id INTO h2 FROM hospitals WHERE org_id=v_org AND slug='clifton';
  SELECT id INTO h3 FROM hospitals WHERE org_id=v_org AND slug='columbia-pike';

  -- 15 departments
  INSERT INTO departments (org_id,hospital_id,name,description,color,is_active) VALUES
    (v_org,h1,'Medical','General medicine and diagnostics','#2563EB',true),
    (v_org,h1,'Surgery','Soft tissue and orthopedic surgery','#7C3AED',true),
    (v_org,h1,'Emergency & Triage','After-hours urgent care','#DC2626',true),
    (v_org,h1,'Client Services','Reception and scheduling','#D97706',true),
    (v_org,h1,'Human Resources','Staff management and compliance','#059669',true),
    (v_org,h2,'Medical','General practice medicine','#7C3AED',true),
    (v_org,h2,'Surgery','Routine surgical care','#2563EB',true),
    (v_org,h2,'Client Services','Front desk and billing','#D97706',true),
    (v_org,h2,'Human Resources','HR and payroll','#059669',true),
    (v_org,h3,'Medical','Internal medicine and oncology','#059669',true),
    (v_org,h3,'Surgery','Advanced surgical services','#2563EB',true),
    (v_org,h3,'Emergency & Critical','24/7 emergency and ICU','#DC2626',true),
    (v_org,h3,'Client Services','Reception and triage intake','#D97706',true),
    (v_org,h3,'Human Resources','HR and credentialing','#7C3AED',true),
    (v_org,h3,'Operations','Facilities and supply chain','#6B7280',true)
  ON CONFLICT DO NOTHING;

  -- 8 channels
  INSERT INTO channels (org_id,hospital_id,name,description,channel_type) VALUES
    (v_org,NULL,'announcements','Organization-wide announcements','announcement'),
    (v_org,NULL,'general','General conversation for all staff','public'),
    (v_org,NULL,'doctors','Doctor-only discussions','private'),
    (v_org,NULL,'managers','Management team channel','private'),
    (v_org,NULL,'hr','HR team communications','private'),
    (v_org,h1,'town-country','Town & Country team channel','public'),
    (v_org,h2,'clifton','Clifton clinic team channel','public'),
    (v_org,h3,'columbia-pike','Columbia Pike team channel','public')
  ON CONFLICT DO NOTHING;

  -- 6 training courses
  INSERT INTO training_courses (org_id,title,description,category,level,is_required,is_published,compliance_type,pass_score,estimated_hours,cover_color,tags) VALUES
    (v_org,'OSHA Hazard Communication','Annual HazCom training for all clinical staff.','compliance','beginner',true,true,'OSHA',80,1.5,'#DC2626',ARRAY['osha','annual','all-staff']),
    (v_org,'Rabies Exposure Protocol','Post-exposure prophylaxis protocols and reporting.','safety','intermediate',true,true,'Safety',85,2.0,'#F97316',ARRAY['rabies','safety']),
    (v_org,'Client Communication Excellence','Best practices for client-facing interactions.','clinical','beginner',false,true,NULL,75,1.0,'#2563EB',ARRAY['communication','csr']),
    (v_org,'Anesthesia & Monitoring Fundamentals','Safe anesthetic induction and patient monitoring.','clinical','advanced',true,true,'Hospital Compliance',90,3.0,'#7C3AED',ARRAY['anesthesia','clinical']),
    (v_org,'New Employee Orientation','Introduction to VetOS culture and operations.','onboarding','beginner',true,true,NULL,80,2.5,'#059669',ARRAY['onboarding','new-hire']),
    (v_org,'CPR & Emergency Procedures','CPR and emergency triage protocols for all staff.','safety','intermediate',true,true,'CPR',90,2.0,'#EF4444',ARRAY['cpr','emergency'])
  ON CONFLICT DO NOTHING;

  -- 5 learning paths
  INSERT INTO learning_paths (org_id,title,description,role_target,is_auto_assign,cover_color,is_published) VALUES
    (v_org,'New Veterinarian Onboarding','Complete orientation for new veterinarians','doctor',true,'#2563EB',true),
    (v_org,'CSR Excellence Program','Client services training for front desk staff','csr',true,'#D97706',true),
    (v_org,'Veterinary Assistant Pathway','Core skills for veterinary assistants','va',true,'#7C3AED',true),
    (v_org,'Manager Leadership Track','Leadership training for hospital managers','practice_manager',true,'#059669',true),
    (v_org,'Annual Compliance Bundle','All required annual compliance courses',NULL,true,'#DC2626',true)
  ON CONFLICT DO NOTHING;

  -- 10 calendar events
  INSERT INTO calendar_events (org_id,hospital_id,title,event_type,start_time,end_time,location,is_all_day,color,is_cancelled) VALUES
    (v_org,h1,'Staff Meeting - Q3 Review','meeting',NOW()+interval'3 days',NOW()+interval'3 days 1 hour','Conference Room A',false,'#2563EB',false),
    (v_org,h1,'OSHA Training Session','training',NOW()+interval'5 days',NOW()+interval'5 days 2 hours','Training Room',false,'#DC2626',false),
    (v_org,h1,'New Ultrasound Equipment Demo','other',NOW()+interval'7 days',NOW()+interval'7 days 1 hour','Treatment Area 2',false,'#7C3AED',false),
    (v_org,h2,'Monthly Team Huddle','meeting',NOW()+interval'2 days',NOW()+interval'2 days 45 minutes','Break Room',false,'#7C3AED',false),
    (v_org,h2,'Rabies Vaccine Clinic','other',NOW()+interval'6 days',NOW()+interval'6 days 4 hours','Exam Room 1',false,'#F97316',false),
    (v_org,h2,'CPR Recertification','training',NOW()+interval'10 days',NOW()+interval'10 days 3 hours','Training Room',false,'#EF4444',false),
    (v_org,h3,'Emergency Team Briefing','meeting',NOW()+interval'1 day',NOW()+interval'1 day 1 hour','ICU Conference Room',false,'#059669',false),
    (v_org,h3,'Oncology Specialist Rounds','other',NOW()+interval'2 days',NOW()+interval'2 days 2 hours','Oncology Suite',false,'#7C3AED',false),
    (v_org,h3,'Anesthesia Protocol Update','training',NOW()+interval'8 days',NOW()+interval'8 days 2 hours','Training Lab',false,'#DC2626',false),
    (v_org,h3,'Board of Directors Site Visit','meeting',NOW()+interval'12 days',NOW()+interval'12 days 3 hours','Main Conference Room',false,'#2563EB',false)
  ON CONFLICT DO NOTHING;

  -- 7 projects
  INSERT INTO projects (org_id,hospital_id,title,description,status,priority,start_date,due_date,color,progress_pct) VALUES
    (v_org,h1,'Waiting Room Renovation','Modernize client waiting area with updated decor and seating.','in_progress','high',NOW()::date,(NOW()+interval'60 days')::date,'#2563EB',35),
    (v_org,h1,'OSHA Compliance Audit 2024','Annual OSHA self-inspection and documentation review.','todo','urgent',NOW()::date,(NOW()+interval'30 days')::date,'#DC2626',0),
    (v_org,h2,'Digital Records Migration','Migrate paper patient records to VetOS digital system.','in_progress','high',(NOW()-interval'14 days')::date,(NOW()+interval'45 days')::date,'#7C3AED',60),
    (v_org,h2,'Summer New Hire Onboarding','Onboard 4 new staff members joining in July.','todo','medium',NOW()::date,(NOW()+interval'14 days')::date,'#059669',0),
    (v_org,h3,'Emergency Dept Expansion','Increase emergency bay capacity from 6 to 10 bays.','in_progress','urgent',(NOW()-interval'30 days')::date,(NOW()+interval'90 days')::date,'#059669',45),
    (v_org,h3,'Telemedicine Launch','Deploy telehealth consult system for post-op follow-ups.','todo','medium',(NOW()+interval'7 days')::date,(NOW()+interval'60 days')::date,'#D97706',0),
    (v_org,NULL,'Staff Wellness Initiative Q3','Org-wide wellness program including mental health resources.','in_progress','low',NOW()::date,(NOW()+interval'90 days')::date,'#F97316',20)
  ON CONFLICT DO NOTHING;

  -- 6 announcements
  INSERT INTO hospital_announcements (hospital_id,org_id,title,content,priority,is_active,expires_at) VALUES
    (h1,v_org,'New Anesthesia Machine Installed','The Mindray A5 is now operational in Surgery Suite 2. All surgical staff must complete the orientation module before use.','high',true,NOW()+interval'30 days'),
    (h1,v_org,'Updated PTO Request Process','Effective immediately, all PTO requests must be submitted via VetOS at least 7 days in advance. Paper requests will no longer be accepted.','normal',true,NOW()+interval'60 days'),
    (h2,v_org,'Parking Lot Resurfacing July 15-17','The main parking lot will be closed for resurfacing. Please use the side street parking on Oak Ave during this time.','high',true,NOW()+interval'14 days'),
    (h2,v_org,'New Exotic Pet Protocol Available','Updated handling and treatment protocols for reptiles and avian patients are now published in the Knowledge Base.','normal',true,NULL),
    (h3,v_org,'Emergency Expansion Phase 1 Complete','Three new critical care bays are now operational on the east wing. Full team briefing Monday at 7 AM in the main conference room.','urgent',true,NOW()+interval'7 days'),
    (h3,v_org,'Overnight Shift Incentive Program','Beginning next pay period, all overnight shift staff (10 PM - 6 AM) will receive a 1.5x pay differential.','normal',true,NULL)
  ON CONFLICT DO NOTHING;

  -- 8 KB categories
  INSERT INTO kb_categories (org_id,name,slug,description,color,icon,sort_order) VALUES
    (v_org,'SOPs','sops','Standard operating procedures and clinical protocols','#2563EB','FileText',1),
    (v_org,'Policies','policies','Hospital and organization-wide policies','#7C3AED','Shield',2),
    (v_org,'HR','hr','Human resources documents and forms','#059669','Users',3),
    (v_org,'Compliance','compliance','Regulatory and accreditation documentation','#DC2626','ShieldCheck',4),
    (v_org,'Training','training','Training materials and reference resources','#F97316','GraduationCap',5),
    (v_org,'Marketing','marketing','Brand guidelines and marketing collateral','#D97706','Megaphone',6),
    (v_org,'IT','it','Technology systems documentation and guides','#6B7280','Monitor',7),
    (v_org,'Operations','operations','Operational guides, checklists, and runbooks','#0891B2','Settings',8)
  ON CONFLICT (org_id,slug) DO NOTHING;

  RAISE NOTICE 'Migration 020 complete for org %', v_org;
END $$;
