export type StudentEnrollmentStatus = "studying" | "academicLeave" | "graduated" | "withdrawn";
export const STUDENT_ENROLLMENT_LABELS: Record<StudentEnrollmentStatus, string> = { studying: "Учится", academicLeave: "Академический отпуск", graduated: "Выпущен", withdrawn: "Отчислен" };
export const isStudentEnrollmentStatus = (value: unknown): value is StudentEnrollmentStatus => typeof value === "string" && Object.hasOwn(STUDENT_ENROLLMENT_LABELS, value);
export const isStudyingStudent = (account: { role: string; enrollmentStatus?: StudentEnrollmentStatus }) => account.role === "student" && (account.enrollmentStatus ?? "studying") === "studying";
