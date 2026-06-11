'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { SectionKey } from '@/contexts/spa-navigation';
import type { AppRole } from '@/types/database';

import { AIAssistantSection      } from '@/components/sections/AIAssistantSection';
import { KnowledgeBaseSection    } from '@/components/sections/KnowledgeBaseSection';
import { TrainingSection         } from '@/components/sections/TrainingSection';
import { CalendarSection         } from '@/components/sections/CalendarSection';
import { TasksSection            } from '@/components/sections/TasksSection';
import { AnnouncementsSection    } from '@/components/sections/AnnouncementsSection';
import { MessagesSection         } from '@/components/sections/MessagesSection';
import { RequestsPortalSection   } from '@/components/sections/RequestsPortalSection';
import { WorkflowsSection        } from '@/components/sections/WorkflowsSection';
import { ProjectsSection         } from '@/components/sections/ProjectsSection';
import { AnalyticsSection        } from '@/components/sections/AnalyticsSection';
import { HospitalHubSection      } from '@/components/sections/HospitalHubSection';
import { OnboardingSection       } from '@/components/sections/OnboardingSection';
import { HRSection               } from '@/components/sections/HRSection';
import { DocumentsSection        } from '@/components/sections/DocumentsSection';
import { ApprovalsSection        } from '@/components/sections/ApprovalsSection';
import { ScheduleRequestsSection } from '@/components/sections/ScheduleRequestsSection';
import { AdminUsersSection       } from '@/components/sections/AdminUsersSection';
import { AdminRolesSection       } from '@/components/sections/AdminRolesSection';
import { AdminDepartmentsSection } from '@/components/sections/AdminDepartmentsSection';
import { AdminHospitalsSection   } from '@/components/sections/AdminHospitalsSection';
import { AdminIntegrationsSection} from '@/components/sections/AdminIntegrationsSection';
import { AdminAuditLogsSection   } from '@/components/sections/AdminAuditLogsSection';
import { AdminSettingsSection    } from '@/components/sections/AdminSettingsSection';
import { NotificationsSection    } from '@/components/sections/NotificationsSection';
import { ProfileSection          } from '@/components/sections/ProfileSection';
import { HelpSection             } from '@/components/sections/HelpSection';
import { PreferencesSection      } from '@/components/sections/PreferencesSection';
import { SecuritySection         } from '@/components/sections/SecuritySection';
import { AISettingsSection       } from '@/components/sections/AISettingsSection';

export interface SPAHubProps {
  userId: string;
  orgId: string;
  role: AppRole | null;
  firstName: string;
  hospitalId: string | null;
  children: React.ReactNode;
}

function SPAHubInner({ userId, orgId, role, firstName, hospitalId, children }: SPAHubProps) {
  const searchParams = useSearchParams();
  const section = (searchParams.get('section') as SectionKey) ?? 'dashboard';
  const subId = searchParams.get('id') ?? undefined;

  const props = { userId, orgId, role, firstName, hospitalId, subId };

  if (section === 'dashboard') return <>{children}</>;

  const sectionMap: Partial<Record<SectionKey, React.ReactNode>> = {
    'ai-assistant':         <AIAssistantSection      {...props} />,
    'knowledge-base':       <KnowledgeBaseSection    {...props} />,
    'training':             <TrainingSection         {...props} />,
    'calendar':             <CalendarSection         {...props} />,
    'tasks':                <TasksSection            {...props} />,
    'announcements':        <AnnouncementsSection    {...props} />,
    'messages':             <MessagesSection         {...props} />,
    'requests-portal':      <RequestsPortalSection   {...props} />,
    'workflows':            <WorkflowsSection        {...props} />,
    'projects':             <ProjectsSection         {...props} />,
    'analytics':            <AnalyticsSection        {...props} />,
    'hospital-hub':         <HospitalHubSection      {...props} />,
    'onboarding':           <OnboardingSection       {...props} />,
    'hr':                   <HRSection               {...props} />,
    'documents':            <DocumentsSection        {...props} />,
    'approvals':            <ApprovalsSection        {...props} />,
    'schedule-requests':    <ScheduleRequestsSection {...props} />,
    'admin-users':          <AdminUsersSection       {...props} />,
    'admin-roles':          <AdminRolesSection       {...props} />,
    'admin-departments':    <AdminDepartmentsSection {...props} />,
    'admin-hospitals':      <AdminHospitalsSection   {...props} />,
    'admin-integrations':   <AdminIntegrationsSection {...props} />,
    'admin-audit-logs':     <AdminAuditLogsSection   {...props} />,
    'admin-settings':       <AdminSettingsSection    {...props} />,
    'notifications':        <NotificationsSection    {...props} />,
    'profile':              <ProfileSection          {...props} />,
    'help':                 <HelpSection             {...props} />,
    'settings-preferences': <PreferencesSection      {...props} />,
    'settings-security':    <SecuritySection         {...props} />,
    'settings-ai':          <AISettingsSection       {...props} />,
  };

  return <>{sectionMap[section] ?? children}</>;
}

export function SPAHub(props: SPAHubProps) {
  return (
    <Suspense fallback={null}>
      <SPAHubInner {...props} />
    </Suspense>
  );
}
