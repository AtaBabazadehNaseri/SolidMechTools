import { useState } from 'react';
import { type Mat, principalMisalignment, strainTensor, stressTensor } from '../mechanics';
import type { LabDerived } from '../app/lab';
import { fmt, toMilli } from '../app/format';

const SUB = ['₁', '₂', '₃'];
const FACES = ['x', 'y', 'z'];
/** A unit direction to three decimals, largest component positive. */
const vec = (n: number[]) => {
  const k = n.reduce((m, x, i) => (Math.abs(x) > Math.abs(n[m]) ? i : m), 0);
  const v = n[k] < 0 ? n.map((x) => -x) : n;
  return `(${v.map((x) => (Math.abs(x) < 5e-4 ? '0' : x.toFixed(3).replace('-', '−'))).join(', ')})`;
};

/** Principal values and directions of the cube's stress and strain, and the three Mohr circles. */
export function Principal3DPanel({ derived }: { derived: LabDerived }) {
  const [kind, setKind] = useState<'stress' | 'strain'>('stress');
  const { response, principalStress: ps, principalStrain: pe } = derived.solid;
  const loaded = response.stress.some((v) => v !== 0) || response.strain.some((v) => v !== 0);
  const gap = principalMisalignment(ps, pe);
  const sTol = 1e-9 * Math.max(...response.stress.map(Math.abs), 1e-300);
  const eTol = 1e-9 * Math.max(...response.strain.map(Math.abs), 1e-300);
  const isStress = kind === 'stress';
  // Strain is shown in 10⁻³, with tensor shear ε_ij = γ_ij/2 as Mohr's ordinate.
  const T = isStress ? stressTensor(response.stress) : strainTensor(response.strain).map((r) => r.map(toMilli));
  const p = isStress ? ps.values : pe.values.map(toMilli);

  return (
    <section className="panel principal-panel">
      <h2>Principal axes and Mohr’s circles (cube)</h2>
      <div className="principal-grid">
        <div>
          <dl className="axes-list">
            <dt className="row-stress">Principal stress (MPa)</dt>
            <dd>
              {ps.values.map((v, k) => (
                <div key={k}>
                  σ{SUB[k]} = {fmt(v, 4, sTol)} along {vec(ps.directions[k])}
                </div>
              ))}
            </dd>
            <dt className="row-strain">Principal strain (10⁻³)</dt>
            <dd>
              {pe.values.map((v, k) => (
                <div key={k}>
                  ε{SUB[k]} = {fmt(toMilli(v), 4, toMilli(eTol))} along {vec(pe.directions[k])}
                </div>
              ))}
            </dd>
          </dl>
          <p className={gap !== null && gap > 0.05 ? 'coax warn' : 'coax'}>
            {!loaded
              ? 'Nothing is loaded yet.'
              : gap === null
                ? 'A principal value is repeated, so its directions are not unique and coaxiality cannot be judged from them.'
                : gap <= 0.05
                  ? 'Stress and strain are coaxial: their principal directions coincide.'
                  : `Stress and strain are not coaxial: their principal directions differ by up to ${fmt(gap, 3)}°.`}
          </p>
        </div>
        <div>
          <div className="seg small-seg">
            <button className={isStress ? 'on' : ''} onClick={() => setKind('stress')}>
              stress
            </button>
            <button className={!isStress ? 'on' : ''} onClick={() => setKind('strain')}>
              strain
            </button>
          </div>
          {loaded ? <Mohr3D T={T} p={p} isStress={isStress} /> : <p className="hint">Load the cube to see its circles.</p>}
        </div>
      </div>
      <p className="hint">
        In 3D, the traction on every plane lies in the shaded region between the three circles, whose diameters run between the
        principal values. The dots are the x, y and z faces: their normal stress and the size of their shear.
      </p>
    </section>
  );
}

function Mohr3D({ T, p, isStress }: { T: Mat; p: number[]; isStress: boolean }) {
  const W = 260;
  const H = 150;
  const [s1, s2, s3] = p;
  const lo = Math.min(s3, 0);
  const hi = Math.max(s1, 0);
  const R = (s1 - s3) / 2;
  const span = Math.max(hi - lo, 1e-12);
  const k = Math.min((W - 30) / span, (H - 34) / Math.max(R, 1e-12));
  const X = (v: number) => 15 + (v - lo) * k + (W - 30 - span * k) / 2;
  const y0 = H - 20;
  const Y = (tau: number) => y0 - tau * k;
  const arc = (a: number, b: number) => {
    const r = Math.max(((b - a) / 2) * k, 0.01);
    return `M${X(a)},${y0} A${r},${r} 0 0 1 ${X(b)},${y0} Z`;
  };
  const faces = [0, 1, 2].map((i) => {
    const t = T[i];
    const sn = t[i];
    const tau = Math.sqrt(Math.max(0, t.reduce((a, v) => a + v * v, 0) - sn * sn));
    return { sn, tau };
  });
  const unit = isStress ? 'MPa' : '×10⁻³';
  return (
    <div className="mohr">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mohr's three circles">
        <path d={arc(s3, s1)} className="mohr3-region" />
        <path d={arc(s2, s1)} className="mohr3-hole" />
        <path d={arc(s3, s2)} className="mohr3-hole" />
        <path d={arc(s3, s1)} className={`mohr3-circle mohr-${isStress ? 'stress' : 'strain'}`} />
        <path d={arc(s2, s1)} className={`mohr3-circle mohr-${isStress ? 'stress' : 'strain'}`} />
        <path d={arc(s3, s2)} className={`mohr3-circle mohr-${isStress ? 'stress' : 'strain'}`} />
        <line x1={5} y1={y0} x2={W - 5} y2={y0} className="mohr-axis" />
        {X(0) >= 5 && X(0) <= W - 5 && <line x1={X(0)} y1={8} x2={X(0)} y2={y0 + 6} className="mohr-axis" />}
        {p.map((v, i) => (
          <g key={i}>
            <circle cx={X(v)} cy={y0} r={2.5} className="mohr-princ" />
            <text x={X(v)} y={y0 + 14} textAnchor="middle" className="mohr-text">
              {(isStress ? 'σ' : 'ε') + SUB[i]}
            </text>
          </g>
        ))}
        {faces.map((f, i) => (
          <g key={i}>
            <circle cx={X(f.sn)} cy={Y(f.tau)} r={3.2} className="mohr-pt" />
            <text x={X(f.sn) + 5} y={Y(f.tau) - 4} className="mohr-text">
              {FACES[i]}
            </text>
          </g>
        ))}
        <text x={W - 8} y={y0 - 5} textAnchor="end" className="mohr-text">
          {isStress ? 'σ' : 'ε'}
        </text>
        <text x={Math.min(Math.max(X(0) + 4, 6), W - 40)} y={14} className="mohr-text">
          {isStress ? '|τ|' : '|γ|/2'} ↑
        </text>
      </svg>
      <div className="mohr-read">
        {FACES.map((f, i) => `${f} face: ${fmt(faces[i].sn, 3, 1e-12)}, ${fmt(faces[i].tau, 3, 1e-12)}`).join(' · ')} {unit}
      </div>
    </div>
  );
}
