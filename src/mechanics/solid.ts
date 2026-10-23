// The homogeneous 3D specimen (a cube): every one of the six Voigt components
// (order 11, 22, 33, 23, 13, 12, engineering shear) is traction- or
// displacement-controlled. Same partitioned solve as the 2D lab, on 6×6.

import { type Mat, type Vec, dot, inverse, matVec, submatrix, symmetricEigen } from './linalg';
import type { Control } from './plane';
import { stiffnessVoigtToMandel } from './tensor';

export interface LoadCase6 {
  /** Per Voigt component: 'stress' prescribes σ (0 = traction-free), 'strain' prescribes ε or γ (0 = held). */
  control: Control[];
  value: number[];
}

export interface SolidResponse {
  /** σ in Voigt order (MPa). */
  stress: Vec;
  /** ε in Voigt order, engineering shear. */
  strain: Vec;
}

/**
 * Mixed control on any number of components. With P stress-prescribed and K
 * strain-prescribed: σ_K = S_KK⁻¹ (ε_K − S_KP σ_P), then ε_P = S_P· σ.
 * S_KK is a principal submatrix of a positive-definite S, hence invertible.
 */
export function solveMixedN(S: Mat, load: LoadCase6): SolidResponse {
  const n = S.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  const P = idx.filter((i) => load.control[i] === 'stress');
  const K = idx.filter((i) => load.control[i] === 'strain');
  const stress = idx.map((i) => (load.control[i] === 'stress' ? load.value[i] : 0));
  const strain = idx.map((i) => (load.control[i] === 'strain' ? load.value[i] : 0));
  if (K.length) {
    const sigmaP = P.map((i) => stress[i]);
    const rhs = K.map((k, a) => strain[k] - (P.length ? dot(submatrix(S, K, P)[a], sigmaP) : 0));
    const sigmaK = matVec(inverse(submatrix(S, K, K)), rhs);
    K.forEach((k, a) => (stress[k] = sigmaK[a]));
  }
  for (const i of P) strain[i] = dot(S[i], stress);
  return { stress, strain };
}

/**
 * dσ_i/dε_i with every other component keeping its control: held strains stay
 * fixed, free stresses stay fixed. M_i = C_ii − C_iF C_FF⁻¹ C_Fi over the free
 * components F ≠ i, between 1/S_ii (all free) and C_ii (all held).
 */
export function apparentStiffnessN(C: Mat, control: readonly Control[], i: number): number {
  const F = C.map((_, k) => k).filter((k) => k !== i && control[k] === 'stress');
  if (F.length === 0) return C[i][i];
  const CFi = F.map((k) => C[k][i]);
  return C[i][i] - dot(CFi, matVec(inverse(submatrix(C, F, F)), CFi));
}

/** 3×3 stress tensor from Voigt σ (11, 22, 33, 23, 13, 12). */
export const stressTensor = (s: Vec): Mat => [
  [s[0], s[5], s[4]],
  [s[5], s[1], s[3]],
  [s[4], s[3], s[2]],
];

/** 3×3 strain tensor from Voigt ε with engineering shear (ε_ij = γ_ij / 2). */
export const strainTensor = (e: Vec): Mat => stressTensor([e[0], e[1], e[2], e[3] / 2, e[4] / 2, e[5] / 2]);

export interface Principal3D {
  /** Largest first. */
  values: [number, number, number];
  /** Unit directions, matching `values`. */
  directions: [Vec, Vec, Vec];
}

export function principal3D(T: Mat): Principal3D {
  const { values, vectors } = symmetricEigen(T);
  const order = [2, 1, 0];
  return { values: order.map((k) => values[k]) as Principal3D['values'], directions: order.map((k) => vectors[k]) as Principal3D['directions'] };
}

/** Largest angle (degrees) between corresponding principal directions; null when either tensor has a repeated principal value. */
export function principalMisalignment(a: Principal3D, b: Principal3D): number | null {
  const distinct = (p: Principal3D) => {
    const scale = Math.max(...p.values.map(Math.abs), 1e-300);
    return Math.abs(p.values[0] - p.values[1]) > 1e-9 * scale && Math.abs(p.values[1] - p.values[2]) > 1e-9 * scale;
  };
  if (!distinct(a) || !distinct(b)) return null;
  return Math.max(...[0, 1, 2].map((k) => (Math.acos(Math.min(1, Math.abs(dot(a.directions[k], b.directions[k])))) * 180) / Math.PI));
}

export interface KelvinMode6 {
  /** Eigenvalue λ of the Mandel stiffness: σ = λ ε in this mode (λ = 2G for a pure shear). Ascending order. */
  modulus: number;
  /** Voigt strain (engineering shear) of the mode, unit Mandel norm, largest component positive. */
  strain: Vec;
}

/** The six eigenmodes of the 3D stiffness: strain states for which the stress is exactly λ times the strain. */
export function kelvinModes3D(C6: Mat): KelvinMode6[] {
  const { values, vectors } = symmetricEigen(stiffnessVoigtToMandel(C6));
  return values.map((modulus, k) => {
    const v = vectors[k];
    const big = v.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
    const s = big < 0 ? -1 : 1;
    return { modulus, strain: v.map((x, i) => s * x * (i >= 3 ? Math.SQRT2 : 1)) };
  });
}
