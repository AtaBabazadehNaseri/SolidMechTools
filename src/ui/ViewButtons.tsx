import type { Viewer } from './three/viewer';

const FROM: Array<{ axis: 0 | 1 | 2; label: string; tip: string }> = [
  { axis: 0, label: '+x', tip: 'Look from the +x side, at the y–z plane' },
  { axis: 1, label: '+y', tip: 'Look from the +y side, at the x–z plane' },
  { axis: 2, label: '+z', tip: 'Look from the +z side, at the x–y plane (the 2D section)' },
];

/** Camera recovery and standard views for a 3D view; the keyboard does the same once the view has focus. */
export function ViewButtons({ viewer }: { viewer: () => Viewer | null }) {
  return (
    <div className="seg small-seg view-buttons" role="group" aria-label="Camera">
      <button onClick={() => viewer()?.home()} title="Back to the starting view and zoom (key: Home)">
        Reset view
      </button>
      {FROM.map((f) => (
        <button key={f.axis} onClick={() => viewer()?.viewFrom(f.axis)} title={f.tip}>
          {f.label}
        </button>
      ))}
    </div>
  );
}

export const KEYS_HINT = 'Drag or use the arrow keys to rotate, scroll or + / − to zoom, Home to reset.';
