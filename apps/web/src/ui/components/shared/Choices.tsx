interface ChoicesProps<T extends string> {
  legend: string;
  choices: readonly [T, string][];
  selected: readonly T[];
  onChange: (selected: T[]) => void;
}

/**
 * Display a labelled group of checkboxes over a fixed list of choices.
 */
export function Choices<T extends string>({ legend, choices, selected, onChange }: ChoicesProps<T>) {
  return (
    <fieldset className="fieldset">
      <legend className="label">{legend}</legend>
      <div className="row">
        {choices.map(([value, label]) => (
          <label key={value} className="choice">
            <input
              type="checkbox"
              value={value}
              checked={selected.includes(value)}
              onChange={(event) => onChange(event.target.checked ? [...selected, value] : selected.filter((item) => item !== value))}
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
