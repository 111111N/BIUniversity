import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DateTimePicker from "./index";

describe("calendar trigger accessibility contract", () => {
  it("supports a field label, linked help and error, and an explicit disabled state", () => {
    const html = renderToStaticMarkup(<DateTimePicker id="date-field" describedBy="date-help date-error" invalid disabled showTime={false} onChange={() => undefined} />);
    expect(html).toContain('id="date-field"'); expect(html).toContain('aria-describedby="date-help date-error"');
    expect(html).toContain('data-invalid="true"'); expect(html).not.toContain("aria-invalid"); expect(html).toContain('aria-expanded="false"'); expect(html).toContain('disabled=""');
    expect(html).not.toContain('role="dialog"');
  });
  it("keeps the default trigger enabled and unmarked for existing consumers", () => {
    const html = renderToStaticMarkup(<DateTimePicker value={new Date(2026, 9, 28, 9)} onChange={() => undefined} />);
    expect(html).not.toContain("aria-invalid"); expect(html).not.toContain("aria-describedby"); expect(html).not.toContain("disabled");
    expect(html).toContain("28 октября 2026, 09:00");
  });
});
