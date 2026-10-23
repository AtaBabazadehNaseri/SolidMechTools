import type { Mat } from '../mechanics';
import type { Selection } from '../app/lab';
import { STRAIN6_TEX, STRESS6_TEX, entryCategory, entryTex6, fmt, toGPa, toPerTPa } from '../app/format';
import { Tex } from './Tex';

const CATEGORY_NAME = {
  diagonal: 'direct term',
  'normal-normal': 'normal–normal coupling',
  'normal-shear': 'normal–shear coupling',
  'shear-shear': 'shear–shear coupling',
} as const;

const MEANING_S = {
  diagonal: 'A free compliance: 1/E along an axis for i ≤ 3, 1/G in a plane for i ≥ 4.',
  'normal-normal': 'Poisson-type coupling: S_ij = −ν_ij/E_i. It sets how much a free cube contracts sideways.',
  'normal-shear': 'Extension–shear coupling: a free cube stretched along one axis shears. It vanishes when the axes are symmetry axes.',
  'shear-shear': 'Shear–shear (Chentsov) coupling: shearing one plane also shears another.',
} as const;

const MEANING_C = {
  diagonal: 'A constrained stiffness: the stress needed per unit strain with every other strain held at zero. It is never below the free stiffness 1/S_ii.',
  'normal-normal': 'The lateral stress needed to stop the cube contracting sideways. It is not a Poisson ratio, which is a compliance ratio.',
  'normal-shear': 'The shear stress needed to keep the cube from shearing while it is stretched (or the reverse). A zero here does not mean a free cube will not shear: that is S’s job.',
  'shear-shear': 'The shear stress needed in one plane to keep it from shearing while another plane is sheared.',
} as const;

/** What one entry of the 3D C or S means, and the test that isolates it. */
export function EntryInfo3D({ selection, S6, C6, onRun }: { selection: Selection | null; S6: Mat; C6: Mat; onRun: () => void }) {
  if (!selection) {
    return (
      <div className="entry-info empty">
        Click any entry of <Tex>{'\\mathbf{C}'}</Tex> or <Tex>{'\\mathbf{S}'}</Tex> to see what it means and run the one test on the cube
        that isolates it.
      </div>
    );
  }
  const { matrix, i, j } = selection;
  const isS = matrix === 'S';
  const cat = entryCategory(i, j, 6);
  const sym = entryTex6(matrix, i, j);
  const M = isS ? S6 : C6;
  const show = (v: number) => (isS ? toPerTPa(v) : toGPa(v));
  const tol = 1e-9 * Math.max(...M.flat().map((v) => Math.abs(show(v))));
  const unitTex = isS ? '\\mathrm{TPa}^{-1}' : '\\mathrm{GPa}';
  return (
    <div className="entry-info">
      <div className="entry-head">
        <Tex>{`${sym} = ${fmt(show(M[i][j]), 4, tol).replace(/−/g, '-')}\\ ${unitTex}`}</Tex>
        <span className={`tag cat-${cat}`}>{CATEGORY_NAME[cat]}</span>
      </div>
      {isS ? (
        <p>
          <b>Defining test (traction-controlled):</b> apply <Tex>{STRESS6_TEX[j]}</Tex> alone, with every other face traction zero.{' '}
          <Tex>{sym}</Tex> is the <Tex>{STRAIN6_TEX[i]}</Tex> produced per unit <Tex>{STRESS6_TEX[j]}</Tex>.
        </p>
      ) : (
        <p>
          <b>Defining test (displacement-controlled):</b> prescribe <Tex>{STRAIN6_TEX[j]}</Tex> with every other strain held at zero.{' '}
          <Tex>{sym}</Tex> is the <Tex>{STRESS6_TEX[i]}</Tex> required per unit <Tex>{STRAIN6_TEX[j]}</Tex>.
        </p>
      )}
      <p className="entry-meaning">{isS ? MEANING_S[cat] : MEANING_C[cat]}</p>
      <button className="run" onClick={onRun}>
        Run this test on the cube
      </button>
    </div>
  );
}
