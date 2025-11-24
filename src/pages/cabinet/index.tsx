import * as React from 'react';
import { useState, useMemo } from 'react';
import { AttendanceTable } from '../../components/Attendance';
import BarChartTop from '../../components/Charts/BarChartTop/withsegments';
import RadarChart from '../../components/Charts/CircleChart/Radar';
import { Student, INITIAL_STUDENTS } from '../../components/Attendance/data/students';
import styles from './index.module.scss';
import {
  calculateAttendanceCounts,
  calculateGradeCounts,
  getTopBottom,
  prepareRadarData,
} from './chartsCalculation';

const App: React.FC = () => {
  const [students, setStudents] = useState<Student[]>(INITIAL_STUDENTS);

  const chartsData = useMemo(() => {
    const attendanceCounts = calculateAttendanceCounts(students);
    const gradeCounts = calculateGradeCounts(students);

    const topAttendance = getTopBottom(students, attendanceCounts, true);
    const bottomAttendance = getTopBottom(students, attendanceCounts, false);
    const topGrades = getTopBottom(students, gradeCounts, true);
    const bottomGrades = getTopBottom(students, gradeCounts, false);

    const radarData = prepareRadarData(students);

    return { topAttendance, bottomAttendance, topGrades, bottomGrades, ...radarData };
  }, [students]);

  const handleBack = () => window.history.back();

  return (
    <div>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>Группа: 112-МКо. Теория вероятностей</h1>
          <button className={styles.backButton} onClick={handleBack}>Назад</button>
        </div>

        <AttendanceTable students={students} setStudents={setStudents} />

        <div className={styles.flexContainer}>
          <div className={styles.flexItem}>
            <h3>5 лучших по посещаемости</h3>
            <BarChartTop
              labels={chartsData.topAttendance.map(d => d.s.name)}
              values={chartsData.topAttendance.map(d => d.value)}
              maxValue={chartsData.daysCount}
              segments={5}
              height={100}
              colorMode={8}
            />

            <RadarChart
              labels={chartsData.radarLabels}
              data={chartsData.attendanceRadarData}
              maxValue={chartsData.maxAttendanceValue}
              size={300}
              colorMode={7}
            />

            <h3>5 худших по посещаемости</h3>
            <BarChartTop
              labels={chartsData.bottomAttendance.map(d => d.s.name)}
              values={chartsData.bottomAttendance.map(d => d.value)}
              maxValue={chartsData.daysCount}
              segments={5}
              height={100}
              colorMode={2}
            />
          </div>

          <div className={styles.flexItem}>
            <h3>5 лучших по успеваемости</h3>
            <BarChartTop
              labels={chartsData.topGrades.map(d => d.s.name)}
              values={chartsData.topGrades.map(d => d.value)}
              maxValue={5}
              segments={5}
              height={100}
              colorMode={7}
            />

            <RadarChart
              labels={chartsData.radarLabels}
              data={chartsData.radarDataGrades}
              maxValue={chartsData.maxRadarValue}
              size={300}
              colorMode={6}
            />

            <h3>5 худших по успеваемости</h3>
            <BarChartTop
              labels={chartsData.bottomGrades.map(d => d.s.name)}
              values={chartsData.bottomGrades.map(d => d.value)}
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
