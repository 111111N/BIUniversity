import * as React from 'react';
import { useState, useMemo } from 'react';
import { AttendanceTable } from '../../components/Attendance';
import BarChartTop from '../../components/Charts/BarChartTop/withsegments';
import RadarChart from '../../components/Charts/CircleChart/Radar';
import { Student, INITIAL_STUDENTS, Grade, workDays } from '../../components/Attendance/data/students';
import styles from './index.module.scss';

interface RadarDataPoint {
  seriesName: string;
  values: number[];
}

const App: React.FC = () => {
  const [students, setStudents] = useState<Student[]>(INITIAL_STUDENTS);


  const attendanceCounts = useMemo(
    () => students.map(s =>
      Object.values(s.attendance).filter(v => v === 'present').length
    ),
    [students]
  );

  const gradeCounts = useMemo(() => 
    students.map(student => {
      const gradesArray = Object.values(student.grades).filter(
        (g): g is Exclude<Grade, null> => g !== null
      );
      if (gradesArray.length === 0) return 0;
      return +(gradesArray.reduce((a, b) => a + b, 0) / gradesArray.length).toFixed(2);
    }),
    [students]
  );


  const topAttendance = useMemo(() => {
    return [...students]
      .map((s, i) => ({ s, value: attendanceCounts[i] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [students, attendanceCounts]);

  const bottomAttendance = useMemo(() => {
    return [...students]
      .map((s, i) => ({ s, value: attendanceCounts[i] }))
      .sort((a, b) => a.value - b.value)
      .slice(0, 5);
  }, [students, attendanceCounts]);


  const topGrades = useMemo(() => {
    return [...students]
      .map((s, i) => ({ s, value: gradeCounts[i] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [students, gradeCounts]);

  const bottomGrades = useMemo(() => {
    return [...students]
      .map((s, i) => ({ s, value: gradeCounts[i] }))
      .sort((a, b) => a.value - b.value)
      .slice(0, 5);
  }, [students, gradeCounts]);

  const blobValues = useMemo(() => {
    return workDays.map(day => {
      const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0 };
      students.forEach(student => {
        const g = student.grades[day];
        if (g && counts[g] !== undefined) counts[g] += 1;
      });
      return counts;
    });
  }, [students]);

  const radarLabels = useMemo(() => {
    return workDays.map(day => {
      const date = new Date(day);
      return `${date.getDate()}.${date.getMonth() + 1}`;
    });
  }, []);

  const radarData = useMemo<RadarDataPoint[]>(() => {
    const goodGrades = blobValues.map(dayCounts => (dayCounts[5] || 0) + (dayCounts[4] || 0));
    const poorGrades = blobValues.map(dayCounts => (dayCounts[3] || 0) + (dayCounts[2] || 0));

    return [
      { seriesName: 'Оценки 5 и 4', values: goodGrades },
      { seriesName: 'Оценки 3 и 2', values: poorGrades },
    ];
  }, [blobValues]);

  const maxRadarValue = useMemo(() => {
    const allValues = radarData.flatMap(d => d.values);
    return allValues.length > 0 ? Math.max(...allValues) : 1;
  }, [radarData]);

  // --- Данные для радара по посещаемости ---
  const attendanceRadarData = useMemo<RadarDataPoint[]>(() => {
    const presentCounts = workDays.map(day => students.filter(s => s.attendance[day] === 'present').length);
    const sickCounts = workDays.map(day => students.filter(s => s.attendance[day] === 'sick').length);
    const absentCounts = workDays.map(day => students.filter(s => s.attendance[day] === 'absent').length);

    return [
      { seriesName: 'Присутствие', values: presentCounts },
      { seriesName: 'Болезнь', values: sickCounts },
      { seriesName: 'Пропуски', values: absentCounts },
      
    ];
  }, [students]);

  const maxAttendanceValue = useMemo(() => {
    const allValues = attendanceRadarData.flatMap(d => d.values);
    return allValues.length > 0 ? Math.max(...allValues) : 1;
  }, [attendanceRadarData]);

  return (
    <div>
      <div className={styles.container}>
        <h1>Группа: 112-МКо. Теория вероятностей</h1>
        <AttendanceTable students={students} setStudents={setStudents} />

        <div className={styles.flexContainer}>
          <div className={styles.flexItem}>
            <h3>5 лучших по посещаемости</h3>
            <BarChartTop
              labels={topAttendance.map(d => d.s.name)}
              values={topAttendance.map(d => d.value)}
              maxValue={workDays.length}
              segments={5}
              height={100}
              colorMode={8}
            />

            

            <RadarChart
              labels={radarLabels}
              data={attendanceRadarData}
              maxValue={maxAttendanceValue}
              size={300}
              colorMode={7}
            />
            <h3>5 худших по посещаемости</h3>
            <BarChartTop
              labels={bottomAttendance.map(d => d.s.name)}
              values={bottomAttendance.map(d => d.value)}
              maxValue={workDays.length}
              segments={5}
              height={100}
              colorMode={2}
            />
          </div>

          <div className={styles.flexItem}>
            <h3>5 лучших по успеваемости</h3>
            <BarChartTop
              labels={topGrades.map(d => d.s.name)}
              values={topGrades.map(d => d.value)}
              maxValue={5}
              segments={5}
              height={100}
              colorMode={7}
            />

            

            <RadarChart
              labels={radarLabels}
              data={radarData}
              maxValue={maxRadarValue}
              size={300}
              colorMode={6}
            />
            <h3>5 худших по успеваемости</h3>
            <BarChartTop
              labels={bottomGrades.map(d => d.s.name)}
              values={bottomGrades.map(d => d.value)}
              maxValue={5}
              segments={5}
              height={100}
              colorMode={15}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
