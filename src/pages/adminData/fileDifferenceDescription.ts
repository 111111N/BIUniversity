import type { BackupFileDifferenceDetails, BackupFileField } from "../../domain/backupFileDifference";

const FIELDS: Record<BackupFileField, string> = { name: "имя", type: "тип файла", size: "размер", createdAt: "дата создания", scope: "область хранения", category: "категория", uploadedBy: "сохранённое имя загрузившего", description: "описание", pinned: "закрепление", fileName: "имя сохранённого File", lastModified: "дата изменения File", content: "содержимое" };
const REASONS = { "unsupported-store": "схема хранилища не поддерживается", "invalid-record": "запись или метаданные файла не прошли проверку", "unknown-fields": "дополнительные поля не проверены" };
const SOURCES = { archive: "Архив", browser: "Этот браузер" };
export function describeBackupFileDifference(detail?: BackupFileDifferenceDetails) {
  if (!detail) return "";
  const fields = detail.fields.length ? `Изменены: ${detail.fields.map(field => FIELDS[field]).join(", ")}.` : "";
  const status = detail.status === "uncompared" ? "Различия полей файла не разобраны." : detail.status === "partial" ? "Разбор различий файла неполный." : "";
  const issues = detail.issues.map(issue => `${SOURCES[issue.source]}: ${REASONS[issue.reason]}.`).join(" ");
  return [fields, status, issues, "Принадлежность и права на файл не подтверждены; выбор версии пока недоступен."].filter(Boolean).join(" ");
}
