import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  // The input, select or textarea this label names
  children: ReactNode;
  // An optional line under the input, read as part of the label
  hint?: string;
}

/**
 * Display one labelled form control.
 *
 * The control sits inside the label, so tapping the words focuses it and a screen
 * reader announces them, without each form inventing matching IDs.
 */
export function Field({ label, children, hint }: FieldProps) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint !== undefined && <span className="hint">{hint}</span>}
    </label>
  );
}
