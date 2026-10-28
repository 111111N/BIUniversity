import { useCallback, useEffect, useState } from "react";
import { messageAttachmentRepository } from "../data/messageAttachmentRepository";
import type { MessageAttachment } from "../data/messageStore";
import { downloadBlob } from "../domain/fileDownload";
import { getFilePreviewFormat } from "../domain/files";
import { createAttachmentReadSession } from "./attachmentReadSession";

export default function useMessageAttachment(scope: string) {
  const [opening, setOpening] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; blob: Blob } | null>(null);
  const [error, setError] = useState("");
  const [request] = useState(createAttachmentReadSession);
  useEffect(() => {
    request.invalidate();
    setOpening(null); setPreview(null); setError("");
    return () => request.invalidate();
  }, [scope, request]);
  const open = useCallback(async (file: MessageAttachment, download = false) => {
    const id = request.begin();
    if (id === null) return;
    setOpening(file.id); setError("");
    try {
      const stored = await messageAttachmentRepository.read(scope, file.id);
      if (!request.isCurrent(id)) return;
      if (download || !getFilePreviewFormat(stored)) downloadBlob(stored.blob, stored.name);
      else setPreview({ name: stored.name, blob: stored.blob });
    } catch (failure) {
      if (request.isCurrent(id)) {
        console.error("Не удалось открыть вложение переписки:", failure);
        setError("Файл недоступен. Он хранится только в браузере, в котором был прикреплён.");
      }
    } finally {
      if (request.finish(id)) setOpening(null);
    }
  }, [scope, request]);
  return { opening, preview, error, open, closePreview: () => setPreview(null), clearError: () => setError("") };
}
