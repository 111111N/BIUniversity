import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredMessage } from "../data/messageStore";
import { inspectArchivedReplyChains } from "./backupReplyChains";
import { inspectBackupMessaging } from "./backupMessagingDocuments";

const row = (id: number, patch: Partial<StoredMessage> = {}): StoredMessage => ({ id, incoming: false, text: "PRIVATE BODY", time: "вчера", ...patch });
const forbidden = vi.fn(() => { throw new Error("Reply-chain inspection must not access live storage or files"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("sessionStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); });
afterEach(() => vi.unstubAllGlobals());

describe("archived reply chains", () => {
  it("checks immutable chains without interpreting display time or numeric order as chronology", async () => {
    const rows = Object.freeze([Object.freeze(row(0, { replyTo: 50 })), Object.freeze(row(50, { replyTo: -0.5 })), Object.freeze(row(-0.5))]);
    const before = JSON.stringify(rows);
    expect(await inspectArchivedReplyChains(rows)).toEqual([]); expect(JSON.stringify(rows)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });

  it("reports one finding for a cycle, excluding the paths that merely lead into it", async () => {
    const rows = [row(10, { replyTo: 1 }), row(1, { replyTo: 2 }), row(2, { replyTo: 1 }), row(20, { replyTo: 2 })];
    const before = JSON.stringify(rows); const findings = await inspectArchivedReplyChains(rows);
    expect(findings).toEqual([expect.objectContaining({ level: "error", code: "cyclic-message-replies", id: 1 })]);
    expect(JSON.stringify(findings)).not.toContain("PRIVATE"); expect(JSON.stringify(rows)).toBe(before);
  });

  it("keeps independent cycles separate, including a message numbered zero", async () => {
    const findings = await inspectArchivedReplyChains([row(0, { replyTo: 1 }), row(1, { replyTo: 0 }), row(2, { replyTo: 3 }), row(3, { replyTo: 2 })]);
    expect(findings.map((finding) => finding.id)).toEqual([0, 2]); expect(findings.every((finding) => finding.code === "cyclic-message-replies")).toBe(true);
  });

  it("does not duplicate the existing local findings for missing or self-referencing originals", async () => {
    expect(await inspectArchivedReplyChains([row(1, { replyTo: 99 }), row(2, { replyTo: 2 })])).toEqual([]);
  });

  it("marks reversed saved dates for review without exposing dates, text or declaring a delivery failure", async () => {
    const rows = [row(1, { sentAt: "2026-10-29T12:00:00Z" }), row(2, { replyTo: 1, sentAt: "2026-10-29T11:59:00Z" })];
    const findings = await inspectArchivedReplyChains(rows);
    expect(findings).toEqual([expect.objectContaining({ level: "review", code: "reply-before-original", id: 2 })]);
    expect(JSON.stringify(findings)).not.toContain("2026-"); expect(JSON.stringify(findings)).not.toContain("PRIVATE");
  });

  it.each(["2026-10-29T12:00:00Z", "2026-10-29T15:00:00+03:00", "2026-10-29T12:01:00Z"])("accepts an equal or later reply instant: %s", async (sentAt) => {
    expect(await inspectArchivedReplyChains([row(100, { sentAt: "2026-10-29T12:00:00Z" }), row(1, { replyTo: 100, sentAt })])).toEqual([]);
  });

  it.each([undefined, "PRIVATE INVALID DATE"])("never invents a timestamp when the original date is unavailable: %s", async (sentAt) => {
    expect(await inspectArchivedReplyChains([row(1, { sentAt }), row(2, { replyTo: 1, sentAt: "2026-10-29T12:00:00Z" })])).toEqual([]);
  });

  it("does not pile chronology warnings onto edges in an already identified cycle", async () => {
    const findings = await inspectArchivedReplyChains([row(1, { replyTo: 2, sentAt: "2026-10-29T12:00:00Z" }), row(2, { replyTo: 1, sentAt: "2026-10-29T13:00:00Z" })]);
    expect(findings).toHaveLength(1); expect(findings[0].code).toBe("cyclic-message-replies");
  });

  it("handles a long chain iteratively, retaining the original order", async () => {
    const rows = Array.from({ length: 6000 }, (_, id) => row(id, id ? { replyTo: id - 1 } : {})).reverse();
    const before = JSON.stringify(rows); expect(await inspectArchivedReplyChains(rows)).toEqual([]); expect(JSON.stringify(rows)).toBe(before);
  });

  it("keeps all findings beyond 200 and cancels while a large thread is being processed", async () => {
    const rows = Array.from({ length: 500 }, (_, id) => row(id, { replyTo: id % 2 ? id - 1 : id + 1 }));
    const findings = await inspectArchivedReplyChains(rows);
    expect(findings).toHaveLength(250); expect(findings.at(-1)?.id).toBe(498);
    const controller = new AbortController(); const pending = inspectArchivedReplyChains(rows, controller.signal);
    const timer = setTimeout(() => controller.abort(), 0);
    try { await expect(pending).rejects.toMatchObject({ name: "AbortError" }); } finally { clearTimeout(timer); }
    expect(forbidden).not.toHaveBeenCalled();
  });

  it.each(["bi-university-messages-v1:student", "bi-university-messages-v2:student:student-1"])("checks cycles in legacy document %s without migrating it", async (key) => {
    const entry = { key, raw: JSON.stringify({ dialogIds: ["teacher-1"], messages: { "teacher-1": [row(1, { replyTo: 2 }), row(2, { replyTo: 1 })] } }) };
    const before = entry.raw; const review = await inspectBackupMessaging([entry], new Set(["student-1", "teacher-1"]));
    expect(review.checks[0].status).toBe("valid");
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "cyclic-message-replies", referenceId: key, recordId: JSON.stringify([key, "teacher-1", 1]) }));
    expect(entry.raw).toBe(before); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });
});
