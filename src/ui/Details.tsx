import { IN_PLANE, type Mat, type PlaneMode, PRESETS, submatrix } from '../mechanics';
import { type LabDerived, type LabState, type MaterialDerived, numericalChecks } from '../app/lab';
import { fmt, toGPa, toPerTPa } from '../app/format';
import { Tex } from './Tex';
import { OtherForms } from './OtherForms';

const V6 = ['11', '22', '33', '23', '13', '12'];

function Grid6({ M, conv, title, shade }: { M: Mat; conv: (v: number) => number; title: string; shade: boolean }) {
  const D = M.map((r) => r.map(conv));
  const tol = 1e-9 * Math.max(...D.flat().map(Math.abs));
  const inPlane = (i: number) => (IN_PLANE as readonly number[]).includes(i);
  return (
    <div className="grid6">
      <div className="grid6-title">{title}</div>
      <table>
        <thead>
          <tr>
            <th />
            {V6.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {D.map((row, i) => (
            <tr key={i}>
              <th>{V6[i]}</th>
              {row.map((v, j) => (
                <td key={j} className={inPlane(i) && inPlane(j) ? (shade ? 'ip' : 'ip-not') : ''}>
                  {fmt(v, 4, tol)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Details({ state, derived, material, mode }: { state: LabState; derived: LabDerived; material: MaterialDerived; mode: PlaneMode }) {
  const { S6, C6, S2, C2 } = derived;
  const ps = mode === 'stress';
  const Cblock = submatrix(C6, IN_PLANE, IN_PLANE);
  const Sblock = submatrix(S6, IN_PLANE, IN_PLANE);
  const plane = derived.cls.dimension === 2;
  return (
    <section className="panel details">
      {state.space === '3d' ? (
        <details open>
          <summary>Kelvin moduli</summary>
          <div className="kelvin">
            Eigenvalues of the 3D C in Mandel form (GPa): {material.kelvin3D.map((k) => fmt(toGPa(k), 4)).join(', ')}. They describe the
            material itself, not its frame: rotating it moves every matrix entry but none of these.
          </div>
        </details>
      ) : plane ? (
        <details open>
          <summary>3D matrices</summary>
          <p className="hint">
            This material was entered as 2D data, which fixes only its in-plane behaviour. The 3D matrices, the out-of-plane response
            and the 3D Kelvin moduli need the out-of-plane constants; enter the material in 3D to see them.
          </p>
        </details>
      ) : (
      <details open>
        <summary>3D matrices in specimen axes</summary>
        <div className="grid6-row">
          <Grid6 M={S6} conv={toPerTPa} shade={ps} title={ps ? 'S (6×6), TPa⁻¹: shaded block = in-plane S̄' : 'S (6×6), TPa⁻¹: outlined block ≠ in-plane S̄'} />
          <Grid6 M={C6} conv={toGPa} shade={!ps} title={ps ? 'C (6×6), GPa: outlined block ≠ in-plane C̄' : 'C (6×6), GPa: shaded block = in-plane C̄'} />
        </div>
        <p className="hint">
          {ps ? (
            <>
              Plane stress takes the in-plane block of the <i>compliance</i>. The corresponding block of C is the plane-strain stiffness:
              C₁₁ = {fmt(toGPa(Cblock[0][0]), 4)} GPa, while C̄₁₁ = {fmt(toGPa(C2[0][0]), 4)} GPa. The difference is the stiffening from
              also holding εzz, γyz, γxz.
            </>
          ) : (
            <>
              Plane strain takes the in-plane block of the <i>stiffness</i>. The corresponding block of S is the plane-stress compliance:
              S₁₁ = {fmt(toPerTPa(Sblock[0][0]), 4)} TPa⁻¹, while S̄₁₁ = {fmt(toPerTPa(S2[0][0]), 4)} TPa⁻¹. The difference is the
              softening that would come from releasing εzz, γyz, γxz.
            </>
          )}
        </p>
        <div className="kelvin">
          <b>Kelvin moduli</b> (eigenvalues of the 3D C in Mandel form, GPa): {material.kelvin3D.map((k) => fmt(toGPa(k), 4)).join(', ')}. They
          describe the material itself, not its coordinate frame: rotate θ or change the section and every matrix entry moves, but
          these stay the same.
        </div>
      </details>
      )}

      <details>
        <summary>This material in other forms: matrices in any notation and units, and all its engineering constants</summary>
        <OtherForms state={state} derived={derived} />
      </details>

      <details>
        <summary>Equations, conventions and assumptions</summary>
        <div className="eqs">
          <Tex display>{'\\text{plane stress: } \\bar{\\mathbf S} = \\mathbf S_{[1,2,6]},\\ \\ \\bar{\\mathbf C} = \\bar{\\mathbf S}^{-1} \\neq \\mathbf C_{[1,2,6]} \\qquad \\text{plane strain: } \\bar{\\mathbf C} = \\mathbf C_{[1,2,6]},\\ \\ \\bar{\\mathbf S} = \\bar{\\mathbf C}^{-1} \\neq \\mathbf S_{[1,2,6]}'}</Tex>
          <Tex display>{'\\boldsymbol\\sigma_K = \\bar{\\mathbf S}_{KK}^{-1}\\big(\\boldsymbol\\varepsilon_K - \\bar{\\mathbf S}_{KP}\\,\\boldsymbol\\sigma_P\\big),\\qquad \\boldsymbol\\varepsilon_P = \\bar{\\mathbf S}_{PK}\\boldsymbol\\sigma_K + \\bar{\\mathbf S}_{PP}\\boldsymbol\\sigma_P'}</Tex>
          <Tex display>{'\\mathbf S\' = \\mathbf R_M\\,\\mathbf S\\,\\mathbf R_M^{\\mathsf T}\\ \\text{(Mandel form, } R_{M,ab} = \\mathbf B_a : \\mathbf R\\mathbf B_b\\mathbf R^{\\mathsf T})'}</Tex>
        </div>
        <ul className="assumptions">
          <li>Small-strain, linear, homogeneous elasticity. The response is the exact affine solution for a uniform specimen; no finite elements, no homogenization.</li>
          <li>
            The arrows are tractions t = σ·n on the faces, not “stress arrows”. In a homogeneous body, uniform face tractions produce a
            uniform stress equal to them, which is why prescribing the tractions is equivalent to prescribing the stress state here.
          </li>
          <li>
            Each in-plane component is traction-controlled (σ prescribed) or displacement-controlled (ε prescribed). Displacement
            control is an idealized uniform constraint, not a grip: real grips constrain only the specimen ends and give non-uniform
            fields (e.g. the off-axis tension test).
          </li>
          <li>Voigt order 11, 22, 33, 23, 13, 12 with engineering shear strain γ = 2ε. Rotations use the Mandel (√2) form, where they are orthogonal.</li>
          <li>The drawing uses x = X + k ε X with the symmetric strain only (no rigid rotation). k scales the display, never the computed stresses or strains.</li>
          <li>
            Things attached to the material (outline, grid, material lines and axes, the cut) are drawn through that magnified map,
            so they stay aligned with one another. Tensor directions (the cut normal n, tractions, principal axes) are drawn as they
            are. In small strain the two configurations coincide; any visible angle between a drawn cut and its normal is display
            magnification only.
          </li>
          <li>Material constants are defined from the lower Voigt index as the loaded direction: ν₁₂ = −ε₂/ε₁ under σ₁, η₁₂,₁ = γ₁₂/ε₁ under σ₁.</li>
          <li>Units: MPa internally; moduli and stiffness shown in GPa, compliance in TPa⁻¹, strains in 10⁻³.</li>
        </ul>
      </details>

      <details>
        <summary>Numerical checks</summary>
        <p className="hint">
          These check that the arithmetic satisfies the equations being solved. They say nothing about whether homogeneous linear
          elasticity is the right model for a given problem.
        </p>
        <table className="checks">
          <tbody>
            {numericalChecks(state, derived).map((c) => {
              const ok = c.limit === 0 ? c.value > 0 : c.value < c.limit;
              return (
                <tr key={c.name}>
                  <td className={ok ? 'ok' : 'bad'}>{ok ? '✓' : '✗'}</td>
                  <th>{c.name}</th>
                  <td className="val">{c.limit === 0 ? `${fmt(c.value, 4)} GPa` : fmt(c.value, 2, 0)}</td>
                  <td className="muted">{c.detail}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>

      <details>
        <summary>Material data sources</summary>
        <ul className="assumptions">
          {state.userPreset && (
            <li>
              <b>{state.userPreset.name}</b> (yours): {state.userPreset.source}
            </li>
          )}
          {PRESETS.map((p) => (
            <li key={p.id}>
              <b>{p.name}</b>
              {p.illustrative ? ' (illustrative)' : ''}: {p.source}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
