interface AttachmentReference {
  attachmentId?: string;
  attachmentName?: string;
}

export const getAssignmentAttachmentName = (attachment: AttachmentReference | undefined, kind: "task" | "answer" = "task"): string | undefined => {
  if (!attachment?.attachmentId) return undefined;
  if (attachment.attachmentName?.trim()) return attachment.attachmentName;
  return kind === "task" ? "Файл задания" : "Вложение к ответу";
};
