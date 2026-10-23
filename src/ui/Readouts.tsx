import type { Control } from '../mechanics';
import { type Action, type LabDerived, type LabState, constraintLadder } from '../app/lab';
import { STRAIN_TEX, STRESS_TEX, fmt, toGPa, toMilli } from '../app/format';
import { Tex } from './Tex';

interface Props {
  state: LabState;
  derived: LabDerived;
  dispatch: (a: Action) => void;
  /** The constraint ladder; a guide can hold it back. */
  ladder?: boolean;
}

const OOP_STRESS = ['\\sigma_{zz}', '\\tau_{yz}', '\\tau_{xz}'];
const OOP_STRAIN = ['\\varepsilon_{zz}', '\\gamma_{yz}', '\\gamma_{xz}'];

export function Readouts({ state, derived, dispatch, ladder = true }: Props) {
  const { response, out, energy, constants: k } = derived;
  const pin = state.pinned;
  // 2D data: the out-of-plane block is a placeholder and is never shown.
  const plane = derived.cls.dimension === 2;
  const isPS = state.mode === 'stress';
  const sTol = 1e-9 * Math.max(...response.stress.map(Math.abs), ...out.stress.map(Math.abs), 1e-300);
  const eTol = 1e-9 * Math.max(...response.strain.map(Math.abs), ...out.strain.map(Math.abs), 1e-300);

  return (
    <section className="panel readouts">
      <h2>Response</h2>
      <table className="state-table">
        <thead>
          <tr>
            <th />
            <th>σ (MPa)</th>
            {pin && <th className="pinned-col">pinned</th>}
            <th>ε (10⁻³)</th>
            {pin && <th className="pinned-col">pinned</th>}
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((i) => {
            const applied = state.load.control[i] === 'stress';
            return (
              <tr key={i}>
                <th>
                  <Tex>{STRESS_TEX[i]}</Tex> / <Tex>{STRAIN_TEX[i]}</Tex>
                </th>
                <td className={applied ? 'val applied' : 'val reaction'}>
                  {fmt(response.stress[i], 4, sTol)}
                  <span className="role">{applied ? 'prescribed' : 'reaction'}</span>
                </td>
                {pin && <td className="val pinned-col">{fmt(pin.response.stress[i], 4, sTol)}</td>}
                <td className={applied ? 'val' : 'val held'}>
                  {fmt(toMilli(response.strain[i]), 4, toMilli(eTol))}
                  <span className="role">{applied ? 'response' : 'prescribed'}</span>
                </td>
                {pin && <td className="val pinned-col">{fmt(toMilli(pin.response.strain[i]), 4, toMilli(eTol))}</td>}
              </tr>
            );
          })}
          {!plane && [0, 1, 2].map((a) => (
            <tr key={a} className="oop">
              <th>
                <Tex>{OOP_STRESS[a]}</Tex> / <Tex>{OOP_STRAIN[a]}</Tex>
              </th>
              <td className={isPS ? 'val muted' : 'val reaction'}>
                {isPS ? '0' : fmt(out.stress[a], 4, sTol)}
                <span className="role">{isPS ? 'plane stress' : 'reaction'}</span>
              </td>
              {pin && <td className="val pinned-col">{isPS ? '' : fmt(pin.out.stress[a], 4, sTol)}</td>}
              <td className={isPS ? 'val' : 'val muted'}>
                {isPS ? fmt(toMilli(out.strain[a]), 4, toMilli(eTol)) : '0'}
                <span className="role">{isPS ? 'response' : 'plane strain'}</span>
              </td>
              {pin && <td className="val pinned-col">{isPS ? fmt(toMilli(pin.out.strain[a]), 4, toMilli(eTol)) : ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {plane && <p className="hint oop-note">Out-of-plane components are not available for 2D data: they need the out-of-plane constants.</p>}
      <div className="energy">
        Strain energy density <Tex>{'W = \\tfrac12\\,\\boldsymbol{\\sigma}\\cdot\\boldsymbol{\\varepsilon}'}</Tex> = <b>{fmt(energy * 1000, 4)}</b> kJ/m³
      </div>

      {!plane && <FullTensors state={state} derived={derived} />}

      {ladder && <ConstraintLadder state={state} derived={derived} dispatch={dispatch} />}

      {!plane && (
      <details className="constants-box">
        <summary>3D engineering constants read in specimen axes</summary>
        <div className="constants">
          <Const t="E_x" v={fmt(toGPa(k.Ex), 4)} u="GPa" />
          <Const t="E_y" v={fmt(toGPa(k.Ey), 4)} u="GPa" />
          <Const t="G_{xy}" v={fmt(toGPa(k.Gxy), 4)} u="GPa" />
          <Const t="\nu_{xy}" v={fmt(k.nuxy, 4, 1e-12)} />
          <Const t="\nu_{yx}" v={fmt(k.nuyx, 4, 1e-12)} />
          <Const t="\eta_{xy,x}" v={fmt(k.etaxy_x, 4, 1e-12)} />
          <Const t="\eta_{xy,y}" v={fmt(k.etaxy_y, 4, 1e-12)} />
          <Const t="\nu_{xz}" v={fmt(k.nuxz, 4, 1e-12)} />
          <Const t="\nu_{yz}" v={fmt(k.nuyz, 4, 1e-12)} />
        </div>
        <p className="hint">
          Uniaxial 3D stress tests along the specimen axes: <Tex>{'\\nu_{xy} = -\\varepsilon_{yy}/\\varepsilon_{xx}'}</Tex>,{' '}
          <Tex>{'\\eta_{xy,x} = \\gamma_{xy}/\\varepsilon_{xx}'}</Tex> under <Tex>{'\\sigma_{xx}'}</Tex> alone. They are compliance ratios
          and do not depend on the 2D mode.
        </p>
      </details>
      )}
    </section>
  );
}

function Const({ t, v, u }: { t: string; v: string; u?: string }) {
  return (
    <div className="const">
      <Tex>{t}</Tex>
      <span className="const-v">
        {v}
        {u && <span className="unit"> {u}</span>}
      </span>
    </div>
  );
}

const texNum = (v: number, tol: number) => fmt(v, 4, tol).replace(/−/g, '-');

/** Full 3D tensors (tensor shear εij = γij/2) and the Voigt vectors (engineering shear). */
function FullTensors({ state, derived }: { state: LabState; derived: LabDerived }) {
  const { response: r, out } = derived;
  const [sxx, syy, sxy] = r.stress;
  const [szz, syz, sxz] = out.stress;
  const [exx, eyy, gxy] = r.strain.map((v) => v * 1e3);
  const [ezz, gyz, gxz] = out.strain.map((v) => v * 1e3);
  const sTol = 1e-9 * Math.max(...[sxx, syy, sxy, szz, syz, sxz].map(Math.abs), 1e-300);
  const eTol = 1e-9 * Math.max(...[exx, eyy, gxy, ezz, gyz, gxz].map(Math.abs), 1e-300);
  const s = (v: number) => texNum(v, sTol);
  const e = (v: number) => texNum(v, eTol);
  const mat = (rows: string[][]) => `\\begin{bmatrix} ${rows.map((row) => row.join(' & ')).join(' \\\\ ')} \\end{bmatrix}`;
  const sigma = mat([[s(sxx), s(sxy), s(sxz)], [s(sxy), s(syy), s(syz)], [s(sxz), s(syz), s(szz)]]);
  const eps = mat([[e(exx), e(gxy / 2), e(gxz / 2)], [e(gxy / 2), e(eyy), e(gyz / 2)], [e(gxz / 2), e(gyz / 2), e(ezz)]]);
  const vec = (xs: string[]) => `\\begin{bmatrix} ${xs.join(' & ')} \\end{bmatrix}^{\\mathsf T}`;
  return (
    <details className="tensors">
      <summary>Full 3D stress and strain tensors</summary>
      <div className="tensor-row">
        <Tex display>{`\\boldsymbol\\sigma = ${sigma}\\ \\text{MPa}`}</Tex>
        <Tex display>{`\\boldsymbol\\varepsilon = ${eps}\\times 10^{-3}`}</Tex>
      </div>
      <div className="voigt-row">
        <Tex display>{`\\boldsymbol\\sigma_V = ${vec([s(sxx), s(syy), s(szz), s(syz), s(sxz), s(sxy)])}`}</Tex>
        <Tex display>{`\\boldsymbol\\varepsilon_V = ${vec([e(exx), e(eyy), e(ezz), e(gyz), e(gxz), e(gxy)])}`}</Tex>
      </div>
      <p className="hint">
        Rows and columns x, y, z. The tensor uses ε<sub>ij</sub> = γ<sub>ij</sub>/2; the Voigt vectors (order xx, yy, zz, yz, xz, xy) use
        engineering shear γ, so that σ<sub>V</sub>·ε<sub>V</sub> = σ : ε. In {state.mode === 'stress' ? 'plane stress the zz, yz, xz stresses are zero' : 'plane strain the zz, yz, xz strains are zero'}.
      </p>
    </details>
  );
}

const CONTROL_WORD: Record<Control, string> = { stress: 'Traction', strain: 'Displacement' };

/**
 * dσxx/dεxx for each way of treating the other two in-plane components, using
 * the same words and colours as the boundary-condition panel.
 */
function ConstraintLadder({ state, derived, dispatch }: Props) {
  const rungs = constraintLadder(derived.C2);
  const lo = rungs[0].stiffness;
  const hi = rungs[3].stiffness;
  const pos = (v: number) => (hi > lo ? (100 * (v - lo)) / (hi - lo) : 0);
  const cur = rungs.findIndex((r) => r.yy === state.load.control[1] && r.xy === state.load.control[2]);
  const same = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(a, b);
  const yyNoEffect = same(rungs[1].stiffness, rungs[0].stiffness) && same(rungs[3].stiffness, rungs[2].stiffness);
  const xyNoEffect = same(rungs[2].stiffness, rungs[0].stiffness) && same(rungs[3].stiffness, rungs[1].stiffness);
  const apply = (yy: Control, xy: Control) => {
    if (state.load.control[1] !== yy) dispatch({ type: 'control', i: 1, control: yy });
    if (state.load.control[2] !== xy) dispatch({ type: 'control', i: 2, control: xy });
  };
  const chip = (c: Control) => <span className={`bc-chip bc-${c}`}>{CONTROL_WORD[c]}</span>;

  return (
    <div className="ladder">
      <h3>
        Apparent axial stiffness dσxx/dεxx = <span className="ladder-now">{fmt(toGPa(rungs[cur].stiffness), 4)} GPa</span>
        {state.pinned && <span className="muted small"> (pinned {fmt(toGPa(state.pinned.apparentModulus), 4)})</span>}
      </h3>
      <div className="ladder-track">
        {rungs.map((r, k) => (
          <span key={k} className={k === cur ? 'ladder-mark on' : 'ladder-mark'} style={{ left: `${pos(r.stiffness)}%` }} />
        ))}
      </div>
      <table className="ladder-table">
        <thead>
          <tr>
            <th>yy</th>
            <th>xy</th>
            <th>dσxx/dεxx</th>
          </tr>
        </thead>
        <tbody>
          {rungs.map((r, k) => (
            <tr key={k} className={k === cur ? 'on' : ''} onClick={() => apply(r.yy, r.xy)} title="Apply these conditions (values start at zero)">
              <td>{chip(r.yy)}</td>
              <td>{chip(r.xy)}</td>
              <td className="val">
                {fmt(toGPa(r.stiffness), 4)} GPa
                {k === 0 && (
                  <span className="muted">
                    {' '}
                    = <Tex>{'1/\\bar S_{11}'}</Tex>
                  </span>
                )}
                {k === 3 && (
                  <span className="muted">
                    {' '}
                    = <Tex>{'\\bar C_{11}'}</Tex>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(yyNoEffect || xyNoEffect) && (
        <p className="hint">
          {xyNoEffect && 'Holding γxy changes nothing here: shear is not coupled to stretching along x (S̄₁₆ = C̄₁₆ = 0). '}
          {yyNoEffect && 'Holding εyy changes nothing here: there is no Poisson coupling to y (S̄₁₂ = C̄₁₂ = 0). '}
          That is why the mixed rows coincide with an end.
        </p>
      )}
      <details className="ladder-more">
        <summary>How these stiffnesses differ</summary>
        <p>
          Each row is the slope you would measure while driving εxx (by traction or by displacement, it does not matter which), with
          the other two in-plane components either <b>traction-controlled</b> (their stress stays fixed, so they deform freely) or{' '}
          <b>displacement-controlled</b> (their strain stays fixed, so a reaction develops). The highlighted row is the current boundary
          condition; click a row to apply it.
        </p>
        <p>
          Every hold adds a constraint, so the stiffness can only rise: from <Tex>{'1/\\bar S_{11}'}</Tex> (everything free; the Young’s
          modulus in plane stress) to <Tex>{'\\bar C_{11}'}</Tex> (everything held). A row lands strictly in between only when one
          component is held and the material couples εxx to both εyy and γxy, for example an off-axis composite.
        </p>
        <p>
          It is a slope. It equals σxx/εxx only when the other prescribed values are zero.
        </p>
      </details>
    </div>
  );
}
