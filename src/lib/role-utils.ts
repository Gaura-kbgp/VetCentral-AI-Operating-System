// Pure role-level utilities — no 'use server', safe to import in client components.

export const ROLE_LEVEL: Record<string, number> = {
  super_admin:      10,
  org_admin:        9,
  hospital_admin:   8,
  practice_manager: 7,
  hr:               6,
  it_admin:         5,
  doctor:           4,
  marketing:        3,
  csr:              2,
  va:               1,
  viewer:           0,
};

export function highestLevel(roles: string[]): number {
  return roles.reduce((m, r) => Math.max(m, ROLE_LEVEL[r] ?? 0), -1);
}

export function canActorManageTarget(actorRoles: string[], targetRoles: string[]): boolean {
  return highestLevel(actorRoles) > highestLevel(targetRoles);
}
