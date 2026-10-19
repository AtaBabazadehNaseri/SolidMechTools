import { useMemo, useState } from 'react';
import { type Mat, directionalModuli } from '../mechanics';
import { type Action, type LabDerived, type LabState, type MaterialDerived, SWEEP_QUANTITIES, type SweepQuantity, rotationSweep } from '../app/lab';
import { fmt, toGPa } from '../app/format';
import { Tex } from './Tex';

interface Props {
  state: LabState;
  derived: LabDerived;
  material: MaterialDerived;
  dispatch: (a: Action) => void;
  /** The collapsible rotation sweep (a guide shows it as its own panel instead). */
  sweep?: boolean;
}

const N = 180;
const RAD = 92;

export function DirectionalPanel({ state, derived, material, dispatch, sweep = true }: Props) {
  const [view, setView] = useState<PolarView>('E');
  const { S2, C2, R, coaxial, planeExt } = derived;
  const S = material.S6mat;
  const axisE = [0, 1, 2].map((i) => 1 / S[i][i]);
  const iMax = axisE.indexOf(Math.max(...axisE));
  const iMin = axisE.indexOf(Math.min(...axisE));
  const equalE12 = Math.abs(axisE[0] - axisE[1]) <= 1e-9 * axisE[0];
  // G12 / G12,iso with G12,iso = E1 / 2(1 + ν12), the value that would make the 1–2 plane isotropic.
  // In compliances this is 2(S11 − S12)/S66: the Zener ratio for cubic crystals.
  const shearRatio = equalE12 ? (2 * (S[0][0] - S[0][1])) / S[5][5] : null;

  return (
    <section className="panel directional">
      <div className="panel-head">
        <h2>Directional properties (specimen plane)</h2>
        <div className="seg small-seg">
          <button className={view === 'E' ? 'on' : ''} onClick={() => setView('E')}>
            E and C̄ₙ
          </button>
          <button className={view === 'G' ? 'on' : ''} onClick={() => setView('G')}>
            G
          </button>
          <button className={view === 'nu' ? 'on' : ''} onClick={() => setView('nu')}>
            ν
          </button>
        </div>
      </div>
      <Polar S2={S2} C2={C2} R={R} view={view} coaxial={coaxial.all ? [] : coaxial.angles} />

      <h3>Anisotropy</h3>
      <table className="aniso">
        <tbody>
          <tr>
            <th>Axis moduli</th>
            <td>
              {iMax === iMin || Math.abs(axisE[iMax] - axisE[iMin]) <= 1e-9 * axisE[iMax] ? (
                <Tex>{'E_1 = E_2 = E_3'}</Tex>
              ) : (
                <>
                  <Tex>{`E_${iMax + 1}/E_${iMin + 1} =`}</Tex> {fmt(axisE[iMax] / axisE[iMin], 4)}
                </>
              )}
            </td>
          </tr>
          {shearRatio !== null && (
            <tr>
              <th>
                {state.classId === 'cubic' ? (
                  <>
                    Zener ratio <Tex>{'A'}</Tex>
                  </>
                ) : (
                  <Tex>{'G_{12}/G_{12}^{\\,\\mathrm{iso}}'}</Tex>
                )}
              </th>
              <td>
                {fmt(shearRatio, 4)}
                <span className="muted"> (1 = isotropic{state.classId === 'cubic' ? '' : ' in the 1–2 plane'})</span>
              </td>
            </tr>
          )}
          <tr>
            <th>
              In plane, <Tex>{'E_{\\max}/E_{\\min}'}</Tex>
            </th>
            <td>{fmt(planeExt.Emax / planeExt.Emin, 4)}</td>
          </tr>
          <tr>
            <th>
              In plane, <Tex>{'G_{\\max}/G_{\\min}'}</Tex>
            </th>
            <td>{fmt(planeExt.Gmax / planeExt.Gmin, 4)}</td>
          </tr>
          <tr>
            <th>
              3D, <Tex>{'E_{\\max}/E_{\\min}'}</Tex>
            </th>
            <td>
              {fmt(material.young3D.max / material.young3D.min, 4)}{' '}
              <span className="muted">
                ({fmt(toGPa(material.young3D.min), 4)} to {fmt(toGPa(material.young3D.max), 4)} GPa)
              </span>
            </td>
          </tr>
          <tr>
            <th>
              Universal index <Tex>{'A^{U}'}</Tex>
            </th>
            <td>
              {fmt(material.universal, 4, 1e-10)} <span className="muted">(0 only for isotropy)</span>
            </td>
          </tr>
        </tbody>
      </table>
      <details className="notes">
        <summary>What these indices do and do not say</summary>
        <ul>
          <li>
            Axis ratios such as <Tex>{'E_1/E_2'}</Tex> are the first notion of anisotropy, but they miss it entirely when{' '}
            <Tex>{'E_1 = E_2 = E_3'}</Tex> (a cubic crystal).
          </li>
          <li>
            Then the remaining freedom is one number. <Tex>{'G/G^{\\mathrm{iso}}'}</Tex>, with <Tex>{'G^{\\mathrm{iso}} = E/2(1+\\nu)'}</Tex>,
            captures it: for cubic crystals it is the Zener ratio <Tex>{'A = 2C_{44}/(C_{11}-C_{12})'}</Tex>.{' '}
            <Tex>{'\\nu/\\nu^{\\mathrm{iso}}'}</Tex> measures the same deviation and adds nothing new. It is also ill-conditioned:{' '}
            <Tex>{'\\nu^{\\mathrm{iso}} = E/2G - 1'}</Tex> can be near zero, or negative.
          </li>
          <li>
            In 2D a circular <Tex>{'E(\\varphi)'}</Tex> does imply in-plane isotropy. In 3D a spherical <Tex>{'E(\\mathbf n)'}</Tex> is necessary
            but not sufficient: <Tex>{'E(\\mathbf n)'}</Tex> only sees the totally symmetric part of <Tex>{'\\mathbf S'}</Tex>, so G and ν can still
            depend on direction.
          </li>
          <li>
            <Tex>{'A^{U} = 5\\,G_V/G_R + K_V/K_R - 6'}</Tex> uses the Voigt (<Tex>{'V'}</Tex>) and Reuss (<Tex>{'R'}</Tex>) bounds of the bulk and
            shear moduli. It is frame-independent and works for every symmetry class. For cubic crystals it equals{' '}
            <Tex>{'\\tfrac65\\,(\\sqrt A - 1/\\sqrt A)^2'}</Tex>.
          </li>
        </ul>
      </details>
      {sweep && <RotationSweep state={state} onTheta={(deg) => dispatch({ type: 'theta', deg })} />}
    </section>
  );
}

