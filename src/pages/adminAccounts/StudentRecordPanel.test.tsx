import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StudentRecordPanel from "./StudentRecordPanel";

const preview = { number: "202630001", year: 2026, campus: 3, sequence: 1, revision: 0 };
const props = { needsNumber: true, campus: 3, preview, loading: false, error: "", disabled: false, busy: false, stale: false, issuing: false, detailsDirty: false, onCampus: () => {}, onRefresh: () => {}, onIssue: () => {} };

describe("student record preview panel", () => {
  it("shows a real read-only preview with its linked explanation before creation", () => {
    const html = renderToStaticMarkup(<StudentRecordPanel {...props} />);
    const input = html.match(/<input[^>]*value="202630001"[^>]*>/)?.[0] ?? "";
    expect(input).toContain('readOnly=""');
    const hint = /aria-describedby="([^"]+)"/.exec(input)?.[1];
    expect(hint).toBeTruthy(); expect(html).toContain(`id="${hint}"`);
    expect(html).toContain("при сохранении учётки"); expect(html).not.toContain("Выдать номер зачетки</button>");
  });
  it("does not display a blank or fabricated student number before campus selection", () => {
    const html = renderToStaticMarkup(<StudentRecordPanel {...props} campus={undefined} preview={null} />);
    expect(html).toContain("Выберите корпус");
    expect(html).not.toContain('readOnly=""'); expect(html).not.toContain("202630001");
  });
  it("hides old previews during loading, failure and a different selected campus", () => {
    for (const patch of [{ loading: true }, { error: "Нет доступа к номерам" }, { campus: 9 }]) {
      const html = renderToStaticMarkup(<StudentRecordPanel {...props} {...patch} />);
      expect(html).not.toContain("202630001");
      expect(html).not.toContain('readOnly=""');
    }
    expect(renderToStaticMarkup(<StudentRecordPanel {...props} loading />)).toContain('aria-busy="true"');
    const failed = renderToStaticMarkup(<StudentRecordPanel {...props} error="Нет доступа к номерам" />);
    expect(failed).toContain('role="alert"'); expect(failed).toContain("Повторить получение номера");
  });
  it("does not offer reissue or campus editing for a retained record", () => {
    const html = renderToStaticMarkup(<StudentRecordPanel {...props} needsNumber={false} record={{ ...preview, issuedAt: "2026-10-28T10:00:00Z" }} />);
    expect(html).toContain('value="202630001"'); expect(html).toContain("Выданный номер сохраняется");
    expect(html).not.toContain("Учебный корпус"); expect(html).not.toContain("<button");
    expect(renderToStaticMarkup(<StudentRecordPanel {...props} needsNumber={false} />)).toBe("");
  });
  it("blocks explicit issue on stale data or unsaved details while explaining why", () => {
    for (const patch of [{ stale: true, reason: "Сначала обновите карточку" }, { detailsDirty: true, reason: "Сначала сохраните изменения данных" }]) {
      const html = renderToStaticMarkup(<StudentRecordPanel {...props} issuing {...patch} />);
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Выдать номер зачетки/);
      expect(html).toContain(patch.reason);
    }
  });
  it("hides a previously ready number on stale data and directs retries through card refresh", () => {
    const html = renderToStaticMarkup(<StudentRecordPanel {...props} stale error="Данные изменились" />);
    expect(html).not.toContain("202630001"); expect(html).toContain("Обновите проверку карточки");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Повторить получение номера/);
    expect(html).not.toContain("Получить актуальный номер</button>");
  });
});
