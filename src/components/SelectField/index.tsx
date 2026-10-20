import Dropdown, { type DropdownOption, type DropdownVariant } from "../Dropdown";

export type SelectOption = DropdownOption;

interface SelectFieldProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange(value: string): void;
  variant?: DropdownVariant;
}

const SelectField = (props: SelectFieldProps) => <Dropdown {...props} />;

export default SelectField;
