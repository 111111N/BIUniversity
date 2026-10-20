export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
};

export const getAttachmentError = (file: Pick<File, "size">) =>
  file.size > MAX_ATTACHMENT_SIZE ? "Размер файла не должен превышать 25 МБ." : "";

const RASTER_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif" };
export interface FilePreviewFormat { kind: "image" | "pdf" | "text"; mime: string }

/** Only inert formats are previewed. HTML, SVG and office documents remain download-only. */
export const getFilePreviewFormat = (file: { name: string; type: string }): FilePreviewFormat | null => {
  const dot = file.name.lastIndexOf(".");
  const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  if (["html", "htm", "svg", "svgz", "xml", "xhtml"].includes(extension)) return null;
  const mime = file.type.split(";")[0].trim().toLowerCase();
  if (Object.values(RASTER_TYPES).includes(mime)) return { kind: "image", mime };
  if (!mime && Object.hasOwn(RASTER_TYPES, extension)) return { kind: "image", mime: RASTER_TYPES[extension] };
  if (mime === "application/pdf" || (!mime && extension === "pdf")) return { kind: "pdf", mime: "application/pdf" };
  if (["text/plain", "text/csv", "text/markdown"].includes(mime) || (!mime && ["txt", "csv", "md"].includes(extension))) return { kind: "text", mime: "text/plain" };
  return null;
};
