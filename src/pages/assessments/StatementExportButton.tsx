import { useLayoutEffect, useRef, useState } from "react";
import { assessmentService } from "../../data/assessmentStore";
import type { AssessmentSnapshot } from "../../domain/assessmentTypes";
import { downloadBlob } from "../../domain/fileDownload";
import { assessmentContext } from "./model";
import styles from "./index.module.scss";

interface Props { actorId: string; assessmentId: string; attemptId: string; snapshot: AssessmentSnapshot; blocked: boolean; version?: number }

export default function StatementExportButton({ actorId, assessmentId, attemptId, snapshot, blocked, version }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const lifecycle = useRef({ active: false, generation: 0 });
  useLayoutEffect(() => {
    const current = lifecycle.current;
    current.active = true; current.generation += 1;
    return () => { current.active = false; current.generation += 1; };
  }, [actorId, assessmentId, attemptId, snapshot, blocked, version]);
  const download = async () => {
    if (pending.current || blocked) return;
    pending.current = true; setBusy(true); setError("");
    const generation = lifecycle.current.generation;
    try {
      const file = await assessmentService.exportStatement({ ...assessmentContext(snapshot, actorId), assessmentId, attemptId, ...(version === undefined ? {} : { version }) });
      // После смены учётки или обновления источника отложенный ответ уже не относится к открытой ведомости.
      if (!lifecycle.current.active || lifecycle.current.generation !== generation) return;
      downloadBlob(new Blob([file.csv], { type: "text/csv;charset=utf-8" }), file.filename);
    } catch (failure) {
      console.error("Не удалось скачать ведомость:", failure);
      if (lifecycle.current.active && lifecycle.current.generation === generation) setError(failure instanceof Error ? failure.message : "Не удалось скачать ведомость. Повторите попытку.");
    } finally {
      pending.current = false;
      if (lifecycle.current.active) setBusy(false);
    }
  };
  return <><button type="button" disabled={blocked || busy} onClick={() => void download()}>{busy ? "Готовим CSV…" : "Скачать CSV"}</button>{error && <p className={styles.error} role="alert">{error}</p>}</>;
}
