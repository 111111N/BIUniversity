import { lazy, Suspense, useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Nav from "./components/Navigation";
import NavigationScroll from "./components/NavigationScroll";
import PageNavigation from "./components/PageNavigation";
import ErrorBoundary from "./components/ErrorBoundary";
import { RoleProvider, useRole } from "./components/RoleContext";
import { ThemeProvider } from "./components/ThemeContext";
import RoleRoute from "./components/RoleRoute";
import { UnsavedChangesProvider } from "./components/UnsavedChangesProvider";
import './styles/global.scss';
import { connectAdministrationPolicies } from "./data/administrationIntegration";
import { isAccountActive } from "./domain/accounts";
import RoleSwitcher from "./components/RoleSwitcher";
import ScheduleAssignmentProvider from "./components/ScheduleAssignmentProvider";

const Home = lazy(() => import("./pages/home"));
const Schedule = lazy(() => import("./pages/schedule"));
const Cabinet = lazy(() => import("./pages/cabinet"));
const Journal = lazy(() => import("./pages/journal"));
const JournalCatalog = lazy(() => import("./components/JournalCatalog"));
const Planner = lazy(() => import("./pages/planner"));
const Stats = lazy(() => import("./pages/stats"));
const StudentPage = lazy(() => import("./pages/student"));
const MessagesPage = lazy(() => import("./pages/messages"));
const NotificationsPage = lazy(() => import("./pages/notifications"));
const TeacherPage = lazy(() => import("./pages/teacher"));
const StudentHome = lazy(() => import("./pages/studentHome"));
const StudentCabinet = lazy(() => import("./pages/studentCabinet"));
const StudentJournal = lazy(() => import("./pages/studentJournal"));
const NotFound = lazy(() => import("./pages/notFound"));
const AdminSchedule = lazy(() => import("./pages/adminSchedule"));
const AdminAccounts = lazy(() => import("./pages/adminAccounts"));
const AdminSubjects = lazy(() => import("./pages/adminSubjects"));
const AdminGroups = lazy(() => import("./pages/adminGroups"));
const StudentImport = lazy(() => import("./pages/studentImport"));
const StudentEducation = lazy(() => import("./pages/studentEducation"));
const AdminStudents = lazy(() => import("./pages/adminStudents"));
const AdminTeachers = lazy(() => import("./pages/adminTeachers"));
const AdminChecks = lazy(() => import("./pages/adminChecks"));
const AdminData = lazy(() => import("./pages/adminData"));
const academicRoles = ["teacher", "student"] as const;

const LayoutWithNav = () => {
    const location = useLocation();
    const { role, currentUser, accountError, refreshAccounts } = useRole();
    const [blobs] = useState(() => Array.from({ length: 6 }, (_, index) => ({
        top: `${12 + index * 14}%`, left: `${index % 2 === 0 ? 22 : 78}%`,
    })));

    if (accountError) return <div className="dashboard-layout"><PageNavigation /><main id="main-content" className="main-content" tabIndex={-1}><section className="pageContainer" role="alert"><h1>Учётные записи временно недоступны</h1><p>{accountError}</p><button type="button" onClick={refreshAccounts}>Повторить чтение</button></section></main></div>;
    if (!isAccountActive(currentUser)) return <main id="main-content" className="pageContainer" tabIndex={-1}><h1>Учётная запись заблокирована</h1><p>Для восстановления доступа обратитесь к настройщику. Учебные данные и история сохранены.</p><div style={{ maxWidth: 380 }}><RoleSwitcher /></div></main>;

    return (
        <div className="dashboard-layout">
            <PageNavigation />
            <Nav key={currentUser.id} />
            <NavigationScroll />

            <main id="main-content" className="main-content" tabIndex={-1}>
                {blobs.map((style, index) => (
                    <div 
                        key={index} 
                        className={`blob blob-${index % 2 === 0 ? 'even' : 'odd'}`} 
                        style={style}
                    ></div>
                ))}

                <ScheduleAssignmentProvider key={`${currentUser.id}:${role}`}><ErrorBoundary key={`${currentUser.id}:${role}:${location.pathname}`}><Suspense fallback={<div className="page-loader" role="status"><span /><p>Загружаем раздел…</p></div>}><Routes>
                    <Route path="/" element={role === "configurator" ? <Navigate to="/admin/schedule" replace /> : role === "student" ? <StudentHome /> : <Home />} />
                    <Route path="/schedule" element={<Schedule />} />
                    <Route path="/admin/schedule" element={<RoleRoute allow="configurator"><AdminSchedule /></RoleRoute>} />
                    <Route path="/admin/accounts" element={<RoleRoute allow="configurator"><AdminAccounts /></RoleRoute>} />
                    <Route path="/admin/accounts/import" element={<RoleRoute allow="configurator"><StudentImport /></RoleRoute>} />
                    <Route path="/admin/subjects" element={<RoleRoute allow="configurator"><AdminSubjects /></RoleRoute>} />
                    <Route path="/admin/groups" element={<RoleRoute allow="configurator"><AdminGroups /></RoleRoute>} />
                    <Route path="/admin/students/:accountId/education" element={<RoleRoute allow="configurator"><StudentEducation /></RoleRoute>} />
                    <Route path="/admin/students" element={<RoleRoute allow="configurator"><AdminStudents /></RoleRoute>} />
                    <Route path="/admin/teachers" element={<RoleRoute allow="configurator"><AdminTeachers /></RoleRoute>} />
                    <Route path="/admin/checks" element={<RoleRoute allow="configurator"><AdminChecks /></RoleRoute>} />
                    <Route path="/admin/data" element={<RoleRoute allow="configurator"><AdminData /></RoleRoute>} />
                    <Route path="/cabinet" element={<RoleRoute allow={academicRoles}>{role === "student" ? <StudentCabinet /> : <Cabinet />}</RoleRoute>} />
                    <Route path="/journal/:subjectId/:groupId" element={<RoleRoute allow={academicRoles}>{role === "student" ? <StudentJournal /> : <Journal />}</RoleRoute>} />
                    <Route path="/journal/:subjectId" element={<RoleRoute allow={academicRoles}>{role === "student" ? <StudentJournal /> : <JournalCatalog />}</RoleRoute>} />
                    <Route path="/journal" element={<RoleRoute allow={academicRoles}>{role === "student" ? <StudentJournal /> : <JournalCatalog />}</RoleRoute>} />
                    <Route path="/planner" element={<RoleRoute allow="teacher"><Planner /></RoleRoute>} />
                    <Route path="/stats" element={<RoleRoute allow="teacher"><Stats /></RoleRoute>} />
                    <Route path="/students/:studentId" element={<RoleRoute allow={academicRoles}><StudentPage /></RoleRoute>} />
                    <Route path="/teachers/:teacherId" element={<RoleRoute allow={academicRoles}><TeacherPage /></RoleRoute>} />
                    <Route path="/messages" element={<RoleRoute allow={academicRoles}><MessagesPage /></RoleRoute>} />
                    <Route path="/notifications" element={<RoleRoute allow={academicRoles}><NotificationsPage /></RoleRoute>} />
                    <Route path="*" element={<NotFound />} />
                </Routes></Suspense></ErrorBoundary></ScheduleAssignmentProvider>
            </main>
        </div>
    );
};

const AppProviders = () => {
    useEffect(connectAdministrationPolicies, []);
    return (
        <ThemeProvider>
            <RoleProvider>
                <UnsavedChangesProvider>
                    <LayoutWithNav />
                </UnsavedChangesProvider>
            </RoleProvider>
        </ThemeProvider>
    );
};

const router = createBrowserRouter([{ path: "*", element: <AppProviders /> }], { basename: import.meta.env.BASE_URL });

export default function App() {
    return <RouterProvider router={router} />;
}
