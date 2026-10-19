import { useEffect, useRef, useState } from 'react';
import type { Interval, KnobSnaps, ParamDef } from '../mechanics';
import type { Track } from '../app/lab';
import { fmt, toGPa } from '../app/format';
import { Tex } from './Tex';

interface Props {
  def: ParamDef;
  value: number;
  interval: Interval;
  track: Track;
  snaps: KnobSnaps;
  onChange: (v: number) => void;
}

const STEPS = 1000;
/** Snap when within this fraction of the track width of a target. */
const SNAP = 0.012;

/** Keep the value strictly inside the open admissible interval. */
function clampInside(v: number, { lo, hi }: Interval, log: boolean): number {
  if (log) {
    const a = lo > 0 ? lo * 1.001 : 0;
    const b = Number.isFinite(hi) ? hi * 0.999 : Infinity;
    return Math.min(Math.max(v, a), b);
  }
  const m = Number.isFinite(lo) && Number.isFinite(hi) ? 1e-3 * (hi - lo) : 1e-3;
  return Math.min(Math.max(v, lo + m), hi - m);
}

export function Knob({ def, value, interval, track, snaps, onChange }: Props) {
  const isMod = def.kind === 'modulus';
  const toU = (v: number) =>
    track.log ? Math.log(v / track.min) / Math.log(track.max / track.min) : (v - track.min) / (track.max - track.min);
  const fromU = (u: number) => (track.log ? track.min * (track.max / track.min) ** u : track.min + u * (track.max - track.min));
  const clamp01 = (u: number) => Math.min(Math.max(u, 0), 1);
  const uLo = clamp01(interval.lo <= 0 && track.log ? 0 : toU(interval.lo));
  const uHi = clamp01(Number.isFinite(interval.hi) ? toU(interval.hi) : 1);
  const show = (v: number) => (isMod ? toGPa(v) : v);
  const unit = isMod ? 'GPa' : '';
  const range = `(${fmt(show(interval.lo), 3)}, ${fmt(show(interval.hi), 3)})`;
  const noSnap = useRef(false);

  const [text, setText] = useState(fmt(show(value), 4));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(fmt(show(value), 4)), [value, isMod]);

  // Typed values outside the admissible range are rejected with a reason, never silently clamped.
  const commitText = () => {
    const parsed = Number(text.trim().replace(/−/g, '-'));
    const reject = (msg: string) => {
      setError(msg);
      setText(fmt(show(value), 4));
    };
    if (text.trim() === '' || !Number.isFinite(parsed)) return reject('Not a number; the value was not applied.');
    const v = isMod ? parsed * 1000 : parsed;
    if (!(v > interval.lo && v < interval.hi))
      return reject(
        `Outside the admissible range ${range} with the other constants fixed: the material would not be stable. The value was not applied.`,
      );
    setError(null);
    onChange(v);
  };

  const fromSlider = (u: number) => {
    setError(null);
    if (!noSnap.current) {
      const hit = snaps.ticks.find((t) => Math.abs(toU(t.value) - u) < SNAP);
      if (hit) return onChange(hit.value);
    }
    onChange(clampInside(fromU(u), interval, track.log));
  };

  const pct = (u: number) => `${(100 * u).toFixed(2)}%`;
  // Sorted along the track; alternate below / above so neighbouring ticks never overlap.
  const ticks = snaps.ticks.filter((t) => toU(t.value) >= 0 && toU(t.value) <= 1).sort((a, b) => a.value - b.value);
  const tickRow = (side: 0 | 1) => (
    <div className={side === 0 ? 'ticks ticks-below' : 'ticks ticks-above'}>
      {ticks.map((t, k) =>
        k % 2 === side ? (
          <button
            key={t.label}
            className="tick"
            style={{ left: pct(toU(t.value)) }}
            title={`${t.label}  (${fmt(show(t.value), 4)}${unit && ' ' + unit})`}
            onClick={() => onChange(t.value)}
          />
        ) : null,
      )}
    </div>
  );

  return (
    <div className="knob">
      <div className="knob-head" title={def.label}>
        <Tex>{def.symbol}</Tex>
        <input
          className="knob-value"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => e.key === 'Enter' && commitText()}
          aria-label={`${def.key} value`}
        />
        <span className="unit">{unit}</span>
        {snaps.active && <span className="knob-active">● {snaps.active}</span>}
      </div>
      <div className="knob-slider">
        {ticks.length > 1 && tickRow(1)}
        <input
          type="range"
          min={0}
          max={STEPS}
          value={Math.round(clamp01(toU(value)) * STEPS)}
          onPointerDown={(e) => (noSnap.current = e.altKey)}
          onChange={(e) => fromSlider(Number(e.target.value) / STEPS)}
          style={{
            background: `linear-gradient(to right, var(--band-bad) 0, var(--band-bad) ${pct(uLo)}, var(--band-ok) ${pct(uLo)}, var(--band-ok) ${pct(uHi)}, var(--band-bad) ${pct(uHi)}, var(--band-bad) 100%)`,
          }}
          aria-label={def.label}
        />
        {tickRow(0)}
      </div>
      {error && <div className="field-error">{error}</div>}
      <details className="knob-more">
        <summary>{def.label}</summary>
        <div className="knob-range">admissible {range}, all other constants fixed</div>
        {ticks.length > 0 && <div className="knob-range">snap points: {ticks.map((t) => t.label).join(' · ')} (hold Alt to drag freely)</div>}
      </details>
    </div>
  );
}
