import { type KelvinMode6, type Vec, kelvinModes3D, principal3D, strainTensor } from '../mechanics';
import type { Action, LabDerived, LabState } from '../app/lab';
import { fmt, toGPa } from '../app/format';

const NAMES = ['εxx', 'εyy', 'εzz', 'γyz', 'γxz', 'γxy'];

/** A mode in words: its dominant components (compared in Mandel form), with signs. */
function describe(strain: Vec): string {
  const m = strain.map((v, i) => (i >= 3 ? v / Math.SQRT2 : v));
  const big = Math.max(...m.map(Math.abs));
  const lead = m.findIndex((x) => Math.abs(x) === big);
  const s = Math.sign(m[lead]) || 1;
  return m
    .map((x, i) => ({ x: x * s, i }))
    .filter((t) => Math.abs(t.x) >= 0.3 * big)
    .map((t, k) => (k === 0 ? (t.x < 0 ? '−' : '') : t.x < 0 ? ' − ' : ' + ') + NAMES[t.i])
    .join('');
}

/** The cube strained in a mode: strain-controlled, scaled so the largest principal strain is the reference strain. */
function modeLoad(mode: KelvinMode6, scales: LabState['scales']): LabState['load3'] {
  const p = principal3D(strainTensor(mode.strain)).values;
  const k = scales.strain / Math.max(...p.map(Math.abs));
  return { control: ['strain', 'strain', 'strain', 'strain', 'strain', 'strain'], value: mode.strain.map((v) => v * k) };
}

/** The six eigenmodes of the 3D stiffness, each with a button that strains the cube in it. */
export function Kelvin3DPanel({ state, derived, dispatch }: { state: LabState; derived: LabDerived; dispatch: (a: Action) => void }) {
  const modes = kelvinModes3D(derived.C6);
  const same = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(Math.abs(a), Math.abs(b));
  const multiplicity = (k: number) => modes.filter((m) => same(m.modulus, modes[k].modulus)).length;
  // The mode the cube is currently strained in, if any.
  const v = state.load3.value;
  const allStrain = state.load3.control.every((c) => c === 'strain');
  const current = modes.findIndex((m) => {
    if (!allStrain) return false;
    const k = v.reduce((a, x, i) => a + x * m.strain[i], 0) / m.strain.reduce((a, x) => a + x * x, 0);
    return k !== 0 && v.every((x, i) => Math.abs(x - k * m.strain[i]) <= 1e-9 * Math.max(...v.map(Math.abs)));
  });
  return (
    <section className="panel kelvin3d">
      <h2>Stiffness eigenmodes (Kelvin modes of C)</h2>
      <p className="hint">
        Six strain states for which the stress is exactly the strain times a number, σ = λ ε (Mandel form, so λ = 2G for a pure shear).
        Their λ do not change when the material is rotated. Strain the cube in one and check that stress and strain are coaxial.
      </p>
      <div className="kelvin3d-list">
        {modes.map((m, k) => (
          <button
            key={k}
            className={k === current ? 'kelvin-mode on' : 'kelvin-mode'}
            onClick={() => dispatch({ type: 'loadCase3', load: modeLoad(m, state.scales) })}
            title="Strain the cube in this mode"
          >
            <CubeThumb strain={m.strain} />
            <span className="kelvin3d-text">
              <span>
                λ{'₁₂₃₄₅₆'[k]} = {fmt(toGPa(m.modulus), 4)} GPa{multiplicity(k) > 1 ? ` (×${multiplicity(k)})` : ''}
              </span>
              <span className="muted">{describe(m.strain)}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="hint">
        Repeated λ mean any combination of those modes is a mode too: an isotropic solid has one dilatation (λ = 3K) and five shears
        (λ = 2G), a cubic crystal three distinct values. Every λ positive is exactly the stability condition.
      </p>
    </section>
  );
}

/** An isometric sketch of the unit cube deformed by a mode (reference dashed). */
function CubeThumb({ strain }: { strain: Vec }) {
  const e = strainTensor(strain);
  const p = principal3D(e).values;
  const k = 0.28 / Math.max(...p.map(Math.abs), 1e-300);
  const proj = ([x, y, z]: number[]): [number, number] => [18 * (x - z) * 0.866, -18 * (y - (x + z) * 0.5)];
  const map = (q: number[]) => q.map((_, i) => q[i] + k * (e[i][0] * q[0] + e[i][1] * q[1] + e[i][2] * q[2]));
  const corners: number[][] = [];
  for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) corners.push([x, y, z]);
  const edges: Array<[number, number]> = [];
  for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) if (corners[a].filter((c, i) => c !== corners[b][i]).length === 1) edges.push([a, b]);
  const line = (pts: number[][], cls: string) =>
    edges.map(([a, b], i) => {
      const [x1, y1] = proj(pts[a]);
      const [x2, y2] = proj(pts[b]);
      return <line key={`${cls}${i}`} x1={x1} y1={y1} x2={x2} y2={y2} className={cls} />;
    });
  return (
    <svg viewBox="-30 -30 60 60" className="mode-thumb" aria-hidden>
      {line(corners, 'reference')}
      {line(corners.map(map), 'deformed-edge')}
    </svg>
  );
}
