// src/types/schedule.ts

export interface ScheduleItem {
  id: number;
  subject: string;
  date: string;
  type: 'Лек.' | 'Пр.' | 'Лаб.' | 'Зач.' | 'Экз.';
  startTime: string; // Например, "10:00"
  endTime: string;   // Например, "11:30"
  dayOfWeek: number; // 0=Воскресенье, 1=Понедельник, ..., 6=Суббота
  location: string;  // Например, "Ауд. 424/1"
  teacher?: string;  // Например, "Смирнова А.Б."
  link?: string;
}

export type WeeklyScheduleData = ScheduleItem[];