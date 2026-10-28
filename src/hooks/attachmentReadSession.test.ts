import { describe, expect, it } from "vitest";
import { createAttachmentReadSession } from "./attachmentReadSession";

describe("attachment reads across lifecycle changes", () => {
  it("allows only one read at a time and permits a new read after completion", () => {
    const session = createAttachmentReadSession(); const first = session.begin()!;
    expect(session.begin()).toBeNull(); expect(session.isCurrent(first)).toBe(true);
    expect(session.finish(first)).toBe(true); const second = session.begin()!;
    expect(second).toBeGreaterThan(first); expect(session.isCurrent(first)).toBe(false);
  });
  it("does not let a late response or finally release the next chat's in-flight read", () => {
    const session = createAttachmentReadSession(); const old = session.begin()!;
    session.invalidate(); const next = session.begin()!;
    expect(session.isCurrent(old)).toBe(false); expect(session.finish(old)).toBe(false);
    expect(session.begin()).toBeNull(); expect(session.isCurrent(next)).toBe(true); expect(session.finish(next)).toBe(true);
  });
  it("rejects success and failure after unmount even before another file is opened", () => {
    const session = createAttachmentReadSession(); const id = session.begin()!;
    session.invalidate(); expect(session.isCurrent(id)).toBe(false); expect(session.finish(id)).toBe(false);
  });
  it("keeps cancelled tokens invalid across repeated setup and cleanup", () => {
    const session = createAttachmentReadSession(); const ids: number[] = [];
    for (let index = 0; index < 5; index++) { session.invalidate(); ids.push(session.begin()!); session.invalidate(); }
    const active = session.begin()!;
    expect(new Set([...ids, active]).size).toBe(6);
    for (const id of ids) { expect(session.isCurrent(id)).toBe(false); expect(session.finish(id)).toBe(false); }
    expect(session.isCurrent(active)).toBe(true); expect(session.begin()).toBeNull();
  });
  it("allows retry after a failed current read and isolates sessions of different components", () => {
    const session = createAttachmentReadSession(); const first = session.begin()!;
    session.finish(first); const retry = session.begin()!; const other = createAttachmentReadSession();
    other.begin(); other.invalidate(); expect(session.isCurrent(retry)).toBe(true); expect(session.begin()).toBeNull();
  });
});
