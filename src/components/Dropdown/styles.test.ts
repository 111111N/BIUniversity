import type { ControlProps, MenuProps } from "react-select";
import { describe, expect, it } from "vitest";
import type { DropdownOption, DropdownVariant } from ".";
import { createDropdownStyles } from "./styles";

const controlState = (menuIsOpen: boolean, invalid = false) => ({ menuIsOpen, isFocused: true, isDisabled: false, selectProps: { "aria-invalid": invalid } }) as ControlProps<DropdownOption, false>;

describe.each<DropdownVariant>(["main", "compact"])("%s dropdown menu connection", (variant) => {
  it.each(["top", "bottom"] as const)("joins the %s edge while keeping the opposite control edge visible", (placement) => {
    const styles = createDropdownStyles(variant, placement);
    const control = styles.control!({}, controlState(true));
    const visibleColor = variant === "main" ? "var(--dropdown-accent)" : "var(--dropdown-control-border)";
    const background = variant === "main" ? "var(--ui-panel)" : "var(--dropdown-control)";
    expect(control.borderTopColor).toBe(placement === "top" ? background : visibleColor);
    expect(control.borderBottomColor).toBe(placement === "bottom" ? background : visibleColor);
    const menu = styles.menu!({}, { placement } as MenuProps<DropdownOption, false>);
    expect(menu.marginTop).toBe(0);
    expect(menu.marginBottom).toBe(0);
    expect(menu.borderTop === 0).toBe(placement === "bottom");
    expect(menu.borderBottom === 0).toBe(placement === "top");
  });
  it("restores the bottom border after closing an upward menu and preserves validation styling", () => {
    const styles = createDropdownStyles(variant, "top");
    const control = styles.control!({}, controlState(false));
    expect(control.borderBottomColor).toBe(variant === "main" ? "var(--dropdown-accent)" : "var(--dropdown-control-border)");
    const invalid = styles.control!({}, controlState(true, true));
    expect(invalid.borderTopColor).toBe("var(--ui-danger-text)");
    expect(invalid.borderBottomColor).toBe("var(--ui-danger-text)");
  });
});
