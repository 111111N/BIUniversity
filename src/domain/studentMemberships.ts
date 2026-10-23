import type { CurrentUser } from "./accounts";

/** New subjects follow an existing student group when a teacher is assigned to it. */
export const withCreatedSubjectMemberships = <T extends CurrentUser,>(account: T, accounts: CurrentUser[], createdSubjectIds: ReadonlySet<string>): T => {
  if (account.role !== "student" || !createdSubjectIds.size) return account;
  const groupIds = new Set(account.memberships.flatMap((entry) => entry.groupIds));
  const knownSubjects = new Set(account.memberships.map((entry) => entry.subjectId));
  const added = new Map<string, Set<string>>();
  for (const teacher of accounts) {
    if (teacher.role !== "teacher") continue;
    for (const membership of teacher.memberships) {
      if (!createdSubjectIds.has(membership.subjectId) || knownSubjects.has(membership.subjectId)) continue;
      for (const groupId of membership.groupIds) {
        if (!groupIds.has(groupId)) continue;
        const groups = added.get(membership.subjectId) ?? new Set<string>();
        groups.add(groupId);
        added.set(membership.subjectId, groups);
      }
    }
  }
  return added.size ? { ...account, memberships: [...account.memberships, ...[...added].map(([subjectId, groups]) => ({ subjectId, groupIds: [...groups] }))] } : account;
};
