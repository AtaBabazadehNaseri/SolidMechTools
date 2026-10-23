import { useState } from 'react';
import { type Mat, type MatrixKind, IN_PLANE, type PlaneMode, SYMMETRY_CLASSES, embedPlane, inverse, paramsFromCompliance, planeCompliance, submatrix } from '../mechanics';
import type { LabDerived, LabState } from '../app/lab';
import { type Notation, type OrderId, type ShearConvention, type Unit, ORDER_COMPONENTS, ORDER_LABEL, SHEAR_LABEL, UNITS, fromStandard } from '../app/ownMaterial';
import { fmt } from '../app/format';
import { Tex } from './Tex';

type Frame = 'material' | 'specimen';

const MODE_NAME: Record<PlaneMode, string> = { stress: 'plane stress', strain: 'plane strain' };
const XYZ = (sym: string) => sym.replace(/_\{([^}]*)\}/g, (_m, sub: string) => `_{${sub.replace(/[123]/g, (d) => 'xyz'[Number(d) - 1])}}`);

/** Full-precision text for copying: tab-separated rows under a '#' header that records the notation. */
function asText(M: Mat, header: string): string {
  return `# ${header}\n${M.map((row) => row.map((v) => (v === 0 ? '0' : String(Number(v.toPrecision(10))))).join('\t')).join('\n')}`;
}

