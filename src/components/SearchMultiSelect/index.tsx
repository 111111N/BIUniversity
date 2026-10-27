import { useId, useMemo, useState } from "react";
import Select from "react-select";
import { createDropdownStyles, type DropdownOption } from "../Dropdown";
import SearchField from "../SearchField";
import fieldStyles from "../Dropdown/index.module.scss";
import styles from "./index.module.scss";
import { matchesSearchOption } from "../../domain/search";
import { addGroupSelection, getGroupSelectionView, SELECTED_GROUPS_PER_PAGE } from "./selection";

interface Props {
  label: string;
  options: DropdownOption[];
  value: string[];
  onChange(value: string[]): void;
  disabled?: boolean;
  knownOptions?: DropdownOption[];
}

const selectStyles = createDropdownStyles<true>("compact");

const SearchMultiSelect = ({ label, options, value, onChange, disabled = false, knownOptions = [] }: Props) => {
  const inputId = useId();
  const summaryId = useId();
  const [selectedQuery, setSelectedQuery] = useState("");
  const [availableQuery, setAvailableQuery] = useState("");
  const [page, setPage] = useState(1);
  const query = value.length > SELECTED_GROUPS_PER_PAGE ? selectedQuery : "";
  const view = useMemo(() => getGroupSelectionView(options, value, knownOptions, availableQuery, query, page), [options, value, knownOptions, availableQuery, query, page]);

  return <div className={styles.picker}>
    <div className={fieldStyles.field}>
      <label htmlFor={inputId}>{label}</label>
      <Select<DropdownOption, true>
        inputId={inputId}
        aria-label={label}
        aria-describedby={summaryId}
        options={options}
        filterOption={(option, input) => matchesSearchOption(option.data, input)}
        value={view.selected}
        inputValue={availableQuery}
        onInputChange={(next, meta) => { if (meta.action === "input-change") setAvailableQuery(next); }}
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
      <span id={summaryId} role="status">Выбрано групп: {view.selected.length}</span>
      <div className={styles.actions}>
        <button type="button" disabled={disabled || !view.additions.length} onClick={() => onChange(addGroupSelection(value, view.additions))}>{availableQuery.trim() ? "Добавить найденные" : "Выбрать все доступные"} ({view.additions.length})</button>
        <button type="button" disabled={disabled || !value.length} onClick={() => onChange([])}>Снять все ({view.selected.length})</button>
      </div>
    </div>
    {value.length > SELECTED_GROUPS_PER_PAGE && <fieldset className={styles.searchBox} disabled={disabled}><SearchField label="Поиск среди выбранных групп" placeholder="" value={selectedQuery} onChange={(query) => { setSelectedQuery(query); setPage(1); }} /></fieldset>}
    {view.unavailable > 0 && <p className={styles.empty}>Недоступных для нового выбора: {view.unavailable}. Они остаются в выборе до явного снятия.</p>}
    {value.length > 0 ? <ul className={styles.selected} aria-label="Выбранные группы">
      {view.shown.map((option) => <li key={option.value}>
        <span>{option.label}</span>
        <button type="button" aria-label={`Убрать группу ${option.label}`} disabled={disabled} onClick={() => onChange(value.filter((id) => id !== option.value))}><span aria-hidden="true">×</span></button>
      </li>)}
      {!view.shown.length && <li className={styles.empty}>Выбранная группа не найдена.</li>}
    </ul> : <p className={styles.empty}>Найдите группы и добавьте их в назначение.</p>}
    {view.filteredCount > SELECTED_GROUPS_PER_PAGE && <nav className={styles.pagination} aria-label="Страницы выбранных групп"><span>{view.start + 1}–{view.start + view.shown.length} из {view.filteredCount}</span><button type="button" disabled={disabled || view.page === 1} onClick={() => setPage(view.page - 1)}>Назад</button><button type="button" disabled={disabled || view.page === view.pages} onClick={() => setPage(view.page + 1)}>Далее</button></nav>}
  </div>;
};

export default SearchMultiSelect;
