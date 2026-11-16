import { useId } from "react";
import type { MenuPlacement, SingleValue } from "react-select";
import DropdownSelect from "./Select";
export { createDropdownStyles, dropdownStyles } from "./styles";
import styles from "./index.module.scss";
import { matchesSearchOption } from "../../domain/search";

export interface DropdownOption { value: string; label: string; searchText?: string }
// main и compact сохранены для совместимости; новые вызовы используют navigation и field.
export type DropdownVariant = "navigation" | "field" | "main" | "compact";

interface DropdownProps {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange(value: string): void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  hideLabel?: boolean;
  variant?: DropdownVariant;
  searchable?: boolean;
  menuPlacement?: MenuPlacement;
  error?: string;
}

const Dropdown = ({ label, value, options, onChange, disabled = false, placeholder, className, hideLabel = false, variant = "field", searchable = false, menuPlacement = "auto", error }: DropdownProps) => {
  const inputId = useId();
  return <div className={`${styles.field} ${className ?? ""}`}>
    <label className={hideLabel ? styles.visuallyHidden : undefined} htmlFor={inputId}>{label}</label>
    <DropdownSelect
      inputId={inputId}
      aria-label={label}
      aria-invalid={error ? true : undefined}
      aria-errormessage={error ? `${inputId}-error` : undefined}
      value={options.find((option) => option.value === value) ?? null}
      options={options}
      filterOption={(option, query) => matchesSearchOption(option.data, query)}
      onChange={(option: SingleValue<DropdownOption>) => option && onChange(option.value)}
      variant={variant}
      isDisabled={disabled}
      isSearchable={searchable}
      placeholder={placeholder ?? (searchable ? "" : "Выберите значение")}
      noOptionsMessage={({ inputValue }) => inputValue ? "Ничего не найдено" : "Нет доступных вариантов"}
      screenReaderStatus={({ count }) => `Найдено вариантов: ${count}`}
      maxMenuHeight={260}
      minMenuHeight={80}
      menuPlacement={menuPlacement}
      menuPosition="fixed"
      menuPortalTarget={typeof document === "undefined" ? undefined : document.body}
    />
    {error && <span className={styles.error} id={`${inputId}-error`}>{error}</span>}
  </div>;
};

export default Dropdown;
