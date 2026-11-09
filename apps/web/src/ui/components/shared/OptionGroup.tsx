interface OptionGroupProps<T extends string> {
  legend: string;
  name: string;
  options: readonly [T, string][];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Display a labelled group of radio tiles where exactly one option is chosen.
 */
export function OptionGroup<T extends string>({ legend, name, options, value, onChange }: OptionGroupProps<T>) {
  return <fieldset className="fieldset">
    <legend className="label">{legend}</legend>
    <div className="pack-options">{options.map(([option, label]) => <label key={option} className="equipment-mode">
      <input type="radio" name={name} value={option} checked={option === value} onChange={() => onChange(option)} /><span>{label}</span>
    </label>)}</div>
  </fieldset>;
}
