import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScheduleItem } from "../../types/sched";
import { subscribeAssignmentStore } from "../../data/assignmentStore";
import { readAssignmentListState } from "../../data/assignmentData";
import { isAcademicMembershipMatch } from "../../data/academicCatalog";
import { useRole } from "../RoleContext";
import LessonDetails from "./LessonDetails";

interface Props { item: ScheduleItem; onClose(): void }

const EditableLessonDetails = ({ item, onClose }: Props) => {
  const { role, currentUser } = useRole();
  const [state, setState] = useState(readAssignmentListState);
  const refresh = useCallback(() => setState(readAssignmentListState()), []);
  useEffect(() => {
    const unsubscribe = subscribeAssignmentStore(refresh);
    refresh();
    return unsubscribe;
  }, [refresh]);
  const assignments = useMemo(() => state.assignments.filter((assignment) =>
    (assignment.status === "published" || role === "teacher" && assignment.status === "draft")
    && assignment.subject === item.subject && assignment.group === item.group
    && assignment.lessonDate.startsWith(item.date)
    && isAcademicMembershipMatch(currentUser.memberships, assignment.subject, assignment.group)),
  [state.assignments, role, currentUser.memberships, item]);
  return <LessonDetails item={item} assignments={assignments} assignmentError={state.error} onRetryAssignments={refresh} onClose={onClose} />;
};

export default EditableLessonDetails;
