import Dropdown from "../../components/Dropdown";
import Checkbox from "../../components/Checkbox";
import type { ImportTable, StudentImportMapping } from "../../domain/importTable";
import { getImportColumns, getImportColumnExamples, IMPORT_FIELDS } from "./mappingPresentation";
import styles from "./ColumnMapping.module.scss";

interface Props { table: ImportTable; mapping: StudentImportMapping; hasHeader: boolean; disabled: boolean; onMappingChange(mapping: StudentImportMapping): void; onHeaderChange(value: boolean): void }
export default function ColumnMapping({ table, mapping, hasHeader, disabled, onMappingChange, onHeaderChange }: Props) {
  const options = getImportColumns(table, hasHeader);
  return <section className={styles.mapping} aria-label="Сопоставление столбцов">
    <div><h3>Какие данные в каждом столбце</h3><p>Сверьте примеры из первых двух строк. ФИО и логин обязательны.</p></div>
    <Checkbox label="Первая строка содержит названия столбцов" checked={hasHeader} disabled={disabled} onChange={onHeaderChange} />
    <div className={styles.fields}>{IMPORT_FIELDS.map((field) => {
      const examples = getImportColumnExamples(table, mapping[field.value], hasHeader);
      return <div className={styles.column} key={field.value}><Dropdown searchable label={`${field.label}${field.required ? " · обязательно" : ""}`} value={String(mapping[field.value])} options={[{ value: "-1", label: field.required ? "Выберите столбец" : "Не использовать" }, ...options]} disabled={disabled} placeholder="" onChange={(value) => onMappingChange({ ...mapping, [field.value]: Number(value) })} />{examples.length > 0 ? <ul>{examples.map((row) => <li key={row.line}><span>Строка {row.line}</span><strong title={row.value}>{row.value || "Пусто"}</strong></li>)}</ul> : <p>{mapping[field.value] < 0 ? field.required ? "Выберите столбец с этими данными." : field.value === "email" ? "Почта не будет заполнена при создании." : "Используется общая настройка, если она задана." : "В этом столбце пока нет данных."}</p>}</div>;
    })}</div>
  </section>;
}
