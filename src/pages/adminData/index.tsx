import { useEffect, useRef, useState } from "react";
import { useRole } from "../../components/RoleContext";
import { isAccountActive } from "../../domain/accounts";
import { downloadBlob } from "../../domain/fileDownload";
import { assertAdministrativeBackupAccess, localBackupService, type BackupReceipt } from "../../data/localBackupService";
import BackupPanel from "./BackupPanel";
import InspectionPanel from "./InspectionPanel";
import { backupInspectionService, type BackupInspection } from "../../data/localBackupInspectionService";
import { prepareBackupInspectionReport } from "../../data/localBackupInspectionReport";
import Tabs from "../../components/Tabs";
import styles from "./index.module.scss";

export default function AdminDataPage() {
  const { currentUser, accounts, accountError } = useRole();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<BackupReceipt | null>(null);
  const [view, setView] = useState("export");
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<BackupInspection | null>(null);
  const [reportMessage, setReportMessage] = useState("");
  const [reportError, setReportError] = useState("");
  const operation = useRef<AbortController | null>(null);
  const actor = accounts.find((account) => account.id === currentUser.id);
  const unavailable = Boolean(accountError) || !actor || actor.role !== "configurator" || !isAccountActive(actor);
  const currentInspection = !unavailable && inspection?.actor.id === actor?.id && inspection?.actor.revision === actor?.revision ? inspection : null;
  useEffect(() => () => { operation.current?.abort(); operation.current = null; }, []);

  const exportData = async () => {
    if (operation.current || unavailable || !actor) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true); setError(""); setResult(null); setProgress("Проверяем доступ…");
    const command = { actorId: actor.id, actorRevision: actor.revision };
    try {
      const next = await localBackupService.exportAdministrative({ ...command, signal: controller.signal,
        onProgress: (message) => { if (!controller.signal.aborted) setProgress(message); },
      });
      if (controller.signal.aborted) return;
      assertAdministrativeBackupAccess(command);
      downloadBlob(next.blob, next.filename);
      setResult({ filename: next.filename, summary: next.summary, completedAt: next.completedAt });
    } catch (reason) {
      if (controller.signal.aborted) return;
      console.error("Не удалось подготовить или скачать резервную копию:", reason);
      setError(reason instanceof Error ? reason.message : "Не удалось скачать архив. Проверьте доступ к хранилищам и повторите попытку.");
    } finally {
      if (operation.current === controller) { operation.current = null; setBusy(false); setProgress(""); }
    }
  };
  const cancel = () => { operation.current?.abort(); operation.current = null; setBusy(false); setProgress(""); setError(""); };
  const inspect = async () => {
    if (operation.current || unavailable || !actor || !file) return;
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError(""); setInspection(null); setReportMessage(""); setReportError(""); setProgress("Проверяем доступ…");
    try {
      const next = await backupInspectionService.inspect({ actorId: actor.id, actorRevision: actor.revision, file, signal: controller.signal,
        onProgress: (message) => { if (!controller.signal.aborted) setProgress(message); },
      });
      if (!controller.signal.aborted) setInspection(next);
    } catch (reason) {
      if (controller.signal.aborted) return;
      console.error("Не удалось открыть предпросмотр резервной копии:", reason);
      setError(reason instanceof Error ? reason.message : "Не удалось проверить файл. Исходные данные не изменены.");
    } finally { if (operation.current === controller) { operation.current = null; setBusy(false); setProgress(""); } }
  };
  const downloadReport = () => {
    if (operation.current || unavailable || !actor || !currentInspection) return;
    setReportError(""); setReportMessage("");
    try {
      const report = prepareBackupInspectionReport({ actorId: actor.id, actorRevision: actor.revision, inspection: currentInspection });
      downloadBlob(report.blob, report.filename);
      setReportMessage("Отчёт передан браузеру для скачивания. Проверьте папку загрузок.");
    } catch (reason) {
      console.error("Не удалось скачать отчёт проверки резервной копии:", reason);
      setReportError(reason instanceof Error ? reason.message : "Не удалось скачать отчёт. Повторите попытку.");
    }
  };
  return <div className={`pageContainer ${styles.page}`}>
    <Tabs ariaLabel="Действия с резервной копией" value={view} items={[{ value: "export", label: "Скачать" }, { value: "inspect", label: "Проверить файл" }]} onChange={(next) => { if (next === view) return; cancel(); setView(next); }} />
    <div hidden={view !== "export"} role="tabpanel" aria-label="Скачать резервную копию"><BackupPanel busy={busy} progress={progress} error={error} result={result} unavailable={unavailable} onExport={() => void exportData()} onCancel={cancel} /></div>
    <div hidden={view !== "inspect"} role="tabpanel" aria-label="Проверить файл"><InspectionPanel file={file} busy={busy} progress={progress} error={error} result={currentInspection} unavailable={unavailable} reportMessage={reportMessage} reportError={reportError} onReport={downloadReport} onFile={(next) => { setFile(next); setInspection(null); setError(""); setReportMessage(""); setReportError(""); }} onInspect={() => void inspect()} onCancel={cancel} /></div>
  </div>;
}
