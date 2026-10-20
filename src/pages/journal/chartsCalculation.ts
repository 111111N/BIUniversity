import type { Student } from '../../components/Attendance/data/students';
import { isPerformanceLesson, type AcademicLesson } from '../../domain/academic';
import { isPerformanceGrade, PERFORMANCE_GRADES } from '../../domain/gradeDistribution';

export interface RadarDataPoint {
  seriesName: string;
  values: number[];
  colorToken?: string;
}

// --- Вспомогательные вычисления ---
export const calculateAttendanceCounts = (students: Student[], lessonIds?: string[]) =>
  students.map((student) => {
    const values = lessonIds ? lessonIds.map((id) => student.attendance[id]) : Object.values(student.attendance);
    return values.filter((value) => value === 'present').length;
  });

export const calculateGradeCounts = (students: Student[], lessonIds?: string[]) =>
  students.map(student => {
    const values = lessonIds ? lessonIds.map((id) => student.grades[id]) : Object.values(student.grades);
    const gradesArray = values.filter(isPerformanceGrade);
    if (gradesArray.length === 0) return null;
    return +(gradesArray.reduce((a, b) => a + b, 0) / gradesArray.length).toFixed(2);
  });

export const getTopBottom = (students: Student[], values: Array<number | null>, top = true, count = 5) => {
  return [...students]
    .map((s, i) => ({ s, value: values[i] }))
    .filter((item): item is { s: Student; value: number } => item.value != null && Number.isFinite(item.value))
    .sort((a, b) => top ? b.value - a.value : a.value - b.value)
    .slice(0, count);
};

export const calculateBlobValues = (students: Student[], lessons: AcademicLesson[]) =>
  lessons.filter(isPerformanceLesson).map(lesson => {
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0 };
    students.forEach(student => {
      const g = student.grades[lesson.id];
      if (isPerformanceGrade(g)) counts[g] += 1;
    });
    return counts;
  });

export const prepareRadarData = (students: Student[], lessons: AcademicLesson[]) => {
  const gradedLessons = lessons.filter((lesson) => isPerformanceLesson(lesson) && students.some((student) => isPerformanceGrade(student.grades[lesson.id])));
  const blobValues = calculateBlobValues(students, gradedLessons);

  const gradeColors = { 5: '--ui-chart-green', 4: '--ui-chart-purple', 3: '--ui-chart-amber', 2: '--ui-chart-red' };
  const radarDataGrades: RadarDataPoint[] = PERFORMANCE_GRADES.map((grade) => ({
    seriesName: `Оценка ${grade}`, values: blobValues.map((counts) => counts[grade]), colorToken: gradeColors[grade],
  }));

  const maxRadarValue = Math.max(...radarDataGrades.flatMap(d => d.values), 1);

  const attendanceRadarData: RadarDataPoint[] = [
    { seriesName: 'Присутствие', values: lessons.map(lesson => students.filter(s => s.attendance[lesson.id] === 'present').length) },
    { seriesName: 'Болезнь', values: lessons.map(lesson => students.filter(s => s.attendance[lesson.id] === 'sick').length) },
    { seriesName: 'Пропуски', values: lessons.map(lesson => students.filter(s => s.attendance[lesson.id] === 'absent').length) },
    { seriesName: 'Не отмечено', values: lessons.map(lesson => students.filter(s => (s.attendance[lesson.id] ?? 'unmarked') === 'unmarked').length) },
  ];

  const maxAttendanceValue = Math.max(...attendanceRadarData.flatMap(d => d.values), 1);

  const lessonLabel = (lesson: AcademicLesson) => {
    const date = new Date(`${lesson.date}T00:00:00`);
    return `${date.getDate()}.${date.getMonth() + 1}`;
  };
  const radarLabels = lessons.map(lessonLabel);
  const gradeRadarLabels = gradedLessons.map(lessonLabel);

  const daysCount = lessons.length;

  return { radarDataGrades, maxRadarValue, attendanceRadarData, maxAttendanceValue, radarLabels, gradeRadarLabels, daysCount };
};