type PolarView = 'E' | 'G' | 'nu';

/** Polar path pieces of r(φ), split where the sign changes; negative pieces are drawn at |r|. */
function signedPaths(phis: number[], vals: number[], scale: number): Array<{ d: string; neg: boolean }> {
  const out: Array<{ d: string; neg: boolean }> = [];
  let cur: string[] = [];
  let neg = vals[0] < 0;
  const pt = (k: number) => {
    const r = (RAD * Math.abs(vals[k])) / scale;
    return `${(r * Math.cos(phis[k])).toFixed(2)},${(-r * Math.sin(phis[k])).toFixed(2)}`;
  };
  vals.forEach((v, k) => {
    if (k > 0 && v < 0 !== neg) {
      out.push({ d: `M${cur.join(' L')}`, neg });
      cur = [pt(k - 1)]; // start at the last point (near r = 0) so the pieces join
      neg = v < 0;
    }
    cur.push(pt(k));
  });
  out.push({ d: `M${cur.join(' L')}`, neg });
  return out;
}

function Polar({ S2, C2, R, view, coaxial }: { S2: Mat; C2: Mat; R: Mat; view: PolarView; coaxial: number[] }) {
  const samples = Array.from({ length: N + 1 }, (_, k) => {
    const phi = (2 * Math.PI * k) / N;
    return { phi, ...directionalModuli(S2, C2, phi), nuT: directionalModuli(S2, C2, phi + Math.PI / 2).nu };
  });
  const phis = samples.map((s) => s.phi);
  const a1: [number, number] = [R[0][0], R[1][0]];
  const a1len = Math.hypot(...a1);

  let body: React.ReactNode;
  let max: number;
  let maxLabel: string;
  let x0: number;
  let legend: React.ReactNode;
  if (view === 'nu') {
    max = Math.max(...samples.flatMap((s) => [Math.abs(s.nu), Math.abs(s.nuT)]), 1e-6);
    maxLabel = fmt(max, 3);
    x0 = (RAD * Math.abs(samples[0].nu)) / max;
    body = (
      <>
        {signedPaths(phis, samples.map((s) => s.nuT), max).map((p, i) => (
          <path key={`t${i}`} d={p.d} className={p.neg ? 'polar-nu2 neg' : 'polar-nu2'} />
        ))}
        {signedPaths(phis, samples.map((s) => s.nu), max).map((p, i) => (
          <path key={`n${i}`} d={p.d} className={p.neg ? 'polar-nu1 neg' : 'polar-nu1'} />
        ))}
      </>
    );
    legend = (
      <>
        <span className="lg-e">ν₁₂-type: pull along φ, measure across</span>
        <span className="lg-q">ν₂₁-type: pull across φ, measure along</span>
        <span className="lg-c">dashed: negative (drawn at |ν|)</span>
      </>
    );
  } else {
    const keys: Array<'E' | 'Cn' | 'G'> = view === 'E' ? ['Cn', 'E'] : ['G'];
    max = Math.max(...samples.flatMap((s) => keys.map((kk) => s[kk])));
    maxLabel = `${fmt(toGPa(max), 3)} GPa`;
    x0 = (RAD * samples[0][view === 'E' ? 'E' : 'G']) / max;
    const path = (kk: 'E' | 'Cn' | 'G') => signedPaths(phis, samples.map((s) => s[kk]), max)[0].d + ' Z';
    body =
      view === 'E' ? (
        <>
          <path d={path('Cn')} className="polar-q" />
          <path d={path('E')} className="polar-e" />
          {coaxial
            .flatMap((a) => [a, a + Math.PI])
            .map((a, i) => (
              <line key={i} x1={(RAD + 2) * Math.cos(a)} y1={-(RAD + 2) * Math.sin(a)} x2={(RAD + 12) * Math.cos(a)} y2={-(RAD + 12) * Math.sin(a)} className="polar-coax" />
            ))}
        </>
      ) : (
        <path d={path('G')} className="polar-g" />
      );
    legend =
      view === 'E' ? (
        <>
          <span className="lg-e">E(φ): uniaxial stress</span>
          <span className="lg-q">C̄ₙ(φ): uniaxial strain</span>
          <span className="lg-c">ticks: coaxial directions</span>
        </>
      ) : (
        <span className="lg-g">G(φ): shear stress τnt alone</span>
      );
  }

  return (
    <div className="polar">
      <svg viewBox="-120 -112 240 224" role="img" aria-label="Directional properties in the specimen plane">
        {[0.5, 1].map((f) => (
          <circle key={f} r={RAD * f} className="polar-grid" />
        ))}
        <line x1={-RAD - 8} y1={0} x2={RAD + 8} y2={0} className="polar-axis" />
        <line x1={0} y1={-RAD - 8} x2={0} y2={RAD + 8} className="polar-axis" />
        {a1len > 0.3 && <line x1={(-RAD * a1[0]) / a1len} y1={(RAD * a1[1]) / a1len} x2={(RAD * a1[0]) / a1len} y2={(-RAD * a1[1]) / a1len} className="polar-mat" />}
        {body}
        <circle cx={x0} cy={0} r={4} className="polar-dot" />
        <text x={RAD + 10} y={-4} className="polar-text">x</text>
        <text x={4} y={-RAD + 10} className="polar-text">{maxLabel}</text>
      </svg>
      {view === 'nu' && (
        <div className="polar-read">
          along x: ν<sub>xy</sub> = {fmt(samples[0].nu, 4, 1e-12)}, ν<sub>yx</sub> = {fmt(samples[0].nuT, 4, 1e-12)}
        </div>
      )}
      <div className="polar-legend">
        {legend}
        <span className="lg-m">material axis 1</span>
      </div>
    </div>
  );
}

