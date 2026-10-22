import { useSearchParams } from "react-router-dom";
import type { LessonTypeFilterValue } from "../components/LessonTypeFilter";

const useJournalView = () => {
  const [params, setParams] = useSearchParams();
  const lessonType: LessonTypeFilterValue = (["lecture", "practice", "laboratory"] as const).find((value) => value === params.get("lessonType")) ?? "all";
  const mode: "attendance" | "grades" = params.get("mode") === "grades" ? "grades" : "attendance";
  const studentQuery = params.get("studentQ") ?? "";
  const change = (key: string, value: string, defaultValue = "") => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value === defaultValue) next.delete(key); else next.set(key, value);
    return next;
  }, { replace: true });
  return { lessonType, setLessonType: (value: LessonTypeFilterValue) => change("lessonType", value, "all"), mode, setMode: (value: "attendance" | "grades") => change("mode", value, "attendance"), studentQuery, setStudentQuery: (value: string) => change("studentQ", value) };
};

export default useJournalView;
