// src/pages/Schedule/generator.ts
import { WeeklyScheduleData, ScheduleItem } from "../../types/sched";

const LESSONS = [
  "Математический Анализ",
  "Физика",
  "Химия",
  "Программирование",
  "Обществознание",
  "Теория вероятностей",
  "Экономика",
  "История",
];

const TYPES: ScheduleItem["type"][] = ["Лек.", "Пр.", "Лаб.", "Экз.", "Зач."];

const LOCATIONS = [
  "Ауд. 101",
  "Ауд. 202",
  "Ауд. 303",
  "Ауд. 404",
  "Онлайн (Zoom)",
];

const TEACHERS = [
  "Иванов И.И.",
  "Петров П.П.",
  "Сидоров С.С.",
  "Доц. Смирнова",
  "Имк. Коалов",
];

const START_HOUR = 8;
const END_HOUR = 18;
const SLOT_MINUTES = 90;

// --- Случайное целое число ---
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// --- Проверка пересечения слотов ---
const isOverlap = (start: number, end: number, slots: { start: number; end: number }[]) =>
  slots.some(slot => Math.max(slot.start, start) < Math.min(slot.end, end));

// --- Генерация случайного дня без наложений ---
const generateDaySchedule = (date: Date): ScheduleItem[] => {
  const lessons: ScheduleItem[] = [];
  const usedSlots: { start: number; end: number }[] = [];

  const lessonsCount = randomInt(2, 5);

  for (let i = 0; i < lessonsCount; i++) {
    let startMinutes, endMinutes;
    let tries = 0;

    do {
      const hour = randomInt(START_HOUR, END_HOUR - 1);
      const minute = Math.random() < 0.5 ? 0 : 30;
      startMinutes = hour * 60 + minute;
      endMinutes = startMinutes + SLOT_MINUTES;
      tries++;
      if (tries > 50) break; // защита от зацикливания
    } while (isOverlap(startMinutes, endMinutes, usedSlots));

    usedSlots.push({ start: startMinutes, end: endMinutes });

    const startHour = Math.floor(startMinutes / 60);
    const startMin = startMinutes % 60;
    const endHour = Math.floor(endMinutes / 60);
    const endMin = endMinutes % 60;

    lessons.push({
      id: Date.now() + i + Math.floor(Math.random() * 1000),
      date: date.toISOString().split("T")[0],
      dayOfWeek: date.getDay(),
      subject: LESSONS[randomInt(0, LESSONS.length - 1)],
      type: TYPES[randomInt(0, TYPES.length - 1)],
      startTime: `${startHour.toString().padStart(2, "0")}:${startMin.toString().padStart(2, "0")}`,
      endTime: `${endHour.toString().padStart(2, "0")}:${endMin.toString().padStart(2, "0")}`,
      location: LOCATIONS[randomInt(0, LOCATIONS.length - 1)],
      teacher: TEACHERS[randomInt(0, TEACHERS.length - 1)],
    });
  }

  return lessons;
};

// --- Генерация расписания на месяц (только Пн-Пт) ---
export const generateMockMonthSchedule = (startDate: Date): WeeklyScheduleData => {
  const schedule: WeeklyScheduleData = [];
  const daysInMonth = 30;

  for (let i = 0; i < daysInMonth; i++) {
    const currentDate = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    if (currentDate.getDay() >= 1 && currentDate.getDay() <= 6) {
      schedule.push(...generateDaySchedule(currentDate));
    }
  }

  return schedule;
};
