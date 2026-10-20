import type { ScheduleSlot } from "../types/sched";

// Сетка звонков деморежима. При подключении API заменяется данными вуза.
export const DEMO_SCHEDULE_SLOTS: ScheduleSlot[] = [
  { number: 1, startTime: "08:30", endTime: "10:00" },
  { number: 2, startTime: "10:10", endTime: "11:40" },
  { number: 3, startTime: "12:10", endTime: "13:40" },
  { number: 4, startTime: "13:50", endTime: "15:20" },
  { number: 5, startTime: "15:40", endTime: "17:10" },
  { number: 6, startTime: "17:40", endTime: "19:10" },
  { number: 7, startTime: "19:20", endTime: "20:50" },
];