function MatrixBlock({ title, M, labels, header }: { title: string; M: Mat; labels: string[]; header: string }) {
  const [copied, setCopied] = useState(false);
  const tol = 1e-9 * Math.max(...M.flat().map(Math.abs));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText(M, header));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy:', asText(M, header));
    }
  };
  return (
    <div className="grid6">
      <div className="grid6-title">
        {title}{' '}
        <button className="mini" onClick={copy} title="Copy as tab-separated text, at full precision">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th />
            {labels.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {M.map((row, i) => (
            <tr key={i}>
              <th>{labels[i]}</th>
              {row.map((v, j) => (
                <td key={j}>{fmt(v, 4, tol)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The current material in every other form: 3D and 2D matrices in any notation and units, and its engineering constants. */
export function OtherForms({ state, derived }: { state: LabState; derived: LabDerived }) {
  const [frame, setFrame] = useState<Frame>('material');
  const [order, setOrder] = useState<OrderId>('voigt');
  const [shear, setShear] = useState<ShearConvention>('engineering');
  const [cUnit, setCUnit] = useState<Unit>('GPa');
  const [sUnit, setSUnit] = useState<Unit>('TPa');

  const cls = derived.cls;
  const plane = cls.dimension === 2;
  const S6 = frame === 'material' ? cls.build(state.params) : derived.S6;
  const frameName = frame === 'material' ? 'material axes 1, 2, 3' : `specimen axes x, y, z (θ = ${state.thetaDeg}°)`;
  const note = (kind: MatrixKind, size: number) =>
    `${kind === 'stiffness' ? `stiffness, ${cUnit}` : `compliance, 1/${sUnit}`}, order ${(size === 6 ? ORDER_COMPONENTS[order] : ['11', '22', '12']).join(' ')}, ${shear} shear, ${frameName}`;
  const n = (kind: MatrixKind): Notation => ({ kind, order, shear, unit: kind === 'stiffness' ? cUnit : sUnit });
  const labels = (size: number) => (size === 6 ? ORDER_COMPONENTS[order] : ['11', '22', '12']).map((c) => (frame === 'specimen' ? c.replace(/[123]/g, (d) => 'xyz'[Number(d) - 1]) : c));

  const modes: PlaneMode[] = plane ? [state.mode] : ['stress', 'strain'];
  const S2 = (mode: PlaneMode) => (plane ? submatrix(S6, IN_PLANE, IN_PLANE) : planeCompliance(S6, mode));
  const planeLabel = frame === 'material' ? (plane ? 'in material axes' : 'section ⟂ axis 3, in material axes') : 'specimen plane';

  // Engineering constants: all 21 for a 3D material, the 6 in-plane ones for 2D data.
  // Grouped: moduli, Poisson ratios, extension–shear, shear–shear.
  const group = (key: string) => (key.startsWith('E') || key.startsWith('G') ? 0 : key.startsWith('nu') ? 1 : key.startsWith('eta') ? 2 : 3);
  const cDefs = [...(plane ? SYMMETRY_CLASSES['plane-anisotropic'].params : SYMMETRY_CLASSES.triclinic.params)].sort((a, b) => group(a.key) - group(b.key));
  const constants = paramsFromCompliance(plane ? SYMMETRY_CLASSES['plane-anisotropic'] : SYMMETRY_CLASSES.triclinic, plane ? embedPlane(S2(state.mode)) : S6);
  const minor: Array<[string, number]> = [];
  for (const [i, j] of plane ? [[1, 2]] : [[1, 2], [1, 3], [2, 3]]) minor.push([`\\nu_{${j}${i}}`, (constants[`nu${i}${j}`] * constants[`E${j}`]) / constants[`E${i}`]]);
  const sym = (s: string) => (frame === 'specimen' ? XYZ(s) : s);

  return (
    <div className="other-forms">
      <div className="of-controls">
        <label className="field">
          <span>Frame</span>
          <select value={frame} onChange={(e) => setFrame(e.target.value as Frame)}>
            <option value="material">Material axes 1, 2, 3</option>
            <option value="specimen">Specimen axes x, y, z (current orientation)</option>
          </select>
        </label>
        {!plane && (
          <label className="field">
            <span>Component order</span>
            <select value={order} onChange={(e) => setOrder(e.target.value as OrderId)}>
              {(Object.keys(ORDER_LABEL) as OrderId[]).map((o) => (
                <option key={o} value={o}>
                  {ORDER_LABEL[o]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>Shear convention</span>
          <select value={shear} onChange={(e) => setShear(e.target.value as ShearConvention)}>
            {(Object.keys(SHEAR_LABEL) as ShearConvention[]).map((s) => (
              <option key={s} value={s}>
                {SHEAR_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Stiffness in</span>
          <select value={cUnit} onChange={(e) => setCUnit(e.target.value as Unit)}>
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Compliance in</span>
          <select value={sUnit} onChange={(e) => setSUnit(e.target.value as Unit)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                1/{u}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!plane && (
        <div className="grid6-row">
          <MatrixBlock title={`C (6×6), ${cUnit}`} M={fromStandard(inverse(S6), n('stiffness'))} labels={labels(6)} header={`C, ${note('stiffness', 6)}`} />
          <MatrixBlock title={`S (6×6), 1/${sUnit}`} M={fromStandard(S6, n('compliance'))} labels={labels(6)} header={`S, ${note('compliance', 6)}`} />
        </div>
      )}
      {modes.map((mode) => (
        <div key={mode} className="grid6-row">
          <MatrixBlock
            title={`C̄ (${MODE_NAME[mode]}, ${planeLabel}), ${cUnit}`}
            M={fromStandard(inverse(S2(mode)), n('stiffness'))}
            labels={labels(3)}
            header={`C-bar, ${MODE_NAME[mode]}, ${note('stiffness', 3)}`}
          />
          <MatrixBlock
            title={`S̄ (${MODE_NAME[mode]}, ${planeLabel}), 1/${sUnit}`}
            M={fromStandard(S2(mode), n('compliance'))}
            labels={labels(3)}
            header={`S-bar, ${MODE_NAME[mode]}, ${note('compliance', 3)}`}
          />
        </div>
      ))}

      <h3>Engineering constants ({frameName})</h3>
      {plane && state.mode === 'strain' && <p className="hint">Plane-strain data: these are the effective in-plane constants of the plane-strain compliance, not 3D constants.</p>}
      <div className="of-constants">
        {cDefs.filter((d) => group(d.key) <= 1).map((d) => (
          <div key={d.key} className="const" title={d.label}>
            <Tex>{sym(d.symbol)}</Tex>
            <span className="const-v">
              {d.kind === 'modulus' ? fmt(constants[d.key] / 1000, 4) : fmt(constants[d.key], 4, 1e-12)}
              {d.kind === 'modulus' && <span className="unit"> GPa</span>}
            </span>
          </div>
        ))}
        {minor.map(([s, v]) => (
          <div key={s} className="const" title="Minor Poisson ratio, ν_ji = ν_ij E_j / E_i: the ratio some datasheets and solvers quote">
            <Tex>{sym(s)}</Tex>
            <span className="const-v">{fmt(v, 4, 1e-12)}</span>
          </div>
        ))}
        {cDefs.filter((d) => group(d.key) >= 2).map((d) => (
          <div key={d.key} className="const" title={d.label}>
            <Tex>{sym(d.symbol)}</Tex>
            <span className="const-v">{fmt(constants[d.key], 4, 1e-12)}</span>
          </div>
        ))}
      </div>
      <p className="hint">
        Each constant is read from a test with one stress acting alone, for example ν₁₂ = −ε₂/ε₁ and η₁₂,₁ = γ₁₂/ε₁ under σ₁, or
        μ₁₃,₂₃ = γ₁₃/γ₂₃ under τ₂₃. The minor ratios ν₂₁, ν₃₁, ν₃₂ follow from ν_ij/E_i = ν_ji/E_j.
      </p>
    </div>
  );
}
