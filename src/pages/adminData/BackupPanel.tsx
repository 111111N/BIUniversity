import type { BackupReceipt } from "../../data/localBackupService";
import styles from "./index.module.scss";

export interface BackupPanelProps {
  busy: boolean; progress: string; error: string; result: BackupReceipt | null; unavailable: boolean;
  onExport(): void; onCancel(): void;
}
const size = (bytes: number) => `${(bytes / (1024 * 1024)).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МиБ`;

export default function BackupPanel({ busy, progress, error, result, unavailable, onExport, onCancel }: BackupPanelProps) {
  return <div className={styles.section}>
    <section className={styles.card} aria-labelledby="backup-title">
      <div className={styles.heading}><h1 id="backup-title">Резервная копия</h1><span>Этот браузер</span></div>
      <p className={styles.intro}>Скачайте сохранённые данные портала и вложения одним файлом JSON.</p>
      <ul className={styles.contents}>
        <li><strong>Учебные данные</strong><span>Учётные записи, номера зачёток, группы, дисциплины, расписание, журналы, задания и история изменений.</span></li>
        <li><strong>Личные данные всех пользователей</strong><span>Сообщения, планировщики, уведомления, материалы и вложения. Связи и владельцы сохраняются.</span></li>
        <li><strong>Настройки этого браузера</strong><span>Тема, выбранная демонстрационная учётная запись и виды списков.</span></li>
      </ul>
      <div className={styles.notice}><strong>В файле есть личные данные и переписка.</strong><p>Архив не зашифрован. Храните его в защищённом месте и передавайте только тем, кому разрешён доступ ко всем данным портала.</p></div>
      <p className={styles.hint}>Завершите редактирование в других вкладках перед выгрузкой. Каждое файловое хранилище читается отдельно; одновременные изменения между хранилищами не объединяются в общий моментальный снимок.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={busy || unavailable} onClick={onExport}>{busy ? "Готовим архив…" : "Скачать резервную копию"}</button>
        {busy && <button type="button" onClick={onCancel}>Отменить</button>}
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" className={styles.status}>
        {busy ? progress : result && <><strong>Файл передан браузеру для скачивания.</strong><span>Проверьте папку загрузок: данные — {result.summary.storageEntries}, файловые записи — {result.summary.databaseRecords}, вложения — {result.summary.files} ({size(result.summary.binaryBytes)}).</span><span className={styles.filename}>{result.filename}</span></>}
      </div>
      {unavailable && <p className={styles.error} role="alert">Выгрузка доступна только действующему настройщику. Проверьте учётную запись и повторите чтение данных.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
    <details className={styles.details}><summary>Ограничения и содержимое файла</summary><div>
      <p>В архив входят сохранённые ключи портала и три файловых хранилища этого адреса. Отсутствующие хранилища отмечаются явно; ошибка чтения останавливает выгрузку целиком.</p>
      <p>Не входят временные черновики, несохранённые формы, встроенные примеры до их сохранения, данные других браузеров, устройств и адресов сайта.</p>
      <p>Исходные версии документов, идентификаторы и владельцы сохраняются без миграций. Вложения записываются в base64 вместе с типом файла и метаданными. Экспорт не изменяет исходные данные.</p>
      <p>Лимиты: 64 МиБ вложений, 16 МиБ текстовых данных, 25 000 файловых записей и 128 МиБ итогового JSON. При превышении лимита частичный файл не скачивается.</p>
      <p>Восстановление из файла пока не реализовано. Архив не синхронизирует устройства и не заменяет серверное резервное копирование. Личная выгрузка отдельного пользователя будет отдельной функцией.</p>
    </div></details>
  </div>;
}
