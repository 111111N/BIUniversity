import type { StylesConfig } from "react-select";
import type { DropdownOption, DropdownVariant } from ".";

export const createDropdownStyles = <IsMulti extends boolean = false,>(variant: DropdownVariant, placement: "top" | "bottom" = "bottom"): StylesConfig<DropdownOption, IsMulti> => {
  const navigation = variant === "navigation" || variant === "main";
  const borderWidth = navigation ? "var(--ui-frame-border-width)" : "1px";
  const interactionBorder = navigation ? "var(--dropdown-accent)" : "var(--dropdown-control-border)";
  const controlBackground = navigation ? "var(--ui-panel)" : "var(--dropdown-control)";
  return {
    control: (base, state) => ({
      ...base,
      minHeight: "var(--dropdown-control-height, 46px)",
      padding: navigation ? "2px 8px" : "0 6px",
      borderWidth,
      borderTopWidth: navigation ? 0 : borderWidth,
      borderStyle: "solid",
      borderColor: state.selectProps["aria-invalid"] ? "var(--ui-danger-text)" : state.isFocused || state.menuIsOpen ? interactionBorder : "var(--dropdown-control-border)",
      // Скрывается только граница, непосредственно примыкающая к открытому меню.
      borderTopColor: state.selectProps["aria-invalid"] ? "var(--ui-danger-text)" : state.menuIsOpen && placement === "top" ? controlBackground : state.isFocused || state.menuIsOpen ? interactionBorder : "var(--dropdown-control-border)",
      borderBottomColor: state.selectProps["aria-invalid"] ? "var(--ui-danger-text)" : state.menuIsOpen && placement === "bottom" ? controlBackground : state.isFocused || state.menuIsOpen ? interactionBorder : "var(--dropdown-control-border)",
      borderRadius: state.menuIsOpen && placement === "top" ? navigation ? "0 0 17px 17px" : "0 0 8px 8px" : navigation ? "var(--ui-picker-main-radius)" : state.menuIsOpen ? "8px 8px 0 0" : "8px",
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
    valueContainer: (base) => ({ ...base, minWidth: 0, padding: navigation ? "2px 6px" : "0 4px" }),
    singleValue: (base, state) => ({ ...base, color: state.isDisabled ? "var(--dropdown-muted)" : "var(--dropdown-text)", fontSize: navigation ? 13 : 12, fontWeight: 600, lineHeight: 1.4 }),
    placeholder: (base) => ({ ...base, color: "var(--dropdown-muted)", fontSize: navigation ? 13 : 12, lineHeight: 1.4 }),
    input: (base) => ({ ...base, color: "var(--dropdown-text)", fontSize: navigation ? 13 : 12 }),
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
      background: controlBackground,
      boxShadow: "0 18px 35px var(--dropdown-shadow)",
    }),
    menuList: (base, state) => ({ ...base, padding: navigation ? 6 : 4, maxHeight: Math.min(260, state.maxHeight), scrollbarWidth: "thin", scrollbarColor: `var(--dropdown-border) ${controlBackground}` }),
    noOptionsMessage: (base) => ({ ...base, color: "var(--dropdown-muted)", fontSize: 13, lineHeight: 1.5 }),
    option: (base, state) => ({
      ...base,
      minHeight: state.selectProps.isSearchable ? 44 : undefined,
      display: "flex",
      alignItems: "center",
      overflowWrap: "anywhere",
      marginBottom: navigation ? 3 : 2,
      padding: navigation ? "9px 11px" : "7px 9px",
      border: `1px solid ${state.isSelected ? "var(--dropdown-active)" : state.isFocused ? "var(--dropdown-accent)" : "transparent"}`,
      borderRadius: navigation ? 9 : 6,
      background: state.isSelected ? "var(--dropdown-active)" : state.isFocused ? "var(--dropdown-hover)" : "transparent",
      color: state.isSelected ? "var(--dropdown-on-accent)" : state.isFocused ? "var(--dropdown-text)" : "var(--dropdown-option-text)",
      boxShadow: state.isFocused && !state.isSelected ? "inset 0 0 8px var(--dropdown-hover)" : "none",
      fontSize: navigation ? 13 : 12,
      fontWeight: state.isSelected ? 600 : 400,
      lineHeight: 1.4,
      cursor: "pointer",
      ":active": { background: state.isSelected ? "var(--dropdown-active)" : "var(--dropdown-hover)", borderColor: "var(--dropdown-accent)", color: state.isSelected ? "var(--dropdown-on-accent)" : "var(--dropdown-text)" },
    }),
    dropdownIndicator: (base, state) => ({
      ...base,
      padding: navigation ? 8 : 5,
      color: state.isFocused ? "var(--dropdown-accent)" : "var(--dropdown-muted)",
      transform: state.selectProps.menuIsOpen ? "rotate(180deg)" : undefined,
      transition: "transform .15s ease",
      ":hover": { color: "var(--dropdown-accent)" },
    }),
    indicatorSeparator: () => ({ display: "none" }),
  };
};

// Kept as the default exported style configuration for existing consumers.
export const dropdownStyles = createDropdownStyles("field");