const SW = 440;
const SH = 170;
const M = { l: 48, r: 12, t: 12, b: 28 };

function niceTicks(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo || 1;
  const raw = span / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * step; v += step) ticks.push(Math.abs(v) < 1e-12 * step ? 0 : v);
  return ticks;
}

/**
 * The current experiment repeated at every material angle: what happens to
 * this particular test as the material turns under a fixed load.
 */
export function RotationSweep({
  state,
  onTheta,
  initial = 'gxy',
  panel = false,
}: {
  state: LabState;
  /** Sets θ from the plot; without it the plot only reads. */
  onTheta?: (deg: number) => void;
  initial?: SweepQuantity;
  /** Always open, as a panel of its own. */
  panel?: boolean;
}) {
  const [q, setQ] = useState<SweepQuantity>(initial);
  const [hover, setHover] = useState<number | null>(null);
  const data = useMemo(
    () => rotationSweep(state, q),
    // θ itself is swept, so it is deliberately not a dependency.
    [state.classId, state.params, state.section, state.mode, state.load, q],
  );
  const meta = SWEEP_QUANTITIES.find((x) => x.id === q)!;
  // A component the boundary conditions prescribe cannot change with θ.
  const component: Record<SweepQuantity, [number, 'stress' | 'strain'] | null> = {
    exx: [0, 'strain'], eyy: [1, 'strain'], gxy: [2, 'strain'],
    sxx: [0, 'stress'], syy: [1, 'stress'], txy: [2, 'stress'],
    zz: null, energy: null, stiffness: null, Ex: null, eta: null, nu: null,
  };
  const comp = component[q];
  const prescribed = comp !== null && state.load.control[comp[0]] === comp[1];
  const vals = data.map((d) => d.value);
  const vmax = Math.max(...vals.map(Math.abs));
  const flat = vmax === 0 || Math.max(...vals) - Math.min(...vals) <= 1e-9 * vmax;
  let lo = Math.min(0, ...vals);
  let hi = Math.max(0, ...vals);
  if (hi - lo < 1e-12) {
    lo = -1;
    hi = 1;
  }
  const pad = 0.08 * (hi - lo);
  lo -= pad;
  hi += pad;
  const X = (t: number) => M.l + ((t + 90) / 180) * (SW - M.l - M.r);
  const Y = (v: number) => M.t + ((hi - v) / (hi - lo)) * (SH - M.t - M.b);
  const path = data.map((d, k) => `${k ? 'L' : 'M'}${X(d.theta).toFixed(1)},${Y(d.value).toFixed(1)}`).join(' ');
  // In-plane quantities repeat every 180°, so the current θ is shown in [−90°, 90°].
  const wrap = (t: number) => ((((t + 90) % 180) + 180) % 180) - 90;
  const cur = wrap(state.thetaDeg);
  const at = (t: number) => data[Math.round(t + 90)];
  const thetaAt = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * SW;
    return Math.max(-90, Math.min(90, Math.round(((x - M.l) / (SW - M.l - M.r)) * 180 - 90)));
  };
  const shown = hover ?? cur;
  const point = at(shown);

  const body = (
    <>
      <div className="sweep-head">
        <select value={q} onChange={(e) => setQ(e.target.value as SweepQuantity)} aria-label="Quantity to sweep">
          {SWEEP_QUANTITIES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
        <span className="sweep-read">
          <b>{fmt(point.value, 4, 1e-9 * vmax)}</b> <span className="muted">{meta.unit}</span> at θ = {shown}°
        </span>
      </div>
      <svg
        viewBox={`0 0 ${SW} ${SH}`}
        className={onTheta ? 'sweep-plot' : 'sweep-plot read-only'}
        role="img"
        aria-label={`${meta.label} versus material angle; click to set the angle`}
        tabIndex={0}
        onPointerMove={(e) => setHover(thetaAt(e))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => onTheta?.(thetaAt(e))}
        onKeyDown={(e) => {
          if (onTheta && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            e.preventDefault();
            onTheta(Math.max(-90, Math.min(90, cur + (e.key === 'ArrowLeft' ? -1 : 1))));
          }
        }}
      >
        {niceTicks(lo, hi).map((v) => (
          <g key={v}>
            <line x1={M.l} x2={SW - M.r} y1={Y(v)} y2={Y(v)} className={v === 0 ? 'sweep-zero' : 'sweep-grid'} />
            <text x={M.l - 6} y={Y(v) + 3.5} textAnchor="end" className="sweep-tick">
              {fmt(v, 3)}
            </text>
          </g>
        ))}
        {[-90, -45, 0, 45, 90].map((t) => (
          <text key={t} x={X(t)} y={SH - 10} textAnchor="middle" className="sweep-tick">
            {t}°
          </text>
        ))}
        <path d={path} className="sweep-line" />
        {hover !== null && <line x1={X(hover)} x2={X(hover)} y1={M.t} y2={SH - M.b} className="sweep-cross" />}
        <circle cx={X(cur)} cy={Y(at(cur).value)} r={4.5} className="sweep-dot" />
        <rect x={M.l} y={M.t} width={SW - M.l - M.r} height={SH - M.t - M.b} className="sweep-hit" />
      </svg>
      <p className="hint">
        Material angle θ on the horizontal axis, with the load and boundary conditions fixed. In-plane quantities repeat every 180°.
        {prescribed
          ? ' This component is prescribed by the boundary conditions, so it cannot change; pick another quantity.'
          : flat
            ? ' This quantity does not change with θ for this material and plane.'
            : onTheta
              ? ' Click the plot (or use ← →) to set θ.'
              : ''}
      </p>
    </>
  );
  return panel ? (
    <section className="panel sweep sweep-panel">
      <h2>Rotation sweep: this test at every material angle</h2>
      {body}
    </section>
  ) : (
    <details className="sweep">
      <summary>Rotation sweep: this test at every material angle</summary>
      {body}
    </details>
  );
}
