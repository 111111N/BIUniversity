import { useId, useMemo, useState } from "react";
import Select from "react-select";
import { createDropdownStyles, type DropdownOption } from "../Dropdown";
import SearchField from "../SearchField";
import fieldStyles from "../Dropdown/index.module.scss";
import styles from "./index.module.scss";

interface Props {
  label: string;
  options: DropdownOption[];
  value: string[];
  onChange(value: string[]): void;
  disabled?: boolean;
}

const selectStyles = createDropdownStyles<true>("compact");

const SearchMultiSelect = ({ label, options, value, onChange, disabled = false }: Props) => {
  const inputId = useId();
  const summaryId = useId();
  const [selectedQuery, setSelectedQuery] = useState("");
  const byId = useMemo(() => new Map(options.map((option) => [option.value, option])), [options]);
  const selected = useMemo(() => value.map((id) => byId.get(id) ?? { value: id, label: id }), [byId, value]);
  const query = value.length > 10 ? selectedQuery.trim().toLocaleLowerCase("ru") : "";
  const shown = selected.filter((option) => option.label.toLocaleLowerCase("ru").includes(query));
  const allSelected = options.every((option) => value.includes(option.value));

  return <div className={styles.picker}>
    <div className={fieldStyles.field}>
      <label htmlFor={inputId}>{label}</label>
      <Select<DropdownOption, true>
        inputId={inputId}
        aria-label={label}
        aria-describedby={summaryId}
        options={options}
        value={selected}
        onChange={(next) => onChange(next.map((option) => option.value))}
        isMulti
        isSearchable
        isClearable={false}
        isDisabled={disabled}
        controlShouldRenderValue={false}
        hideSelectedOptions
        closeMenuOnSelect={false}
        backspaceRemovesValue={false}
        styles={selectStyles}
        placeholder=""
        noOptionsMessage={({ inputValue }) => !options.length ? "Нет доступных групп" : inputValue ? "Группы не найдены или уже выбраны" : "Все доступные группы уже выбраны"}
        screenReaderStatus={({ count }) => `Доступно групп: ${count}`}
        maxMenuHeight={260}
        minMenuHeight={80}
        menuPosition="fixed"
        menuPortalTarget={typeof document === "undefined" ? undefined : document.body}
      />
    </div>
    <div className={styles.summary}>
      <span id={summaryId} role="status">Выбрано: {value.length}</span>
      <div className={styles.actions}>
        <button type="button" disabled={disabled || !options.length || allSelected} onClick={() => onChange(options.map((option) => option.value))}>Выбрать все</button>
        <button type="button" disabled={disabled || !value.length} onClick={() => onChange([])}>Снять выбор</button>
      </div>
    </div>
    {value.length > 10 && <SearchField label="Поиск среди выбранных групп" placeholder="" value={selectedQuery} onChange={setSelectedQuery} />}
    {value.length > 0 ? <ul className={styles.selected} aria-label="Выбранные группы">
      {shown.map((option) => <li key={option.value}>
        <span>{option.label}</span>
        <button type="button" aria-label={`Убрать группу ${option.label}`} disabled={disabled} onClick={() => onChange(value.filter((id) => id !== option.value))}><span aria-hidden="true">×</span></button>
      </li>)}
      {!shown.length && <li className={styles.empty}>Выбранная группа не найдена.</li>}
    </ul> : <p className={styles.empty}>Найдите группы и добавьте их в назначение.</p>}
  </div>;
};

export default SearchMultiSelect;
