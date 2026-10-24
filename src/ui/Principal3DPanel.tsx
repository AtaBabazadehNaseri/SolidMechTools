import { useState } from 'react';
import { type Coaxiality, type Mat, coaxiality, strainTensor, stressTensor } from '../mechanics';
import type { Cut3, LabDerived } from '../app/lab';
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
export function Principal3DPanel({ derived, cut }: { derived: LabDerived; cut: Cut3 | null }) {
  const [kind, setKind] = useState<'stress' | 'strain'>('stress');
  const { response, principalStress: ps, principalStrain: pe } = derived.solid;
  const loaded = response.stress.some((v) => v !== 0) || response.strain.some((v) => v !== 0);
  const cx = coaxiality(stressTensor(response.stress), strainTensor(response.strain), ps, pe);
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
          <p className={loaded && !cx.coaxial ? 'coax warn' : 'coax'}>{loaded ? coaxText(cx) : 'Nothing is loaded yet.'}</p>
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
          {loaded ? (
            <Mohr3D
              T={T}
              p={p}
              isStress={isStress}
              cut={cut && (isStress ? { sn: cut.normal, tau: cut.shear } : { sn: toMilli(cut.strainNormal), tau: toMilli(cut.strainShear) })}
            />
          ) : (
            <p className="hint">Load the cube to see its circles.</p>
          )}
        </div>
      </div>
      <p className="hint">
        In 3D, the traction on every plane lies in the shaded region between the three circles, whose diameters run between the
        principal values. The dots are the x, y and z faces: their normal stress and the size of their shear.
        {cut ? ' The magenta dot is the cut plane.' : ' Turn on “Cut plane” to place any plane among them.'}
      </p>
    </section>
  );
}

/**
 * The coaxiality verdict in words. It rests on σε = εσ, so a repeated principal value (σ₂ = σ₃ = 0 in uniaxial
 * stress) does not prevent it; only the comparison of individual directions needs unique ones.
 */
function coaxText(cx: Coaxiality): string {
  const name = (t: 'a' | 'b') => (t === 'a' ? 'stress' : 'strain');
  if (cx.coaxial) {
    if (cx.isotropic)
      return `Stress and strain are coaxial, trivially: the ${name(cx.isotropic)} is the same in every direction, so every direction is principal for it.`;
    if (cx.angle !== null) return 'Stress and strain are coaxial: their principal directions coincide.';
    return 'Stress and strain are coaxial: they share a set of principal directions (σε = εσ). A repeated principal value leaves the directions in its plane free, so the lists above may show different but equivalent choices.';
  }
  if (cx.angle !== null) return `Stress and strain are not coaxial: their principal directions differ by up to ${fmt(cx.angle, 3)}°.`;
  if (cx.witness) {
    const w = cx.witness;
    const sym = w.of === 'a' ? 'σ' : 'ε';
    const other = w.of === 'a' ? 'ε' : 'σ';
    return `Stress and strain are not coaxial (σε ≠ εσ). The direction of ${sym}${SUB[w.k]}, ${vec(w.n)}, is not principal for the ${name(w.of === 'a' ? 'b' : 'a')}: ${other}·n points ${fmt(w.angle, 3)}° away from n. A repeated principal value leaves the other directions undetermined, so they are not compared one by one.`;
  }
  return 'Stress and strain are not coaxial (σε ≠ εσ).';
}

function Mohr3D({ T, p, isStress, cut }: { T: Mat; p: number[]; isStress: boolean; cut: { sn: number; tau: number } | null }) {
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
        {cut && (
          <g>
            <line x1={X(cut.sn)} y1={y0} x2={X(cut.sn)} y2={Y(cut.tau)} className="mohr-cut-line" />
            <circle cx={X(cut.sn)} cy={Y(cut.tau)} r={4} className="mohr-cut" />
            <text x={X(cut.sn) + 5} y={Y(cut.tau) + 12} className="mohr-text">
              cut
            </text>
          </g>
        )}
        <text x={W - 8} y={y0 - 5} textAnchor="end" className="mohr-text">
          {isStress ? 'σ' : 'ε'}
        </text>
        <text x={Math.min(Math.max(X(0) + 4, 6), W - 40)} y={14} className="mohr-text">
          {isStress ? '|τ|' : '|γ|/2'} ↑
        </text>
      </svg>
      <div className="mohr-read">
        {FACES.map((f, i) => `${f} face: ${fmt(faces[i].sn, 3, 1e-12)}, ${fmt(faces[i].tau, 3, 1e-12)}`).join(' · ')}
        {cut ? ` · cut: ${fmt(cut.sn, 3, 1e-12)}, ${fmt(cut.tau, 3, 1e-12)}` : ''} {unit}
      </div>
    </div>
  );
}
