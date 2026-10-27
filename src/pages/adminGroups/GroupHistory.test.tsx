import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GroupHistory from "./GroupHistory";

describe("group history availability", () => {
  it("does not present an unreadable history as an empty history", () => {
    const failed = renderToStaticMarkup(<GroupHistory entries={[]} accounts={[]} requestedPage={null} unavailable onPage={() => {}} />);
    expect(failed).toContain("История временно недоступна"); expect(failed).not.toContain("Истории изменений пока нет");
    const empty = renderToStaticMarkup(<GroupHistory entries={[]} accounts={[]} requestedPage={null} onPage={() => {}} />);
    expect(empty).toContain("Истории изменений пока нет");
  });
});
