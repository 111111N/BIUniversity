import type { StylesConfig } from "react-select";
import type { DropdownOption, DropdownVariant } from ".";

export const createDropdownStyles = <IsMulti extends boolean = false,>(variant: DropdownVariant, placement: "top" | "bottom" = "bottom"): StylesConfig<DropdownOption, IsMulti> => {
  const main = variant === "main";
  const borderWidth = main ? "var(--ui-frame-border-width)" : "1px";
  const interactionBorder = main ? "var(--dropdown-accent)" : "var(--dropdown-control-border)";
  const controlBackground = main ? "var(--ui-panel)" : "var(--dropdown-control)";
  return {
    control: (base, state) => ({
      ...base,
      minHeight: "var(--dropdown-control-height, 46px)",
      padding: main ? "2px 8px" : "0 6px",
      borderWidth,
      borderTopWidth: main ? 0 : borderWidth,
      borderStyle: "solid",
      borderColor: state.selectProps["aria-invalid"] ? "var(--ui-danger-text)" : state.isFocused || state.menuIsOpen ? interactionBorder : "var(--dropdown-control-border)",
      // Скрывается только граница, непосредственно примыкающая к открытому меню.
      borderTopColor: state.selectProps["aria-invalid"] ? "var(--ui-danger-text)" : state.menuIsOpen && placement === "top" ? controlBackground : state.isFocused || state.menuIsOpen ? interactionBorder : "var(--dropdown-control-border)",
      borderBottomColor: state.selectProps["aria-invalid"] ? "var(--ui-danger-text)" : state.menuIsOpen && placement === "bottom" ? controlBackground : state.isFocused || state.menuIsOpen ? interactionBorder : "var(--dropdown-control-border)",
      borderRadius: state.menuIsOpen && placement === "top" ? main ? "0 0 17px 17px" : "0 0 8px 8px" : main ? "var(--ui-picker-main-radius)" : state.menuIsOpen ? "8px 8px 0 0" : "8px",
      background: controlBackground,
      boxShadow: state.isFocused && state.selectProps["aria-invalid"] ? "0 0 0 2px var(--ui-danger-text)" : "none",
      cursor: state.isDisabled ? "not-allowed" : state.selectProps.isSearchable ? "text" : "pointer",
      transition: "border-color .18s ease, background .18s ease",
      opacity: 1,
      ":hover": {
        borderColor: state.selectProps["aria-invalid"] ? "var(--ui-danger-text)" : state.isDisabled ? "var(--dropdown-control-border)" : interactionBorder,
        borderTopColor: state.selectProps["aria-invalid"] ? "var(--ui-danger-text)" : state.menuIsOpen && placement === "top" ? controlBackground : state.isDisabled ? "var(--dropdown-control-border)" : interactionBorder,
        borderBottomColor: state.selectProps["aria-invalid"] ? "var(--ui-danger-text)" : state.menuIsOpen && placement === "bottom" ? controlBackground : state.isDisabled ? "var(--dropdown-control-border)" : interactionBorder,
        background: controlBackground,
      },
    }),
    valueContainer: (base) => ({ ...base, minWidth: 0, padding: main ? "2px 6px" : "0 4px" }),
    singleValue: (base, state) => ({ ...base, color: state.isDisabled ? "var(--dropdown-muted)" : "var(--dropdown-text)", fontSize: main ? 13 : 12, fontWeight: 600, lineHeight: 1.4 }),
    placeholder: (base) => ({ ...base, color: "var(--dropdown-muted)", fontSize: main ? 13 : 12, lineHeight: 1.4 }),
    input: (base) => ({ ...base, color: "var(--dropdown-text)", fontSize: main ? 13 : 12 }),
    menuPortal: (base) => ({ ...base, zIndex: 3500 }),
    menu: (base, state) => ({
      ...base,
      marginTop: 0,
      marginBottom: 0,
      overflow: "hidden",
      borderRight: `${borderWidth} solid var(--dropdown-border)`,
      borderTop: state.placement === "top" ? `${borderWidth} solid var(--dropdown-border)` : 0,
      borderBottom: state.placement === "top" ? 0 : `${borderWidth} solid var(--dropdown-border)`,
      borderLeft: `${borderWidth} solid var(--dropdown-border)`,
      borderRadius: state.placement === "top" ? "8px 8px 0 0" : "0 0 8px 8px",
      background: "var(--dropdown-panel)",
      boxShadow: "0 18px 35px var(--dropdown-shadow)",
    }),
    menuList: (base, state) => ({ ...base, padding: main ? 6 : 4, maxHeight: Math.min(260, state.maxHeight), scrollbarWidth: "thin", scrollbarColor: "var(--dropdown-border) var(--dropdown-panel)" }),
    noOptionsMessage: (base) => ({ ...base, color: "var(--dropdown-muted)", fontSize: 13, lineHeight: 1.5 }),
    option: (base, state) => ({
      ...base,
      minHeight: state.selectProps.isSearchable ? 44 : undefined,
      display: "flex",
      alignItems: "center",
      overflowWrap: "anywhere",
      marginBottom: main ? 3 : 2,
      padding: main ? "9px 11px" : "7px 9px",
      border: `${main ? 2 : 1}px solid ${state.isSelected ? "var(--dropdown-panel)" : state.isFocused ? "var(--dropdown-border)" : "transparent"}`,
      borderRadius: main ? 9 : 6,
      background: state.isFocused ? "var(--dropdown-accent)" : state.isSelected ? main ? "var(--dropdown-gradient)" : "var(--dropdown-active)" : "transparent",
      color: state.isFocused || state.isSelected && main ? "var(--dropdown-on-accent)" : "var(--dropdown-option-text)",
      fontSize: main ? 13 : 12,
      fontWeight: state.isSelected ? 600 : 400,
      lineHeight: 1.4,
      cursor: "pointer",
      ":active": { background: "var(--dropdown-accent)", color: "var(--dropdown-on-accent)" },
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
