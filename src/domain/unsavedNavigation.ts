import { getJournalSection } from "./journalNavigation";
import { readMaterialScope } from "./libraryNavigation";

interface NavigationLocation { pathname: string; search: string }
export interface NavigationTransition { currentLocation: NavigationLocation; nextLocation: NavigationLocation }
export type UnsavedNavigationCheck = (transition: NavigationTransition) => boolean;

export const changesPage: UnsavedNavigationCheck = ({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname;

export const changesLocation: UnsavedNavigationCheck = (transition) => changesPage(transition) || transition.currentLocation.search !== transition.nextLocation.search;

export const changesAdminSubject: UnsavedNavigationCheck = (transition) => changesPage(transition)
  || new URLSearchParams(transition.currentLocation.search).get("subject") !== new URLSearchParams(transition.nextLocation.search).get("subject");

export const changesAdminAccount: UnsavedNavigationCheck = (transition) => changesPage(transition)
  || ["account", "create", "mode"].some((key) => new URLSearchParams(transition.currentLocation.search).get(key) !== new URLSearchParams(transition.nextLocation.search).get(key));

export const changesMaterialScope: UnsavedNavigationCheck = (transition) => changesPage(transition)
  || new URLSearchParams(transition.currentLocation.search).get("tab") !== new URLSearchParams(transition.nextLocation.search).get("tab")
  || readMaterialScope(new URLSearchParams(transition.currentLocation.search)) !== readMaterialScope(new URLSearchParams(transition.nextLocation.search));

export const changesJournalSection: UnsavedNavigationCheck = (transition) => changesPage(transition)
  || getJournalSection(new URLSearchParams(transition.currentLocation.search), true) !== getJournalSection(new URLSearchParams(transition.nextLocation.search), true);

export const changesAssignmentAnswer: UnsavedNavigationCheck = (transition) => changesJournalSection(transition)
  || new URLSearchParams(transition.currentLocation.search).get("assignment") !== new URLSearchParams(transition.nextLocation.search).get("assignment");

export const changesAssignmentEditor: UnsavedNavigationCheck = (transition) => changesAssignmentAnswer(transition)
  || ["editor", "publish"].some((key) => new URLSearchParams(transition.currentLocation.search).get(key) !== new URLSearchParams(transition.nextLocation.search).get(key));

export const changesMessageContact: UnsavedNavigationCheck = (transition) => {
  const contact = (search: string) => { const params = new URLSearchParams(search); return params.get("contact") ?? params.get("student"); };
  return changesPage(transition) || contact(transition.currentLocation.search) !== contact(transition.nextLocation.search);
};

export const changesPlannerTask: UnsavedNavigationCheck = (transition) => {
  const nextTask = new URLSearchParams(transition.nextLocation.search).get("task");
  return changesPage(transition) || Boolean(nextTask && nextTask !== new URLSearchParams(transition.currentLocation.search).get("task"));
};

export const createUnsavedChangesRegistry = () => {
  const checks = new Set<{ check: UnsavedNavigationCheck; blockAction: boolean }>();
  return {
    register(check: UnsavedNavigationCheck, blockAction = true) {
      const entry = { check, blockAction };
      checks.add(entry);
      return () => { checks.delete(entry); };
    },
    hasChanges: () => checks.size > 0,
    blocksAction: () => [...checks].some((entry) => entry.blockAction),
    shouldBlock: (transition: NavigationTransition) => [...checks].some(({ check }) => {
      try { return check(transition); }
      catch (error) {
        console.error("Не удалось проверить несохранённые изменения перед переходом:", error);
        return true;
      }
    }),
  };
};
