// src/data/students.ts
import { eachDayOfInterval, getDay, format } from 'date-fns';

export type AttendanceStatus = 'present' | 'sick' | 'absent';
export type Grade = 2 | 3 | 4 | 5 | null;

export interface Student {
  id: string;
  name: string;
  attendance: { [date: string]: AttendanceStatus };
  grades: { [date: string]: Grade }; // новый объект для оценок
}

// --- Рабочие дни октября 2025 ---
const START_DATE = new Date(2025, 9, 1); 
const END_DATE = new Date(2025, 9, 30);

export const workDays = eachDayOfInterval({ start: START_DATE, end: END_DATE })
  .filter(d => getDay(d) !== 0)
  .map(d => format(d, 'yyyy-MM-dd'));

// --- Возможные статусы ---
const STATUS: AttendanceStatus[] = ['present', 'sick','absent'];

// --- Случайный выбор статуса ---
const randomStatus = () => STATUS[Math.floor(Math.random() * STATUS.length)];

// --- Возможные оценки ---
const GRADES: Grade[] = [2, 3, 4, 5];

// --- Случайная оценка ---
const randomGrade = () => GRADES[Math.floor(Math.random() * GRADES.length)];

// --- Генерация массива студентов ---
export const INITIAL_STUDENTS: Student[] = [
  'Иванов Иван', 'Петрова Мария', 'Сидоров Алексей', 'Козлова Елена', 'Николаев Дмитрий',
  'Морозова Анна', 'Федоров Сергей', 'Куликова Ольга', 'Смирнов Павел', 'Васильева Татьяна',
  'Андреев Виктор', 'Григорьева Юлия', 'Егоров Игорь', 'Соколова Наталья', 'Кузнецов Артём',
  'Лебедева Марина', 'Орлов Константин', 'Воронова Ирина', 'Тихонов Михаил', 'Киселева Светлана',
  'Зайцев Николай', 'Фролова Анастасия', 'Савельев Андрей', 'Михайлова Елизавета', 'Дмитриев Олег',
  'Павлова Виктория', 'Романов Аркадий', 'Алексеева Полина', 'Семёнов Владислав', 'Ефимова Ксения',
].map((name, index) => {
  const attendance: { [date: string]: AttendanceStatus } = {};
  const grades: { [date: string]: Grade } = {};

  workDays.forEach(date => {
    attendance[date] = randomStatus();
    grades[date] = randomGrade();
  });

  return {
    id: (index + 1).toString(),
    name,
    attendance,
    grades,
  };
});
