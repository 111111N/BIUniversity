import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { startOfWeek } from "date-fns";
import Planner from "../../components/Planner";
import WeekPicker from "../../components/WeekPicker";
import styles from "./index.module.scss";
import { parseCalendarDate } from "../../domain/calendar";
import { toLocalDateKey } from "../../domain/schedule";
import { getPlannerNoteDate } from "../../domain/planner";

const PlannerPage = () => {
  const [params, setParams] = useSearchParams();
  const dateParam = params.get("date");
  const selectedDate = useMemo(() => parseCalendarDate(dateParam) ?? new Date(), [dateParam]);
  const selectedWeekStart = useMemo(() => startOfWeek(selectedDate, { weekStartsOn: 1 }), [selectedDate]);

  return (
    <div className={`pageContainer ${styles.page}`}>
      <Planner weekNavigation={<WeekPicker value={selectedDate} onWeekChange={(date) => setParams({ date: toLocalDateKey(date) })} />} selectedWeekStart={selectedWeekStart} selectedDate={selectedDate} selectedTaskId={params.get("task")} onClearTask={() => { if (params.has("task")) setParams((current) => { const next = new URLSearchParams(current); next.delete("task"); return next; }, { replace: true }); }} onSaved={(note) => setParams({ date: toLocalDateKey(getPlannerNoteDate(note)) }, { replace: true })} />
    </div>
  );
};

export default PlannerPage;
