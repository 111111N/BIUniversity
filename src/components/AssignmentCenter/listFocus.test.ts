import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restoreAssignmentListFocus } from "./listFocus";

const element = (id?: string) => ({
  dataset: { assignmentOpen: id },
  focus: vi.fn(),
  scrollIntoView: vi.fn(),
});
type ElementStub = ReturnType<typeof element>;
const list = (controls: { assignments?: ElementStub[]; search?: ElementStub; create?: ElementStub; activeFilter?: ElementStub } = {}) => ({
  ...element(),
  querySelectorAll: vi.fn(() => controls.assignments ?? []),
  querySelector: vi.fn((selector: string) => {
    if (selector === 'input[type="search"]') return controls.search ?? null;
    if (selector === "[data-assignment-create]") return controls.create ?? null;
    if (selector === 'button[aria-pressed="true"]') return controls.activeFilter ?? null;
    throw new Error(`Unexpected selector: ${selector}`);
  }),
});
const restore = (root: ReturnType<typeof list>, position: Parameters<typeof restoreAssignmentListFocus>[1]) => restoreAssignmentListFocus(root as unknown as HTMLElement, position);
const scrollTo = vi.fn();

describe("assignment list return focus", () => {
  beforeEach(() => { scrollTo.mockReset(); vi.stubGlobal("window", { scrollTo }); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("restores the opened assignment and previous position while keeping the focused item visible", () => {
    const other = element("other");
    const selected = element("selected");
    const search = element();
    restore(list({ assignments: [other, selected], search }), { id: "selected", top: 920 });
    expect(scrollTo).toHaveBeenCalledWith({ top: 920, behavior: "auto" });
    expect(selected.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(selected.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    expect(search.focus).not.toHaveBeenCalled();
    expect(other.focus).not.toHaveBeenCalled();
  });

  it("returns to creation after cancelling the editor instead of focusing an unrelated assignment", () => {
    const create = element();
    const search = element();
    restore(list({ create, search, assignments: [element("other")] }), { id: null, top: 340 });
    expect(create.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scrollTo).toHaveBeenCalledWith({ top: 340, behavior: "auto" });
    expect(search.focus).not.toHaveBeenCalled();
  });

  it.each(["deleted", "hidden-by-search", "no-longer-awaiting-review"])("uses search without restoring an obsolete scroll position when %s disappears", (id) => {
    const search = element();
    const other = element("other");
    restore(list({ assignments: [other], search, create: element() }), { id, top: 2400 });
    expect(search.focus).toHaveBeenCalledWith({ preventScroll: false });
    expect(search.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(other.focus).not.toHaveBeenCalled();
  });

  it("uses search after returning from a direct link without a list snapshot", () => {
    const search = element();
    restore(list({ search, create: element() }), null);
    expect(search.focus).toHaveBeenCalledWith({ preventScroll: false });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("uses creation for an empty teacher list that no longer contains search", () => {
    const create = element();
    restore(list({ create }), { id: "deleted-last-task", top: 1300 });
    expect(create.focus).toHaveBeenCalledWith({ preventScroll: false });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("uses the active filter for an empty student list", () => {
    const activeFilter = element();
    restore(list({ activeFilter }), null);
    expect(activeFilter.focus).toHaveBeenCalledWith({ preventScroll: false });
  });

  it("can focus the labelled list itself when no control remains", () => {
    const root = list();
    restore(root, null);
    expect(root.focus).toHaveBeenCalledWith({ preventScroll: false });
  });

  it("matches IDs as data within the current list, without building a CSS selector from an ID", () => {
    const id = 'task"] [data-assignment-open="other';
    const selected = element(id);
    const root = list({ assignments: [element("other"), selected] });
    restore(root, { id, top: 0 });
    expect(selected.focus).toHaveBeenCalled();
    expect(root.querySelectorAll).toHaveBeenCalledWith("[data-assignment-open]");
    expect(root.querySelector).not.toHaveBeenCalled();
  });
});
