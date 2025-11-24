import { Student, Grade, workDays } from '../../components/Attendance/data/students';

export interface RadarDataPoint {
  seriesName: string;
  values: number[];
}

// --- Хелперы ---
export const calculateAttendanceCounts = (students: Student[]) =>
  students.map(s => Object.values(s.attendance).filter(v => v === 'present').length);

export const calculateGradeCounts = (students: Student[]) =>
  students.map(student => {
    const gradesArray = Object.values(student.grades).filter(
      (g): g is Exclude<Grade, null> => g !== null
    );
    if (gradesArray.length === 0) return 0;
    return +(gradesArray.reduce((a, b) => a + b, 0) / gradesArray.length).toFixed(2);
  });

export const getTopBottom = <T,>(students: Student[], values: number[], top = true, count = 5) => {
  return [...students]
    .map((s, i) => ({ s, value: values[i] }))
    .sort((a, b) => top ? b.value - a.value : a.value - b.value)
    .slice(0, count);
};

export const calculateBlobValues = (students: Student[]) =>
  workDays.map(day => {
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0 };
    students.forEach(student => {
      const g = student.grades[day];
      if (g && counts[g] !== undefined) counts[g] += 1;
    });
    return counts;
  });

export const prepareRadarData = (students: Student[]) => {
  const blobValues = calculateBlobValues(students);

  const radarDataGrades: RadarDataPoint[] = [
    { seriesName: 'Оценки 5 и 4', values: blobValues.map(d => (d[5] || 0) + (d[4] || 0)) },
    { seriesName: 'Оценки 3 и 2', values: blobValues.map(d => (d[3] || 0) + (d[2] || 0)) },
  ];

  const maxRadarValue = Math.max(...radarDataGrades.flatMap(d => d.values), 1);

  const attendanceRadarData: RadarDataPoint[] = [
    { seriesName: 'Присутствие', values: workDays.map(day => students.filter(s => s.attendance[day] === 'present').length) },
    { seriesName: 'Болезнь', values: workDays.map(day => students.filter(s => s.attendance[day] === 'sick').length) },
    { seriesName: 'Пропуски', values: workDays.map(day => students.filter(s => s.attendance[day] === 'absent').length) },
  ];

  const maxAttendanceValue = Math.max(...attendanceRadarData.flatMap(d => d.values), 1);

  const radarLabels = workDays.map(day => {
    const date = new Date(day);
    return `${date.getDate()}.${date.getMonth() + 1}`;
  });

  const daysCount = workDays.length;

  return { radarDataGrades, maxRadarValue, attendanceRadarData, maxAttendanceValue, radarLabels, daysCount };
};
