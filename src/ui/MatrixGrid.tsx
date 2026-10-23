import type { Mat, PlaneConstants, PlaneMode } from '../mechanics';
import type { MatrixId, Selection } from '../app/lab';
import { STRAIN_TEX, STRESS_TEX, entryCategory, fmt, toGPa, toPerTPa } from '../app/format';
import { Tex } from './Tex';

interface Props {
  id: MatrixId;
  mode: PlaneMode;
  M: Mat;
  pinned: Mat | null;
  /** Column j is active when its input (σ_j for S̄, ε_j for C̄) is currently nonzero. */
  activeCols: boolean[];
  selected: Selection | null;
  onSelect: (s: Selection) => void;
  /** 2D data: there is no 3D matrix the entries could be a block of. */
  planeData?: boolean;
}

export const toDisplay = (id: MatrixId, v: number) => (id === 'C' ? toGPa(v) : toPerTPa(v));

/** Whether this 2D matrix is the 3D block (true) or the inverse of the other one's block ("reduced"). */
export const isBlock = (id: MatrixId, mode: PlaneMode) => (id === 'S') === (mode === 'stress');

export function MatrixGrid({ id, mode, M, pinned, activeCols, selected, onSelect, planeData = false }: Props) {
  const D = M.map((row) => row.map((v) => toDisplay(id, v)));
  const P = pinned?.map((row) => row.map((v) => toDisplay(id, v)));
  const maxAbs = Math.max(...D.flat().map(Math.abs));
  const zeroTol = 1e-9 * maxAbs;
  const colTex = id === 'C' ? STRAIN_TEX : STRESS_TEX;
  const rowTex = id === 'C' ? STRESS_TEX : STRAIN_TEX;
  const block = isBlock(id, mode);
  const other = id === 'C' ? 'S' : 'C';

  return (
    <div className="matrix">
      <div className="matrix-title">
        <Tex>{id === 'C' ? '\\boldsymbol{\\sigma} = \\bar{\\mathbf{C}}\\,\\boldsymbol{\\varepsilon}' : '\\boldsymbol{\\varepsilon} = \\bar{\\mathbf{S}}\\,\\boldsymbol{\\sigma}'}</Tex>
        <span className="matrix-sub">{id === 'C' ? 'stiffness · GPa' : 'compliance · TPa⁻¹'}</span>
        {!planeData && (
        <span className={block ? 'origin block' : 'origin reduced'} title={block ? `Entries equal the 3D ${id} entries` : `Inverse of the in-plane block of the 3D ${other}; not the in-plane block of the 3D ${id}`}>
          {block ? `= 3D ${id} entries` : `reduced = ${other}̄⁻¹`}
        </span>
        )}
      </div>
      <table>
        <thead>
          <tr>
            <th />
            {colTex.map((t, j) => (
              <th key={j} className={activeCols[j] ? 'col-active' : ''}>
                <Tex>{t}</Tex>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {D.map((row, i) => (
            <tr key={i}>
              <th>
                <Tex>{rowTex[i]}</Tex>
              </th>
              {row.map((v, j) => {
                const isSel = selected?.matrix === id && selected.i === i && selected.j === j;
                const isMirror = selected?.matrix === id && selected.i === j && selected.j === i && i !== j;
                const was = P?.[i][j];
                const changed = was !== undefined && Math.abs(was - v) > 1e-6 * maxAbs;
                const cls = ['cell', `cat-${entryCategory(i, j)}`, activeCols[j] ? 'active' : '', isSel ? 'selected' : '', isMirror ? 'mirror' : ''].join(' ');
                return (
                  <td key={j}>
                    <button className={cls} onClick={() => onSelect({ matrix: id, i, j })}>
                      <span className="cell-value">{fmt(v, 4, zeroTol)}</span>
                      {changed && <span className="cell-was">was {fmt(was!, 4, zeroTol)}</span>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** What the colours and outlines in the matrices mean. */
export function MatrixLegend() {
  return (
    <details className="matrix-legend">
      <summary>Legend</summary>
      <ul>
        <li>
          <span className="swatch cat-diagonal" /> direct terms (diagonal)
        </li>
        <li>
          <span className="swatch cat-normal-normal" /> normal–normal coupling (12)
        </li>
        <li>
          <span className="swatch cat-normal-shear" /> normal–shear coupling (16, 26)
        </li>
        <li>
          <span className="swatch outline-active" /> outlined column: it carries the current state (in S̄, columns times nonzero
          stresses; in C̄, columns times nonzero strains)
        </li>
        <li>
          <span className="swatch outline-selected" /> selected entry; its symmetric partner gets a grey ring
        </li>
        <li>
          <span className="origin block">= 3D entries</span> the 2D matrix is a block of the 3D one;{' '}
          <span className="origin reduced">reduced</span> it is the inverse of the other matrix’s block
        </li>
        <li>“was …” under an entry: its value in the pinned state</li>
      </ul>
    </details>
  );
}

/**
 * Engineering constants of the current 2D compliance, in specimen axes: what
 * free (traction-controlled) 2D tests measure. η is the extension–shear coupling.
 */
export function PlaneConstantsStrip({ c, mode }: { c: PlaneConstants; mode: PlaneMode }) {
  const items: Array<[string, string, string]> = [
    ['E_x', fmt(toGPa(c.Ex), 4), 'GPa'],
    ['E_y', fmt(toGPa(c.Ey), 4), 'GPa'],
    ['G_{xy}', fmt(toGPa(c.Gxy), 4), 'GPa'],
    ['\\nu_{xy}', fmt(c.nuxy, 4, 1e-12), ''],
    ['\\eta_{xy,x}', fmt(c.etaxy_x, 4, 1e-12), ''],
    ['\\eta_{xy,y}', fmt(c.etaxy_y, 4, 1e-12), ''],
  ];
  return (
    <div
      className="plane-constants"
      title="Read from S̄ in the specimen axes: what free (traction-controlled) 2D tests measure. ν = −εyy/εxx and η = γxy/εxx under σxx alone; η is the extension–shear coupling."
    >
      <span className="pc-title">2D constants ({mode === 'stress' ? 'plane stress' : 'plane strain'}, specimen axes)</span>
      {items.map(([t, v, u]) => (
        <span key={t} className="pc-item">
          <Tex>{t}</Tex> <span className="pc-v">{v}</span>
          {u && <span className="unit"> {u}</span>}
        </span>
      ))}
    </div>
  );
}
