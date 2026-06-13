'use client';

import { useState, useEffect } from 'react';
import { getProjectsFull } from '@/lib/actions/projects';
import ProjectsShell from '@/components/projects/projects-shell';
import { BannerCardGridSkeleton } from './skeletons';
import type { SectionProps } from './types';
import type { ProjectFull } from '@/lib/actions/projects';

export function ProjectsSection({ userId, role }: SectionProps) {
  const [projects, setProjects] = useState<ProjectFull[] | null>(null);

  useEffect(() => {
    let alive = true;
    getProjectsFull().then(r => {
      if (!alive) return;
      setProjects(r.success ? r.data : []);
    });
    return () => { alive = false; };
  }, []);

  if (projects === null) return <BannerCardGridSkeleton />;

  return (
    <ProjectsShell
      projects={projects}
      role={role}
      currentUserId={userId}
    />
  );
}
