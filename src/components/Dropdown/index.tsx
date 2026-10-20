import { useId } from "react";
import Select, { type SingleValue, type StylesConfig } from "react-select";
import styles from "./index.module.scss";

export interface DropdownOption { value: string; label: string }
export type DropdownVariant = "main" | "compact";

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
}

const createDropdownStyles = (variant: DropdownVariant): StylesConfig<DropdownOption, false> => {
  const main = variant === "main";
  const borderWidth = main ? 3 : 1;
  return {
    control: (base, state) => ({
      ...base,
      minHeight: main ? 46 : 36,
      padding: main ? "2px 8px" : "0 6px",
      borderWidth,
      borderTopWidth: main ? 0 : borderWidth,
      borderStyle: "solid",
      borderColor: state.isFocused && !state.menuIsOpen ? "var(--dropdown-accent)" : "var(--dropdown-border)",
      // The lower edge joins the menu. Keep this neutral even while focused/hovered.
      borderBottomColor: state.menuIsOpen ? "var(--dropdown-border)" : state.isFocused ? "var(--dropdown-accent)" : "var(--dropdown-border)",
      borderRadius: main ? "17px 17px 0 0" : state.menuIsOpen ? "8px 8px 0 0" : "8px",
      background: state.menuIsOpen || !state.isFocused ? "var(--dropdown-panel)" : "var(--dropdown-active)",
      boxShadow: "none",
      cursor: state.isDisabled ? "not-allowed" : "pointer",
      transition: "border-color .18s ease, background .18s ease",
      opacity: state.isDisabled ? .55 : 1,
      ":hover": {
        borderColor: state.menuIsOpen || state.isDisabled ? "var(--dropdown-border)" : "var(--dropdown-accent)",
        borderBottomColor: state.menuIsOpen || state.isDisabled ? "var(--dropdown-border)" : "var(--dropdown-accent)",
        background: state.menuIsOpen || state.isDisabled ? "var(--dropdown-panel)" : "var(--dropdown-active)",
      },
    }),
    valueContainer: (base) => ({ ...base, minWidth: 0, padding: main ? "2px 6px" : "0 4px" }),
    singleValue: (base) => ({ ...base, color: "var(--dropdown-text)", fontSize: main ? 13 : 12, lineHeight: 1.4 }),
    placeholder: (base) => ({ ...base, color: "var(--dropdown-muted)", fontSize: main ? 13 : 12, lineHeight: 1.4 }),
    menuPortal: (base) => ({ ...base, zIndex: 3500 }),
    menu: (base, state) => ({
      ...base,
      marginTop: 0,
      marginBottom: state.placement === "top" ? 6 : 0,
      overflow: "hidden",
      borderRight: `${borderWidth}px solid var(--dropdown-border)`,
      borderTop: state.placement === "top" ? `${borderWidth}px solid var(--dropdown-border)` : 0,
      borderBottom: `${borderWidth}px solid var(--dropdown-border)`,
      borderLeft: `${borderWidth}px solid var(--dropdown-border)`,
      borderRadius: state.placement === "top" ? "8px" : "0 0 8px 8px",
      background: "var(--dropdown-panel)",
      boxShadow: "0 18px 35px var(--dropdown-shadow)",
    }),
    menuList: (base, state) => ({ ...base, padding: main ? 6 : 4, maxHeight: Math.min(260, state.maxHeight), scrollbarWidth: "thin", scrollbarColor: "var(--dropdown-border) var(--dropdown-panel)" }),
    option: (base, state) => ({
      ...base,
      marginBottom: main ? 3 : 2,
      padding: main ? "9px 11px" : "7px 9px",
      border: `${main ? 2 : 1}px solid ${state.isSelected ? "var(--dropdown-panel)" : state.isFocused ? "var(--dropdown-accent)" : "transparent"}`,
      borderRadius: main ? 9 : 6,
      background: state.isSelected ? main ? "var(--dropdown-gradient)" : "var(--dropdown-active)" : state.isFocused ? "var(--dropdown-hover)" : "var(--dropdown-base)",
      color: state.isSelected ? main ? "var(--dropdown-on-accent)" : "var(--dropdown-accent)" : state.isFocused ? "var(--dropdown-text)" : "var(--dropdown-muted)",
      fontSize: main ? 13 : 12,
      lineHeight: 1.4,
      cursor: "pointer",
      ":active": { background: "var(--dropdown-active)", color: "var(--dropdown-text)" },
    }),
    dropdownIndicator: (base, state) => ({
      ...base,
      padding: main ? 8 : 5,
      color: state.isFocused ? "var(--dropdown-accent)" : "var(--dropdown-muted)",
      transform: state.selectProps.menuIsOpen ? "rotate(180deg)" : undefined,
      transition: "transform .15s ease",
      ":hover": { color: "var(--dropdown-accent)" },
    }),
    indicatorSeparator: () => ({ display: "none" }),
  };
};

// Kept as the default exported style configuration for existing consumers.
export const dropdownStyles = createDropdownStyles("compact");
const mainDropdownStyles = createDropdownStyles("main");

const Dropdown = ({ label, value, options, onChange, disabled = false, placeholder = "Выберите значение", className, hideLabel = false, variant = "compact" }: DropdownProps) => {
  const inputId = useId();
  return <div className={`${styles.field} ${className ?? ""}`}>
    <label className={hideLabel ? styles.visuallyHidden : undefined} htmlFor={inputId}>{label}</label>
    <Select<DropdownOption, false>
      inputId={inputId}
      aria-label={label}
      value={options.find((option) => option.value === value) ?? null}
      options={options}
      onChange={(option: SingleValue<DropdownOption>) => option && onChange(option.value)}
      styles={variant === "main" ? mainDropdownStyles : dropdownStyles}
      isDisabled={disabled}
      isSearchable={false}
      placeholder={placeholder}
      noOptionsMessage={() => "Нет доступных вариантов"}
      maxMenuHeight={260}
      minMenuHeight={80}
      menuPosition="fixed"
      menuPortalTarget={typeof document === "undefined" ? undefined : document.body}
    />
  </div>;
};

export default Dropdown;
