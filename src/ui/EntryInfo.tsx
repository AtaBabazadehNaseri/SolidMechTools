import type { Mat, PlaneMode } from '../mechanics';
import type { MatrixId, Selection } from '../app/lab';
import { STRAIN_TEX, STRESS_TEX, entryCategory, entryTex, fmt } from '../app/format';
import { isBlock, toDisplay } from './MatrixGrid';
import { Tex } from './Tex';

interface Props {
  selection: Selection | null;
  mode: PlaneMode;
  S2: Mat;
  C2: Mat;
  onRun: () => void;
  /** 2D data: no 3D matrix lies behind the entries. */
  planeData?: boolean;
}

const CATEGORY_NAME = {
  diagonal: 'direct term',
  'normal-normal': 'normal–normal coupling',
  'normal-shear': 'normal–shear coupling',
  'shear-shear': 'shear–shear coupling',
} as const;

/** The other matrix's cofactor expression for entry (i, j): X_ij = (−1)^{i+j} M_ji(Y) / det Y. */
function cofactorParts(other: MatrixId, Y: Mat, i: number, j: number) {
  const r = [0, 1, 2].filter((k) => k !== j);
  const c = [0, 1, 2].filter((k) => k !== i);
  let a: [number, number] = [r[0], c[0]];
  let b: [number, number] = [r[1], c[1]];
  let cc: [number, number] = [r[0], c[1]];
  let d: [number, number] = [r[1], c[0]];
  if ((i + j) % 2 === 1) [a, b, cc, d] = [cc, d, a, b];
  const t = (p: [number, number]) => entryTex(other, p[0], p[1]);
  const v = (p: [number, number]) => toDisplay(other, Y[p[0]][p[1]]);
  return {
    tex: `\\frac{${t(a)}\\,${t(b)} \\;-\\; ${t(cc)}\\,${t(d)}}{\\det \\bar{\\mathbf{${other}}}}`,
    term1: v(a) * v(b),
    term2: v(cc) * v(d),
    labels: [`${t(a)}${t(b)}`, `${t(cc)}${t(d)}`],
  };
}

const OUT_COND = {
  stress: 'the out-of-plane stresses are zero (plane stress)',
  strain: 'the out-of-plane strains are zero (plane strain)',
};

export function EntryInfo({ selection, mode, S2, C2, onRun, planeData = false }: Props) {
  if (!selection) {
    return (
      <div className="entry-info empty">
        Click any entry of <Tex>{'\\bar{\\mathbf{C}}'}</Tex> or <Tex>{'\\bar{\\mathbf{S}}'}</Tex> to see what it means and run the
        one test that isolates it.
      </div>
    );
  }
  const { matrix, i, j } = selection;
  const cat = entryCategory(i, j);
  const sym = entryTex(matrix, i, j);
  const isS = matrix === 'S';
  const M = isS ? S2 : C2;
  const value = toDisplay(matrix, M[i][j]);
  const zeroTol = 1e-9 * Math.max(...M.flat().map((v) => Math.abs(toDisplay(matrix, v))));
  // KaTeX has no glyphs for Unicode superscripts, so units inside TeX use TeX markup.
  const unitTex = isS ? '\\mathrm{TPa}^{-1}' : '\\mathrm{GPa}';
  const other: MatrixId = isS ? 'C' : 'S';
  const cof = cofactorParts(other, isS ? C2 : S2, i, j);
  const unit2 = isS ? 'GPa²' : 'TPa⁻²';

  return (
    <div className="entry-info">
      <div className="entry-head">
        <Tex>{`${sym} = ${fmt(value, 4, zeroTol).replace(/−/g, '-')}\\ ${unitTex}`}</Tex>
        <span className={`tag cat-${cat}`}>{CATEGORY_NAME[cat]}</span>
      </div>

      {isS ? (
        <p>
          <b>Defining test (traction-controlled):</b> apply <Tex>{STRESS_TEX[j]}</Tex> alone; the other in-plane tractions are
          zero and {OUT_COND[mode]}. <Tex>{sym}</Tex> is the <Tex>{STRAIN_TEX[i]}</Tex> produced per unit{' '}
          <Tex>{STRESS_TEX[j]}</Tex>.
        </p>
      ) : (
        <p>
          <b>Defining test (displacement-controlled):</b> prescribe <Tex>{STRAIN_TEX[j]}</Tex> with the other in-plane strains held
          at zero; {OUT_COND[mode]}. <Tex>{sym}</Tex> is the <Tex>{STRESS_TEX[i]}</Tex> required per unit <Tex>{STRAIN_TEX[j]}</Tex>.
        </p>
      )}
      {i !== j && (
        <p className="muted small">
          By symmetry (a strain-energy potential exists) it is also the <Tex>{isS ? STRAIN_TEX[j] : STRESS_TEX[j]}</Tex> per unit{' '}
          <Tex>{isS ? STRESS_TEX[i] : STRAIN_TEX[i]}</Tex> in the same kind of test.
        </p>
      )}

      <p className="entry-meaning">{meaning(selection, mode, S2, C2, planeData)}</p>

      <details className="entry-cofactor">
        <summary>
          In terms of <Tex>{`\\bar{\\mathbf{${other}}}`}</Tex>
        </summary>
        <Tex display>{`${sym} = ${cof.tex}`}</Tex>
        <div className="muted small">
          <Tex>{cof.labels[0]}</Tex> = {fmt(cof.term1, 4)} {unit2}, &nbsp; <Tex>{cof.labels[1]}</Tex> = {fmt(cof.term2, 4)} {unit2}.
          One entry of <Tex>{`\\bar{\\mathbf{${matrix}}}`}</Tex> depends on four entries of <Tex>{`\\bar{\\mathbf{${other}}}`}</Tex>{' '}
          and, through the determinant, on all six.
        </div>
      </details>

      <button className="run" onClick={onRun}>
        Run this test on the specimen
      </button>
    </div>
  );
}

