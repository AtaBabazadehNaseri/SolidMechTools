import { strainOnLine, strainPrincipal, stressPrincipal, tractionOnCut } from '../mechanics';
import { type Action, type LabDerived, type LabState, kelvinLoad } from '../app/lab';
import { fmt, toGPa, toMilli } from '../app/format';
import { Tex } from './Tex';

interface Props {
  state: LabState;
  derived: LabDerived;
  dispatch: (a: Action) => void;
}

const deg = (rad: number) => (rad * 180) / Math.PI;
/** Smallest angle between two axes (undirected lines), degrees in [0, 90]. */
function axisGap(a: number, b: number): number {
  let d = (deg(a - b) % 180 + 180) % 180;
  if (d > 90) d = 180 - d;
  return d;
}

export function PrincipalPanel({ state, derived, dispatch }: Props) {
  const { principal, response, R, coaxial, kelvin2D } = derived;
  const ps = principal.stress;
  const pe = principal.strain;
  const a1: [number, number] = [R[0][0], R[1][0]];
  const a1inPlane = Math.hypot(...a1) > 0.3;
  const matDeg = deg(Math.atan2(a1[1], a1[0]));
  const gap = !ps.degenerate && !pe.degenerate ? axisGap(ps.angle, pe.angle) : null;
  const unloaded = [...response.stress, ...response.strain].every((v) => v === 0);
  const isStress = state.mohr === 'stress';

  return (
    <section className="panel principal-panel">
      <h2>Principal axes and Mohr's circle</h2>
      <div className="principal-grid">
        <div>
          <dl className="axes-list">
            <dt className="row-stress">Principal stress</dt>
            <dd>
              σ₁ = {fmt(ps.max, 4)}, σ₂ = {fmt(ps.min, 4)} MPa
              <br />
              {ps.degenerate ? 'every direction is principal' : `σ₁ at ${fmt(deg(ps.angle), 3)}°`}
            </dd>
            <dt className="row-strain">Principal strain</dt>
            <dd>
              ε₁ = {fmt(toMilli(pe.max), 4)}, ε₂ = {fmt(toMilli(pe.min), 4)} ×10⁻³
              <br />
              {pe.degenerate ? 'every direction is principal' : `ε₁ at ${fmt(deg(pe.angle), 3)}°`}
            </dd>
            <dt className="row-material">Material axis 1</dt>
            <dd>{a1inPlane ? `at ${fmt(matDeg, 3)}° (in-plane projection)` : 'out of the specimen plane'}</dd>
          </dl>
          <p className={gap !== null && gap > 0.05 ? 'coax warn' : 'coax'}>
            {unloaded
              ? 'Nothing is loaded yet.'
              : gap === null
                ? `The ${ps.degenerate ? 'stress' : 'strain'} is equi-biaxial, so every in-plane direction is principal for it and coaxiality holds trivially.`
                : gap <= 0.05
                  ? 'Stress and strain are coaxial: their principal axes coincide.'
                  : `Stress and strain are not coaxial: their principal axes differ by ${fmt(gap, 3)}°.`}
          </p>
          <p className="hint">
            {coaxial.all
              ? 'In this plane the material is isotropic, so every in-plane stress state, uniaxial or not, produces strain coaxial with it. (That holds for in-plane isotropy alone; the material itself may be anisotropic, as on copper’s (111) plane.)'
              : `Uniaxial stress gives coaxial strain only along ${coaxial.angles.map((a) => `${fmt(deg(a), 3)}°`).join(', ')}: the directions where E(φ) is stationary (marked on the polar plot).`}
          </p>
        </div>
        <div>
          <div className="seg small-seg">
            <button className={isStress ? 'on' : ''} onClick={() => dispatch({ type: 'mohr', kind: 'stress' })}>
              stress
            </button>
            <button className={!isStress ? 'on' : ''} onClick={() => dispatch({ type: 'mohr', kind: 'strain' })}>
              strain
            </button>
          </div>
          <Mohr state={state} stress={response.stress} strain={response.strain} />
        </div>
      </div>

      <h3>Stiffness eigenmodes (Kelvin modes of C̄)</h3>
      <p className="hint">
        The stiffness tensor has no principal axes in the vector sense; its principal objects are strain modes for which{' '}
        <Tex>{'\\boldsymbol\\sigma = \\lambda\\,\\boldsymbol\\varepsilon'}</Tex>. In each mode stress and strain are coaxial. Apply one
        and check.
      </p>
      <div className="kelvin-row">
        {kelvin2D.map((m, k) => (
          <button key={k} className="kelvin-mode" onClick={() => dispatch({ type: 'loadCase', load: kelvinLoad(m, state.scales) })}>
            <ModeThumb strain={m.strain} />
            <span>
              λ{['₁', '₂', '₃'][k]} = {fmt(toGPa(m.modulus), 4)} GPa
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ModeThumb({ strain }: { strain: number[] }) {
  const p = strainPrincipal(strain);
  const k = 0.32 / Math.max(Math.abs(p.max), Math.abs(p.min), 1e-300);
  const [exx, eyy, gxy] = strain.map((v) => v * k);
  const h = 16;
  const m = ([x, y]: [number, number]): [number, number] => [x + exx * x + 0.5 * gxy * y, -(y + 0.5 * gxy * x + eyy * y)];
  const corners: Array<[number, number]> = [[-h, -h], [h, -h], [h, h], [-h, h]];
  return (
    <svg viewBox="-28 -28 56 56" className="mode-thumb" aria-hidden>
      <rect x={-h} y={-h} width={2 * h} height={2 * h} className="reference" />
      <polygon points={corners.map(m).map((q) => q.join(',')).join(' ')} className="deformed" />
    </svg>
  );
}

function Mohr({ state, stress, strain }: { state: LabState; stress: number[]; strain: number[] }) {
  const isStress = state.mohr === 'stress';
  const alpha = (state.cutDeg * Math.PI) / 180;
  // Tensor components: stress (σxx, σyy, τxy) or strain (εxx, εyy, γxy/2), in display units.
  const [xx, yy, xy] = isStress ? stress : [toMilli(strain[0]), toMilli(strain[1]), toMilli(strain[2]) / 2];
  const pr = isStress ? stressPrincipal(stress) : strainPrincipal(strain);
  const c = 0.5 * (xx + yy);
  const r = Math.hypot(0.5 * (xx - yy), xy);
  const cut = isStress ? tractionOnCut(stress, alpha) : strainOnLine(strain, alpha);
  const cutN = isStress ? cut.normal : toMilli(cut.normal);
  const cutS = isStress ? cut.shear : toMilli(cut.shear);
  // Round-off relative to the state's size prints as 0.
  const readTol = 1e-9 * Math.max(Math.abs(xx), Math.abs(yy), Math.abs(xy), 1e-300);

  const W = 220;
  const Hh = 180;
  const xmin = Math.min(0, c - r);
  const xmax = Math.max(0, c + r);
  const span = Math.max(xmax - xmin, 2 * r, 1e-12);
  const sc = Math.min((W - 30) / span, (Hh - 30) / Math.max(2 * r, 1e-12));
  const X = (v: number) => 15 + (v - xmin) * sc + ((W - 30) - (xmax - xmin) * sc) / 2;
  const Y = (tau: number) => Hh / 2 + tau * sc; // τ positive DOWN, so the point turns by 2α in the same sense as the cut

  const unitTxt = isStress ? 'MPa' : '×10⁻³';
  const nName = isStress ? 'σn' : 'εn';
  const sName = isStress ? 'τnt' : 'εnt';

  return (
    <div className="mohr">
      <svg viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label="Mohr's circle">
        <line x1={5} y1={Hh / 2} x2={W - 5} y2={Hh / 2} className="mohr-axis" />
        {X(0) >= 5 && X(0) <= W - 5 && <line x1={X(0)} y1={8} x2={X(0)} y2={Hh - 8} className="mohr-axis" />}
        <circle cx={X(c)} cy={Y(0)} r={Math.max(r * sc, 0.5)} className={`mohr-circle mohr-${state.mohr}`} />
        <line x1={X(xx)} y1={Y(xy)} x2={X(yy)} y2={Y(-xy)} className="mohr-diam" />
        <circle cx={X(xx)} cy={Y(xy)} r={3} className="mohr-pt" />
        <text x={X(xx) + 5} y={Y(xy) - 5} className="mohr-text">x face</text>
        <circle cx={X(yy)} cy={Y(-xy)} r={3} className="mohr-pt" />
        <text x={X(yy) + 5} y={Y(-xy) - 5} className="mohr-text">y face</text>
        <circle cx={X(isStress ? pr.max : toMilli(pr.max))} cy={Y(0)} r={2.5} className="mohr-princ" />
        <circle cx={X(isStress ? pr.min : toMilli(pr.min))} cy={Y(0)} r={2.5} className="mohr-princ" />
        {state.overlays.cut && (
          <>
            <line x1={X(c)} y1={Y(0)} x2={X(cutN)} y2={Y(cutS)} className="mohr-cut-line" />
            <circle cx={X(cutN)} cy={Y(cutS)} r={4} className="mohr-cut" />
          </>
        )}
        <text x={W - 8} y={Hh / 2 - 5} textAnchor="end" className="mohr-text">
          {isStress ? 'σ' : 'ε'}
        </text>
        <text x={X(0) + 4} y={Hh - 10} className="mohr-text">
          {isStress ? 'τ' : 'γ/2'} ↓
        </text>
      </svg>
      <div className="mohr-read">
        {state.overlays.cut ? (
          <>
            cut normal at {state.cutDeg}°: {nName} = {fmt(cutN, 4, readTol)}, {sName} = {fmt(cutS, 4, readTol)} {unitTxt}
          </>
        ) : (
          <>Turn on “Cut plane” over the specimen to probe any direction.</>
        )}
      </div>
    </div>
  );
}
