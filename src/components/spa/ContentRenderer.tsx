'use client';

import { memo, useLayoutEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import type { SectionKey } from '@/types/sections';
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
import type { SectionProps } from '@/components/sections/types';

type SectionComponentType = React.ComponentType<SectionProps>;

const SECTION_REGISTRY: Array<{ key: SectionKey; Component: SectionComponentType }> = [
  { key: 'ai-assistant',         Component: AIAssistantSection      },
  { key: 'knowledge-base',       Component: KnowledgeBaseSection    },
  { key: 'training',             Component: TrainingSection         },
  { key: 'calendar',             Component: CalendarSection         },
  { key: 'tasks',                Component: TasksSection            },
  { key: 'announcements',         Component: AnnouncementsSection    },
  { key: 'messages',              Component: MessagesSection         },
  { key: 'requests-portal',       Component: RequestsPortalSection   },
  { key: 'workflows',            Component: WorkflowsSection        },
  { key: 'projects',             Component: ProjectsSection         },
  { key: 'analytics',            Component: AnalyticsSection        },
  { key: 'hospital-hub',         Component: HospitalHubSection      },
  { key: 'onboarding',           Component: OnboardingSection       },
  { key: 'hr',                   Component: HRSection               },
  { key: 'documents',            Component: DocumentsSection        },
  { key: 'approvals',            Component: ApprovalsSection        },
  { key: 'schedule-requests',    Component: ScheduleRequestsSection },
  { key: 'admin-users',          Component: AdminUsersSection       },
  { key: 'admin-roles',          Component: AdminRolesSection       },
  { key: 'admin-departments',    Component: AdminDepartmentsSection },
  { key: 'admin-hospitals',      Component: AdminHospitalsSection   },
  { key: 'admin-integrations',   Component: AdminIntegrationsSection},
  { key: 'admin-audit-logs',     Component: AdminAuditLogsSection   },
  { key: 'admin-settings',       Component: AdminSettingsSection    },
  { key: 'notifications',        Component: NotificationsSection    },
  { key: 'profile',              Component: ProfileSection          },
  { key: 'help',                 Component: HelpSection             },
  { key: 'settings-preferences', Component: PreferencesSection      },
  { key: 'settings-security',    Component: SecuritySection         },
  { key: 'settings-ai',          Component: AISettingsSection       },
];

const ALL_SECTION_KEYS = new Set<SectionKey>(
  SECTION_REGISTRY.map((r) => r.key).concat(['dashboard']) as SectionKey[]
);

export interface ContentRendererProps {
  userId: string;
  orgId: string;
  role: AppRole | null;
  firstName: string;
  hospitalId: string | null;
  initialSection: SectionKey;
  initialSubId: string | null;
  children: React.ReactNode;
}

// Stable wrapper for server-rendered dashboard
const StableDashboard = memo(function StableDashboard({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
});

// Each section is isolated — only re-renders when its own subId changes
const MemoSection = memo(function MemoSection({
  Component, sectionKey, userId, orgId, role, firstName, hospitalId,
}: {
  Component: SectionComponentType;
  sectionKey: SectionKey;
  userId: string;
  orgId: string;
  role: AppRole | null;
  firstName: string;
  hospitalId: string | null;
}) {
  const subId = useAppStore((s) => s.sectionSubIds[sectionKey] ?? undefined);
  return (
    <Component
      userId={userId}
      orgId={orgId}
      role={role}
      firstName={firstName}
      hospitalId={hospitalId}
      subId={subId}
    />
  );
});

// CSS show/hide — never unmounts, preserves scroll + state
function SectionShell({ sectionKey, active, children }: {
  sectionKey: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-section={sectionKey}
      className="absolute inset-0 overflow-y-auto flex flex-col p-6"
      style={{ display: active ? 'flex' : 'none' }}
    >
      {children}
    </div>
  );
}

export function ContentRenderer({
  userId, orgId, role, firstName, hospitalId,
  initialSection, initialSubId, children,
}: ContentRendererProps) {
  useLayoutEffect(() => {
    // Mark all sections as mounted immediately — their useEffects fire
    // in the background (display:none) so data is ready before user clicks.
    useAppStore.setState({
      activeSection: initialSection,
      subId: initialSubId,
      sectionSubIds: { [initialSection]: initialSubId },
      mountedSections: ALL_SECTION_KEYS,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const storeSection    = useAppStore((s) => s.activeSection);
  const mountedSections = useAppStore((s) => s.mountedSections);
  // Before useLayoutEffect fires (first render), fall back to initialSection
  const activeSection   = mountedSections.has(initialSection) ? storeSection : initialSection;

  const baseProps = { userId, orgId, role, firstName, hospitalId };

  return (
    <div className="absolute inset-0">
      <SectionShell sectionKey="dashboard" active={activeSection === 'dashboard'}>
        <StableDashboard>{children}</StableDashboard>
      </SectionShell>

      {SECTION_REGISTRY.map(({ key, Component }) => (
        <SectionShell key={key} sectionKey={key} active={activeSection === key}>
          <MemoSection
            Component={Component}
            sectionKey={key}
            {...baseProps}
          />
        </SectionShell>
      ))}
    </div>
  );
}
