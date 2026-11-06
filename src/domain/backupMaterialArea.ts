export type BackupMaterialAreaKind = "user" | "subject" | "group";
export type BackupMaterialAreaSource =
  | { status: "matched" | "unavailable-catalog" | "unresolved-reference"; kind: BackupMaterialAreaKind }
  | { status: "ambiguous-area"; kind: "group" }
  | { status: "legacy" | "unsupported-scope" | "unavailable-record" };
export interface BackupMaterialAreaComparison {
  version: 1;
  archive: BackupMaterialAreaSource;
  browser: BackupMaterialAreaSource;
  relation: "same" | "different" | "unresolved";
}

export function assertBackupMaterialAreaComparison(value: BackupMaterialAreaComparison) {
  const fail = (): never => { throw new Error("Сведения о связях областей материала неполны или несовместимы. Проверьте архив заново; неполный отчёт не скачан."); };
  if (!value || Object.keys(value).some(key => !["version", "archive", "browser", "relation"].includes(key)) || value.version !== 1) fail();
  for (const source of [value.archive, value.browser]) {
    if (!source || Object.keys(source).some(key => !["status", "kind"].includes(key))) fail();
    if (["matched", "unavailable-catalog", "unresolved-reference"].includes(source.status)) {
      if (!("kind" in source) || !["user", "subject", "group"].includes(source.kind)) fail();
    } else if (source.status === "ambiguous-area") { if (source.kind !== "group") fail(); }
    else if (!["legacy", "unsupported-scope", "unavailable-record"].includes(source.status) || "kind" in source) fail();
  }
  const matched = value.archive.status === "matched" && value.browser.status === "matched";
  if (matched ? !["same", "different"].includes(value.relation) : value.relation !== "unresolved") fail();
  if (value.relation === "same" && "kind" in value.archive && "kind" in value.browser && value.archive.kind !== value.browser.kind) fail();
}
