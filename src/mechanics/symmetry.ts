// Effective symmetry of a compliance, tested about the material axes, and the
// zero / tied pattern of each class's matrix.
//
// Elasticity tensors are even-order, so inversion is always a symmetry and the
// 32 crystallographic point groups collapse into 8 elastic symmetry classes.
// A class is identified by invariance under its generating rotations.

import { type Mat, maxAbs, maxAbsDiff } from './linalg';
import type { Params, SymmetryClassDef, SymmetryClassId } from './materials';
import { rotateComplianceVoigt, rotationAxisAngle } from './tensor';

export interface EffectiveSymmetry {
  classId: SymmetryClassId;
  /** Distinguished axis (0, 1, 2) for hexagonal, tetragonal, trigonal, monoclinic. */
  axis: number | null;
}

const E3: Array<[number, number, number]> = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const rot = (axis: number, deg: number) => rotationAxisAngle(E3[axis], (deg * Math.PI) / 180);

export function isInvariant(S: Mat, R: Mat, relTol = 1e-9): boolean {
  return maxAbsDiff(rotateComplianceVoigt(S, R), S) <= relTol * maxAbs(S);
}

export function effectiveSymmetry(S: Mat): EffectiveSymmetry {
  const inv = (...Rs: Mat[]) => Rs.every((R) => isInvariant(S, R));
  if (inv(rotationAxisAngle([1, 2, 3], 0.7), rotationAxisAngle([-2, 1, 0.5], 1.3))) return { classId: 'isotropic', axis: null };
  if (inv(rot(0, 90), rot(1, 90))) return { classId: 'cubic', axis: null };
  for (let k = 0; k < 3; k++) if (inv(rot(k, 41), rot(k, 109))) return { classId: 'hexagonal', axis: k };
  for (let k = 0; k < 3; k++) if (inv(rot(k, 90), rot((k + 1) % 3, 180))) return { classId: 'tetragonal', axis: k };
  for (let k = 0; k < 3; k++)
    if (inv(rot(k, 120)) && (inv(rot((k + 1) % 3, 180)) || inv(rot((k + 2) % 3, 180)))) return { classId: 'trigonal', axis: k };
  if (inv(rot(0, 180), rot(1, 180))) return { classId: 'orthotropic', axis: null };
  for (let k = 0; k < 3; k++) if (inv(rot(k, 180))) return { classId: 'monoclinic', axis: k };
  return { classId: 'triclinic', axis: null };
}

/** Generating operations of each class, in the axis convention of materials.ts. */
export const SYMMETRY_ELEMENTS: Record<SymmetryClassId, string[]> = {
  isotropic: ['Every rotation and reflection.'],
  cubic: ['4-fold rotation axes along 1, 2, 3', '3-fold axes along the cube diagonals ⟨111⟩'],
  hexagonal: [
    'Rotation by any angle about axis 3 (elastically, a 6-fold axis already implies this)',
    '2-fold axes perpendicular to axis 3',
  ],
  tetragonal: ['4-fold rotation axis along 3', '2-fold axes along 1 and 2'],
  trigonal: ['3-fold rotation axis along 3', '2-fold axis along 1'],
  orthotropic: ['2-fold axes (equivalently mirror planes) along 1, 2 and 3'],
  monoclinic: ['A single 2-fold axis (equivalently mirror plane) along 3'],
  triclinic: ['None beyond inversion, which every elastic tensor has'],
  'plane-isotropic': ['Rotation by any angle about the plane normal (in 2D, a 3-fold axis already implies this)'],
  'plane-square': ['4-fold rotation axis normal to the plane', 'Mirror lines along 1 and 2'],
  'plane-orthotropic': ['Mirror lines along 1 and 2'],
  'plane-anisotropic': ['None beyond the 2-fold axis normal to the plane, which every 2D elastic tensor has'],
};

export type PatternCell = { kind: 'zero' } | { kind: 'free' } | { kind: 'tied'; group: string; negative: boolean };

/**
 * Structural pattern of a class's compliance: zero entries, and entries tied
 * to another in magnitude. Found by building the class at two unrelated
 * perturbations of the parameters, so coincidences of a particular preset do
 * not show up as ties.
 */
export function compliancePattern(cls: SymmetryClassDef, params: Params): PatternCell[][] {
  const perturb = (f: number) =>
    Object.fromEntries(
      cls.params.map((d, k) => [d.key, d.kind === 'modulus' ? params[d.key] * (1 + f * (k + 1)) : params[d.key] + 0.5 * f * (k + 1)]),
    );
  const A = cls.build(perturb(0.0731));
  const B = cls.build(perturb(0.1379));
  const tolA = 1e-12 * maxAbs(A);
  const tolB = 1e-12 * maxAbs(B);
  const cells: PatternCell[][] = A.map((row, i) =>
    row.map((a, j) => (Math.abs(a) <= tolA && Math.abs(B[i][j]) <= tolB ? { kind: 'zero' } : { kind: 'free' })),
  );
  const close = (x: number, y: number, tol: number) => Math.abs(x - y) <= 1e-10 * Math.max(Math.abs(x), Math.abs(y), tol);
  const letters = 'abcdefghij';
  let next = 0;
  const seen: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++)
    for (let j = i; j < 6; j++) {
      if (cells[i][j].kind === 'zero') continue;
      const twin = seen.find(([p, q]) => close(Math.abs(A[p][q]), Math.abs(A[i][j]), tolA) && close(Math.abs(B[p][q]), Math.abs(B[i][j]), tolB));
      if (twin) {
        const [p, q] = twin;
        let ref = cells[p][q];
        if (ref.kind !== 'tied') {
          ref = { kind: 'tied', group: letters[next++], negative: false };
          cells[p][q] = ref;
          cells[q][p] = ref;
        }
        const tied: PatternCell = { kind: 'tied', group: ref.group, negative: Math.sign(A[i][j]) !== Math.sign(A[p][q]) };
        cells[i][j] = tied;
        cells[j][i] = tied;
      } else seen.push([i, j]);
    }
  return cells;
}
