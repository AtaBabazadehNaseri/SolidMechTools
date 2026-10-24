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

/** Beyond this the arithmetic can overflow; no value in the lab needs it. */
const MAX_MAGNITUDE = 1e12;

/**
 * Typed numeric entry. Values are applied on Enter or blur; invalid input is
 * rejected with a message below the field, never silently replaced. The
 * message clears once the value or its meaning is replaced from elsewhere
 * (a preset, a control switch, another material).
 */
export function NumberField({ value, unit, onCommit, validate, label }: Props) {
  const [text, setText] = useState(fmt(value, 4));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText(fmt(value, 4));
    setError(null);
  }, [value, unit, label]);

  const commit = () => {
    const parsed = Number(text.trim().replace(/−/g, '-'));
    if (text.trim() === '' || !Number.isFinite(parsed)) {
      setError('Not a number; the value was not applied.');
      setText(fmt(value, 4));
      return;
    }
    const msg = Math.abs(parsed) > MAX_MAGNITUDE ? 'Too large: enter a magnitude below 10¹².' : (validate?.(parsed) ?? null);
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
