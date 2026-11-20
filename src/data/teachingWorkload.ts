import { readAccountsState, subscribeAccounts } from "./accountStore";
import { readTeachingAssignmentsDocument, subscribeTeachingAssignments } from "./teachingAssignmentsRead";
import { decodeCurricula } from "../domain/curricula";
import { CURRICULA_KEY, emptyCurricula } from "../domain/curriculumTypes";
import { calculateTeachingWorkload } from "../domain/teachingWorkload";
import { curriculaService } from "./curriculaStore";
import { refreshAcademicCatalog } from "./academicCatalog";
import { readGroupCatalogState } from "./groupCatalogStore";

export const readTeachingWorkload = (teacherId: string) => {
  const accounts = readAccountsState();
  if (accounts.error) throw new Error(accounts.error);
  const subjects = refreshAcademicCatalog(), groups = readGroupCatalogState();
  if (subjects.error || groups.error) throw new Error(subjects.error || groups.error);
  const raw = localStorage.getItem(CURRICULA_KEY), curricula = raw === null ? emptyCurricula() : decodeCurricula(raw);
  return calculateTeachingWorkload(teacherId, accounts.accounts, readTeachingAssignmentsDocument(), curricula, { subjects: Object.fromEntries(subjects.subjects.map(row => [row.id, row.name])), groups: Object.fromEntries(groups.groups.map(row => [row.id, row.name])) });
};
export const subscribeTeachingWorkload = (listener: () => void) => {
  const stops = [subscribeAccounts(listener), subscribeTeachingAssignments(listener), curriculaService.subscribe(listener)];
  return () => stops.forEach(stop => stop());
};
