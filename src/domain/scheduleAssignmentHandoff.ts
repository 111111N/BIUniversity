import type { ManagedLesson } from "./scheduleManagement";
import { changesLocation, type NavigationLocation, type NavigationTransition } from "./unsavedNavigation";

export const SCHEDULE_RETURN_PARAM = "scheduleReturn";
export interface ScheduleAssignmentDraft {
  weekStart: string;
  groupId: string;
  returnSearch: string;
  historySearch: string;
  lessons: ManagedLesson[];
  saved: string;
  revision: number;
  editor: ManagedLesson;
  editorBase: string;
  removedLesson: ManagedLesson | null;
}
export interface ScheduleAssignmentHandoff extends ScheduleAssignmentDraft { token: string }
const canonicalSearch = (search: string) => {
  const params = new URLSearchParams(search);
  params.delete(SCHEDULE_RETURN_PARAM);
  params.sort();
  return params.toString();
};

// UI memory only: incomplete fields are retained without becoming a saved schedule draft.
export const createScheduleAssignmentHandoff = () => {
  let pending: ScheduleAssignmentHandoff | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const matchesSchedule = (location: NavigationLocation) => pending !== null
    && location.pathname === "/admin/schedule"
    && [pending.returnSearch, pending.historySearch].some((search) => canonicalSearch(location.search) === canonicalSearch(search))
    && (!new URLSearchParams(location.search).has(SCHEDULE_RETURN_PARAM)
      || new URLSearchParams(location.search).get(SCHEDULE_RETURN_PARAM) === pending.token);
  const matchesSubjects = (location: NavigationLocation) => pending !== null
    && location.pathname === "/admin/subjects"
    && new URLSearchParams(location.search).get(SCHEDULE_RETURN_PARAM) === pending.token;
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => pending,
    begin(draft: ScheduleAssignmentDraft, token: string) {
      pending = { ...structuredClone(draft), token };
      notify();
      const params = new URLSearchParams({ subject: draft.editor.subjectId, [SCHEDULE_RETURN_PARAM]: token });
      if (draft.editor.teacherId) params.set("teacher", draft.editor.teacherId);
      return `/admin/subjects?${params}`;
    },
    readSchedule(search: string, weekStart: string, groupId: string) {
      return matchesSchedule({ pathname: "/admin/schedule", search }) && pending?.weekStart === weekStart && pending.groupId === groupId
        ? structuredClone(pending) : null;
    },
    getOpeningScope(search: string) {
      const params = new URLSearchParams(search);
      const original = matchesSchedule({ pathname: "/admin/schedule", search }) ? pending : null;
      return { group: params.get("group") ?? original?.groupId ?? null, date: params.get("date") ?? original?.weekStart ?? null };
    },
    readSubjects(search: string) {
      return matchesSubjects({ pathname: "/admin/subjects", search }) ? structuredClone(pending) : null;
    },
    returnUrl() {
      if (!pending) return null;
      const params = new URLSearchParams(pending.returnSearch);
      params.set(SCHEDULE_RETURN_PARAM, pending.token);
      return `/admin/schedule?${params}`;
    },
    matchesSchedule,
    matchesSubjects,
    permitsAssignmentNavigation: ({ nextLocation }: NavigationTransition) => matchesSubjects(nextLocation),
    shouldBlock: (transition: NavigationTransition) => Boolean(pending) && changesLocation(transition)
      && !matchesSchedule(transition.nextLocation) && !matchesSubjects(transition.nextLocation),
    clear() { if (pending) { pending = null; notify(); } },
  };
};
