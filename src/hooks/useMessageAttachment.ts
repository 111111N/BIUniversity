import { useCallback, useEffect, useRef, useState } from "react";
import { messageAttachmentRepository } from "../data/messageAttachmentRepository";
import type { MessageAttachment } from "../data/messageStore";
import { downloadBlob } from "../domain/fileDownload";
import { getFilePreviewFormat } from "../domain/files";

export default function useMessageAttachment(scope: string) {
  const [opening, setOpening] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; blob: Blob } | null>(null);
  const [error, setError] = useState("");
  const request = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    request.current++; busy.current = false;
    setOpening(null); setPreview(null); setError("");
    return () => { request.current++; busy.current = false; };
  }, [scope]);
  const open = useCallback(async (file: MessageAttachment, download = false) => {
    if (busy.current) return;
    busy.current = true;
    const id = ++request.current;
    setOpening(file.id); setError("");
    try {
      const stored = await messageAttachmentRepository.read(scope, file.id);
      if (id !== request.current) return;
      if (download || !getFilePreviewFormat(stored)) downloadBlob(stored.blob, stored.name);
      else setPreview({ name: stored.name, blob: stored.blob });
    } catch {
      if (id === request.current) setError("Файл недоступен. Он хранится только в браузере, в котором был прикреплён.");
    } finally {
      if (id === request.current) { busy.current = false; setOpening(null); }
    }
  }, [scope]);
  return { opening, preview, error, open, closePreview: () => setPreview(null), clearError: () => setError("") };
}
