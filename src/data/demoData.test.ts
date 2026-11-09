import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./assessmentStore", () => ({ appendAssessmentDemoRecords: vi.fn() }));
vi.mock("./demo/learning", () => ({ createLearningDemo: () => ({ assignments: [], submissions: [] }), createPlannerDemo: () => [] }));
vi.mock("./assignmentStore", () => ({ appendLearningDemoRecords: () => ({ assignments: 0, submissions: 0 }), getAssignments: () => [], getSubmissions: () => [], deleteAssignmentFile: vi.fn(), saveAssignmentFile: vi.fn() }));
vi.mock("./plannerStore", () => ({ appendPlannerDemoNotes: () => 0 }));
vi.mock("./academicCatalog", () => ({ DEMO_SUBJECTS: [], getAcademicGroup: vi.fn(), getAcademicSubjectDefinition: vi.fn() }));
vi.mock("./materialRepository", () => ({ materialRepository: {} }));
vi.mock("./journalStore", () => ({ appendJournalDemoRecords: vi.fn() }));
vi.mock("./notificationStore", () => ({ addNotification: vi.fn() }));
import { appendAssessmentDemoRecords } from "./assessmentStore";
import { importDemoData } from "./demoData";

beforeEach(() => { vi.stubGlobal("navigator", {}); vi.mocked(appendAssessmentDemoRecords).mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("ordinary demo import assessments", () => {
  it("includes assessment counts without a teacher-only journal option", async () => {
    vi.mocked(appendAssessmentDemoRecords).mockResolvedValue({ assessments: 12, assessmentAttempts: 18 });
    expect(await importDemoData(new Date("2026-11-06"))).toMatchObject({ assessments: 12, assessmentAttempts: 18, warnings: [] });
    expect(appendAssessmentDemoRecords).toHaveBeenCalledOnce();
  });
  it("reports an assessment failure without aborting the other demo sections", async () => {
    vi.mocked(appendAssessmentDemoRecords).mockRejectedValue(new Error("corrupt"));
    const result = await importDemoData(new Date("2026-11-06"));
    expect(result).toMatchObject({ assessments: 0, assessmentAttempts: 0, assignments: 0 });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Аттестации не добавлены");
  });
});
