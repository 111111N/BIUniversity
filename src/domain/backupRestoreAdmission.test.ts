import { describe, expect, it } from "vitest";
import { assessBackupRestoreAdmission } from "./backupRestoreAdmission";
import type { BackupDocumentReview } from "./localBackupDocuments";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { coreBackupFixture, journalBackupFixture } from "../testSupport/localBackupDocuments";
import { ASSESSMENTS_STORAGE_KEY } from "../data/assessmentStore";

const emptyReview = (): BackupDocumentReview => ({ checks: [], issues: [], uncheckedKeys: [], counts: { valid: 0, invalid: 0, absent: 0, unchecked: 0, errors: 0, reviews: 0 } });

describe("whole-archive document admission", () => {
  it("keeps restoration blocked until assessment schemas and dependencies are supported by the archive inspector", async () => {
    const fixture = coreBackupFixture();
    fixture.archive.localStorage.push({ key: ASSESSMENTS_STORAGE_KEY, raw: '{"version":1,"revision":0,"assessments":[],"history":[]}' });
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.uncheckedKeys).toContain(ASSESSMENTS_STORAGE_KEY);
    expect(assessBackupRestoreAdmission(review)).toMatchObject({ status: "blocked", blockers: expect.arrayContaining([
      expect.objectContaining({ category: "unchecked", key: ASSESSMENTS_STORAGE_KEY }),
    ]) });
  });
  it.each(["unchecked-owner", "unchecked-subject", "missing-group", "unchecked-access"])("blocks the whole archive for one unconfirmed fact: %s", (code) => {
    const review = emptyReview();
    review.issues.push({ level: "review", kind: "accounts", code, referenceId: "related-1", recordId: "row-1", message: "Источник не подтверждён" }); review.counts.reviews++;
    const admission = assessBackupRestoreAdmission(review);
    expect(admission).toMatchObject({ policy: "whole-archive", scope: "archived-document-checks", status: "blocked", counts: { unconfirmed: 1 } });
    expect(admission.blockers).toEqual([{ category: "unconfirmed", kind: "accounts", code, referenceId: "related-1", recordId: "row-1", message: "Источник не подтверждён" }]);
    expect(admission).not.toHaveProperty("allowedRecords");
  });
  it("retains all errors and unchecked document keys beyond a UI page", () => {
    const review = emptyReview();
    review.issues = Array.from({ length: 231 }, (_, i) => ({ level: "error", kind: "accounts", code: "missing-group", recordId: `row-${i}`, message: "Нет группы" }));
    review.uncheckedKeys = ["bi-university-unknown:1", "bi-university-unknown:2"]; review.counts.errors = 231; review.counts.unchecked = 2;
    const admission = assessBackupRestoreAdmission(review);
    expect(admission.blockers).toHaveLength(233); expect(admission.counts.error).toBe(231); expect(admission.counts.unchecked).toBe(2);
    expect(admission.blockers[230].recordId).toBe("row-230"); expect(admission.blockers.at(-1)?.key).toBe("bi-university-unknown:2");
  });
  it("does not lose an invalid-document check when its matching issue was omitted", () => {
    const review = emptyReview(); review.checks.push({ kind: "accounts", key: "bi-university-accounts-v1", label: "Учётки", status: "invalid", message: "Не читается" }); review.counts.invalid++;
    const admission = assessBackupRestoreAdmission(review);
    expect(admission.status).toBe("blocked"); expect(admission.blockers).toEqual([{ category: "error", code: "invalid-document", kind: "accounts", key: "bi-university-accounts-v1", message: "Не читается" }]);
  });
  it("does not duplicate an invalid document already represented by an error", () => {
    const review = emptyReview(); review.checks.push({ kind: "accounts", key: "bi-university-accounts-v1", label: "Учётки", status: "invalid", message: "Не читается" }); review.counts.invalid++;
    review.issues.push({ level: "error", kind: "accounts", code: "invalid-document", message: "Не читается" }); review.counts.errors++;
    expect(assessBackupRestoreAdmission(review).counts.error).toBe(1);
  });
  it.each(["valid", "invalid", "absent", "errors", "reviews", "unchecked"] as const)("fails closed when summary and details disagree: %s", (count) => {
    const review = emptyReview(); review.counts[count] = 1;
    expect(assessBackupRestoreAdmission(review)).toMatchObject({ status: "blocked", counts: { "incomplete-review": 1 } });
  });
  it.each(["duplicate", "non-portal"])("does not accept invalid unchecked inventories: %s", mode => {
    const review = emptyReview(); review.uncheckedKeys = mode === "duplicate" ? ["bi-university-unknown:1", "bi-university-unknown:1"] : ["external-secret"];
    review.counts.unchecked = review.uncheckedKeys.length;
    const admission = assessBackupRestoreAdmission(review);
    expect(admission.status).toBe("blocked"); expect(admission.counts["incomplete-review"]).toBe(1); expect(JSON.stringify(admission)).not.toContain("external-secret");
  });
  it("requires final validation even without document findings and never authorizes writes", () => {
    const review = emptyReview(); const before = JSON.stringify(review);
    const admission = assessBackupRestoreAdmission(review);
    expect(admission).toMatchObject({ status: "requires-final-validation", blockers: [] });
    expect(admission.remainingChecks).toHaveLength(3); expect(admission).not.toHaveProperty("canRestore"); expect(JSON.stringify(review)).toBe(before);
    expect(Object.isFrozen(admission.remainingChecks)).toBe(true);
  });
  it("treats an absent optional document differently from an unconfirmed dependency", () => {
    const review = emptyReview(); review.checks.push({ kind: "planners", key: "bi-university-planner-v1", label: "Планировщик", status: "absent", message: "Нет" }); review.counts.absent++;
    expect(assessBackupRestoreAdmission(review).status).toBe("requires-final-validation");
    review.issues.push({ level: "review", kind: "accounts", code: "unchecked-access", message: "Нет учёток для проверки доступа" }); review.counts.reviews++;
    expect(assessBackupRestoreAdmission(review).status).toBe("blocked");
  });
  it("uses the real inspector's unresolved references without guessing live dependencies", async () => {
    const fixture = coreBackupFixture(); fixture.archive.localStorage = fixture.archive.localStorage.filter(entry => entry.key !== "bi-university-group-catalog-v1");
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo"); const admission = assessBackupRestoreAdmission(review);
    expect(admission.status).toBe("blocked"); expect(admission.blockers.some(blocker => blocker.code === "unchecked-group")).toBe(true);
    expect(admission.counts["incomplete-review"]).toBe(0);
  });
  it("blocks unresolved teaching areas reported by the journal inspector", async () => {
    const fixture = journalBackupFixture(); fixture.archive.localStorage = fixture.archive.localStorage.filter(entry => entry.key !== "bi-university-subject-catalog-v1");
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo"); const admission = assessBackupRestoreAdmission(review);
    expect(admission.status).toBe("blocked"); expect(admission.counts.unconfirmed).toBeGreaterThan(0); expect(admission.counts["incomplete-review"]).toBe(0);
  });
});
