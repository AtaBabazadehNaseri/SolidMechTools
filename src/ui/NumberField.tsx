import { useEffect, useState } from 'react';
import { fmt } from '../app/format';

interface Props {
  /** Value in display units. */
  value: number;
  unit: string;
  onCommit: (v: number) => void;
  /** Return an error message to reject the value (it is then not applied). */
  validate?: (v: number) => string | null;
  label: string;
}

/**
 * Typed numeric entry. Values are applied on Enter or blur; invalid input is
 * rejected with a message below the field, never silently replaced.
 */
export function NumberField({ value, unit, onCommit, validate, label }: Props) {
  const [text, setText] = useState(fmt(value, 4));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(fmt(value, 4)), [value]);

  const commit = () => {
    const parsed = Number(text.trim().replace(/−/g, '-'));
    if (text.trim() === '' || !Number.isFinite(parsed)) {
      setError('Not a number; the value was not applied.');
      setText(fmt(value, 4));
      return;
    }
    const msg = validate?.(parsed) ?? null;
    if (msg) {
      setError(msg);
      setText(fmt(value, 4));
      return;
    }
    setError(null);
    onCommit(parsed);
  };

  return (
    <span className="number-field">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        aria-label={label}
        aria-invalid={error !== null}
      />
      <span className="unit">{unit}</span>
      {error && <span className="field-error">{error}</span>}
    </span>
  );
}
