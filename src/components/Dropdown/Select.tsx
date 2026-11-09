import { createContext, useContext, useLayoutEffect, useMemo, useState } from "react";
import Select, { components, type MenuProps, type Props as SelectProps } from "react-select";
import type { DropdownOption, DropdownVariant } from ".";
import { createDropdownStyles } from "./styles";

type Placement = "top" | "bottom";
const PlacementContext = createContext<((placement: Placement) => void) | null>(null);

const PlacementMenu = <IsMulti extends boolean,>(props: MenuProps<DropdownOption, IsMulti>) => {
  const setPlacement = useContext(PlacementContext);
  // react-select сообщает здесь уже вычисленное направление, в том числе для auto.
  useLayoutEffect(() => { setPlacement?.(props.placement); }, [props.placement, setPlacement]);
  return <components.Menu {...props} />;
};

type Props<IsMulti extends boolean> = Omit<SelectProps<DropdownOption, IsMulti>, "styles" | "components"> & { variant?: DropdownVariant };

const DropdownSelect = <IsMulti extends boolean = false,>({ variant = "compact", menuPlacement = "auto", ...props }: Props<IsMulti>) => {
  const [placement, setPlacement] = useState<Placement>(menuPlacement === "top" ? "top" : "bottom");
  const styles = useMemo(() => createDropdownStyles<IsMulti>(variant, placement), [variant, placement]);
  return <PlacementContext.Provider value={setPlacement}>
    <Select<DropdownOption, IsMulti> {...props} menuPlacement={menuPlacement} styles={styles} components={{ Menu: PlacementMenu<IsMulti> }} />
  </PlacementContext.Provider>;
};

export default DropdownSelect;
