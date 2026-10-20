import { describe, expect, it } from "vitest";
import { ACADEMIC_GROUPS, getAcademicGroup, getAcademicSubjectByName, getJournalHref, isAcademicMembershipMatch, SUBJECT_GROUP_OFFERINGS, SUBJECTS } from "./academicCatalog";

describe("academic catalog", () => {
  const memberships = [{ subjectId: "data-analysis", groupIds: ["112-mko", "411-bi"] }];

  it("resolves canonical subject and group values", () => {
    expect(getAcademicSubjectByName("Анализ данных")?.id).toBe("data-analysis");
    expect(getAcademicGroup("411-bi")?.name).toBe("411-БИ");
  });

  it("builds journal routes without manual transliteration", () => {
    expect(getJournalHref("Анализ данных", "411-БИ")).toBe("/journal/data-analysis/411-bi");
    expect(getJournalHref("Неизвестный предмет", "411-БИ")).toBe("/journal");
  });

  it("matches a subject and group against memberships", () => {
    expect(isAcademicMembershipMatch(memberships, "Анализ данных", "411-БИ")).toBe(true);
    expect(isAcademicMembershipMatch(memberships, "Анализ данных", "412-БИ")).toBe(false);
  });

  it("contains unique IDs and no dangling offerings", () => {
    expect(new Set(SUBJECTS.map((item) => item.id)).size).toBe(SUBJECTS.length);
    expect(new Set(ACADEMIC_GROUPS.map((item) => item.id)).size).toBe(ACADEMIC_GROUPS.length);
    const subjectIds = new Set(SUBJECTS.map((item) => item.id));
    const groupIds = new Set(ACADEMIC_GROUPS.map((item) => item.id));
    const pairs = SUBJECT_GROUP_OFFERINGS.map((item) => `${item.subjectId}:${item.groupId}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(SUBJECT_GROUP_OFFERINGS.every((item) => subjectIds.has(item.subjectId) && groupIds.has(item.groupId))).toBe(true);
  });
});
