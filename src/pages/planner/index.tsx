import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { startOfWeek } from "date-fns";
import Planner from "../../components/Planner";
import WeekPicker from "../../components/WeekPicker";
import styles from "./index.module.scss";
import { parseCalendarDate } from "../../domain/calendar";
import { getPlannerNoteDate } from "../../domain/planner";
import type { PlannerNote } from "../../data/plannerStore";
import { withPlannerDate, withoutPlannerTask } from "./params";

const PlannerPage = () => {
  const [params, setParams] = useSearchParams();
  const dateParam = params.get("date");
  const selectedDate = useMemo(() => parseCalendarDate(dateParam) ?? new Date(), [dateParam]);
  const selectedWeekStart = useMemo(() => startOfWeek(selectedDate, { weekStartsOn: 1 }), [selectedDate]);
  const selectDay = useCallback((date: Date, clearTask = true) => setParams((current) => withPlannerDate(current, date, clearTask)), [setParams]);
  const clearTask = useCallback(() => setParams((current) => withoutPlannerTask(current), { replace: true }), [setParams]);
  const saveNote = useCallback((note: PlannerNote) =>
    setParams((current) => withPlannerDate(current, getPlannerNoteDate(note)), { replace: true }), [setParams]);

  return (
    <div className={`pageContainer ${styles.page}`}>
      <Planner weekNavigation={<WeekPicker value={selectedDate} onWeekChange={selectDay} />} selectedWeekStart={selectedWeekStart} selectedDate={selectedDate} onSelectDay={selectDay} selectedTaskId={params.get("task")} onClearTask={clearTask} onSaved={saveNote} />
    </div>
  );
};

export default PlannerPage;
