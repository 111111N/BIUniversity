import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type DownloadButton from "../../DownloadButton";
import { downloadAssignmentFile } from "../../../data/assignmentStore";
import AssignmentFile from ".";

const button = vi.hoisted(() => ({ props: undefined as ComponentProps<typeof DownloadButton> | undefined }));
vi.mock("../../../data/assignmentStore", () => ({ downloadAssignmentFile: vi.fn() }));
vi.mock("../../DownloadButton", () => ({
  default: (props: ComponentProps<typeof DownloadButton>) => {
    button.props = props;
    return <button type="button">{props.name}</button>;
  },
}));

describe("assignment file access", () => {
  beforeEach(() => { button.props = undefined; vi.mocked(downloadAssignmentFile).mockReset(); });
  afterEach(() => vi.restoreAllMocks());

  it("does not offer a download when only a filename is known", () => {
    expect(renderToStaticMarkup(<AssignmentFile attachment={{ attachmentName: "answer.pdf" }} />)).toBe("");
    expect(button.props).toBeUndefined();
    expect(downloadAssignmentFile).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "task", label: "Файл задания" },
    { kind: "answer", label: "Вложение к ответу" },
  ] as const)("keeps an unnamed $kind file downloadable with a useful name", async ({ kind, label }) => {
    const markup = renderToStaticMarkup(<AssignmentFile attachment={{ attachmentId: "file-id" }} kind={kind} />);
    expect(markup).toContain(label);
    await button.props!.onDownload();
    expect(downloadAssignmentFile).toHaveBeenCalledExactlyOnceWith("file-id", label);
  });

  it("uses the fallback for a whitespace-only filename", async () => {
    renderToStaticMarkup(<AssignmentFile attachment={{ attachmentId: "file-id", attachmentName: " \t " }} kind="answer" />);
    expect(button.props!.name).toBe("Вложение к ответу");
    await button.props!.onDownload();
    expect(downloadAssignmentFile).toHaveBeenCalledExactlyOnceWith("file-id", "Вложение к ответу");
  });

  it("preserves a long filename and its extension and uses the supplied control style", async () => {
    const name = `${"Длинное название файла ".repeat(20)}.pdf`;
    renderToStaticMarkup(<AssignmentFile attachment={{ attachmentId: "file-id", attachmentName: name }} className="answer-file" />);
    expect(button.props!.name).toBe(name);
    expect(button.props!.className).toBe("answer-file");
    await button.props!.onDownload();
    expect(downloadAssignmentFile).toHaveBeenCalledExactlyOnceWith("file-id", name);
  });

  it.each(["task", "answer"] as const)("logs a failed %s download and passes the failure to the retryable control", async (kind) => {
    const failure = new Error("File missing");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(downloadAssignmentFile).mockRejectedValueOnce(failure);
    renderToStaticMarkup(<AssignmentFile attachment={{ attachmentId: "missing" }} kind={kind} />);
    expect(button.props!.errorMessage).toContain(kind === "task" ? "Файл задания недоступен" : "Файл ответа недоступен");
    expect(button.props!.errorMessage).not.toContain("попросите преподавателя");
    await expect(button.props!.onDownload()).rejects.toBe(failure);
    expect(error).toHaveBeenCalledExactlyOnceWith(kind === "task" ? "Не удалось скачать файл задания." : "Не удалось скачать вложение ответа студента.", failure);
    await expect(button.props!.onDownload()).resolves.toBeUndefined();
    expect(downloadAssignmentFile).toHaveBeenCalledTimes(2);
  });
});
