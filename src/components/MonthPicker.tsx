import { formatMonthInputValue, parseMonthInput } from "../lib/date";

type MonthPickerProps = {
  label?: string;
  value: Date;
  onChange: (date: Date) => void;
};

export function MonthPicker({ label = "Month", value, onChange }: MonthPickerProps) {
  return (
    <label className="field-label">
      <span>{label}</span>
      <input
        className="input"
        type="month"
        value={formatMonthInputValue(value)}
        onChange={(event) => onChange(parseMonthInput(event.target.value))}
      />
    </label>
  );
}