function meaning({ matrix, i, j }: Selection, mode: PlaneMode, S2: Mat, C2: Mat, planeData: boolean): string {
  const cat = entryCategory(i, j);
  const lo = Math.min(i, j);
  const hi = Math.max(i, j);
  const origin = planeData
    ? `This material was entered as 2D ${mode === 'stress' ? 'plane-stress' : 'plane-strain'} data: C̄ and S̄ are inverses of each other, with no 3D matrix behind them.`
    : isBlock(matrix, mode)
    ? `In ${mode === 'stress' ? 'plane stress' : 'plane strain'} this entry equals the corresponding 3D ${matrix} entry.`
    : `In ${mode === 'stress' ? 'plane stress' : 'plane strain'} this matrix is reduced: it is the inverse of the other matrix, not a block of the 3D ${matrix}.`;
  if (matrix === 'S') {
    const base =
      cat === 'diagonal'
        ? ['S̄₁₁ = 1/E: the free axial compliance (Eₓ in plane stress).', 'S̄₂₂: the free transverse compliance.', 'S̄₆₆ = 1/Gₓᵧ: the free shear compliance.'][i]
        : cat === 'normal-normal'
          ? 'Poisson-type coupling: S̄₁₂/S̄₁₁ = −ν. This compliance coefficient, not C̄₁₂, sets the lateral contraction of a free specimen.'
          : lo === 0 && hi === 2
            ? 'Extension–shear coupling: a free specimen pulled along x shears by γxy = S̄₁₆ σxx. It vanishes when x and y are symmetry axes of the material.'
            : 'Extension–shear coupling: a free specimen pulled along y shears by γxy = S̄₂₆ σyy. It vanishes when x and y are symmetry axes of the material.';
    return `${base} ${origin}`;
  }
  if (cat === 'diagonal') {
    const ratio = C2[i][i] * S2[i][i];
    return `Constrained stiffness. It is always at least the free stiffness 1/S̄${['₁₁', '₂₂', '₆₆'][i]}; here it is ${fmt(ratio, 4)}× larger, because the other two in-plane strains are held at zero instead of being free. ${origin}`;
  }
  if (cat === 'normal-normal')
    return `The lateral stress needed to stop the specimen contracting. It is not a Poisson's ratio, which is a compliance ratio (ν = −S̄₁₂/S̄₁₁). ${origin}`;
  return `The shear stress needed to keep the specimen from shearing while it is stretched. C̄₁₆ = 0 does not mean a free specimen will not shear: that is decided by S̄₁₆, which also contains a C̄₁₂C̄₂₆ path. ${origin}`;
}
