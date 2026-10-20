import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Nav from "./components/Navigation";
import ErrorBoundary from "./components/ErrorBoundary";
import { RoleProvider, useRole } from "./components/RoleContext";
import { ThemeProvider } from "./components/ThemeContext";
import RoleRoute from "./components/RoleRoute";
import './styles/global.scss';

const Home = lazy(() => import("./pages/home"));
const Schedule = lazy(() => import("./pages/schedule"));
const Cabinet = lazy(() => import("./pages/cabinet"));
const Journal = lazy(() => import("./pages/journal"));
const JournalCatalog = lazy(() => import("./components/JournalCatalog"));
const Planner = lazy(() => import("./pages/planner"));
const Stats = lazy(() => import("./pages/stats"));
const StudentPage = lazy(() => import("./pages/student"));
const MessagesPage = lazy(() => import("./pages/messages"));
const TeacherPage = lazy(() => import("./pages/teacher"));
const StudentHome = lazy(() => import("./pages/studentHome"));
const StudentCabinet = lazy(() => import("./pages/studentCabinet"));
const StudentJournal = lazy(() => import("./pages/studentJournal"));
const NotFound = lazy(() => import("./pages/notFound"));

const LayoutWithNav = () => {
    const location = useLocation();
    const { role } = useRole();
    const [blobs, setBlobs] = useState<Array<{top?: string, left?: string, bottom?: string, right?: string}>>([]);
    const getRandomPercentage = () => Math.floor(Math.random() * 80) + 10;
    useEffect(() => {
        const newBlobs = Array.from({ length: 6 }).map((_, i) => {
            if (i % 2 === 0) {
                return { top: `${getRandomPercentage()}%`, left: `${getRandomPercentage()}%` };
            } else {
                return { bottom: `${getRandomPercentage()}%`, right: `${getRandomPercentage()}%` };
            }
        });
        setBlobs(newBlobs);
    }, [location]);

    return (
        <div className="dashboard-layout">
            <Nav />

            <main className="main-content">
                {blobs.map((style, index) => (
                    <div 
                        key={index} 
                        className={`blob blob-${index % 2 === 0 ? 'even' : 'odd'}`} 
                        style={style}
                    ></div>
                ))}

                <ErrorBoundary key={`${role}:${location.pathname}`}><Suspense fallback={<div className="page-loader" role="status"><span /><p>Загружаем раздел…</p></div>}><Routes>
                    <Route path="/" element={role === "student" ? <StudentHome /> : <Home />} />
                    <Route path="/schedule" element={<Schedule />} />
                    <Route path="/cabinet" element={role === "student" ? <StudentCabinet /> : <Cabinet />} />
                    <Route path="/journal/:subjectId/:groupId" element={role === "student" ? <StudentJournal /> : <Journal />} />
                    <Route path="/journal/:subjectId" element={role === "student" ? <StudentJournal /> : <JournalCatalog />} />
                    <Route path="/journal" element={role === "student" ? <StudentJournal /> : <JournalCatalog />} />
                    <Route path="/planner" element={<RoleRoute allow="teacher"><Planner /></RoleRoute>} />
                    <Route path="/stats" element={<RoleRoute allow="teacher"><Stats /></RoleRoute>} />
                    <Route path="/students/:studentId" element={<StudentPage />} />
                    <Route path="/teachers/:teacherId" element={<TeacherPage />} />
                    <Route path="/messages" element={<MessagesPage />} />
                    <Route path="/notifications" element={<Navigate to="/?notifications=open" replace />} />
                    <Route path="*" element={<NotFound />} />
                </Routes></Suspense></ErrorBoundary>
            </main>
        </div>
    );
};

export default function App() {
    return (
        <BrowserRouter basename={import.meta.env.BASE_URL}>
            <ThemeProvider>
                <RoleProvider>
                    <LayoutWithNav />
                </RoleProvider>
            </ThemeProvider>
        </BrowserRouter>
    );
}
