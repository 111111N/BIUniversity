import { readAssignmentData, readAssignmentList } from "./assignmentStore";
export { readAssignmentData } from "./assignmentStore";

/** Read-only schedule views do not depend on students' answer storage. */
export const readAssignmentListState = () => {
  try { return { assignments: readAssignmentList(), error: "" }; }
  catch (error) {
    console.error("Не удалось прочитать список заданий:", error);
    return { assignments: [], error: "Не удалось прочитать список заданий." };
  }
};

export const readAssignmentState = () => {
  try { return { ...readAssignmentData(), error: "" }; }
  catch (error) {
    console.error("Не удалось прочитать задания и ответы журнала:", error);
    return { assignments: [], submissions: [], error: "Не удалось прочитать задания и ответы. Сохранение приостановлено, исходные данные не изменены. Повторите загрузку." };
  }
};
