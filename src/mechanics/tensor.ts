// Voigt / Mandel conventions and coordinate transformations.
//
// Voigt order (0-based index → component): 0:11  1:22  2:33  3:23  4:13  5:12
// Voigt strain uses ENGINEERING shear strains (γ_ij = 2ε_ij), so that
//   σ_V = C_V ε_V,  ε_V = S_V σ_V,  σ_V · ε_V = σ : ε.
// Mandel (Kelvin) form scales shear components by √2 for both stress and strain,
// which makes the 6×6 matrices genuine second-order tensors on a 6D space:
// rotations act on them as orthogonal similarity transforms and their
// eigenvalues are coordinate-invariant. Voigt-matrix eigenvalues are not.

import { type Mat, matMul, transpose, zeros } from './linalg';

/** Tensor index pair (i, j) of each Voigt slot. */
export const VOIGT_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 1],
  [2, 2],
  [1, 2],
  [0, 2],
  [0, 1],
];

const R2 = Math.SQRT2;
const MANDEL_W = [1, 1, 1, R2, R2, R2];

/** C_M = W C_V W with W = diag(1,1,1,√2,√2,√2). Works for n = 3 (2D) or 6 (3D). */
export function stiffnessVoigtToMandel(C: Mat): Mat {
  const w = mandelWeights(C.length);
  return C.map((row, i) => row.map((c, j) => c * w[i] * w[j]));
}

/** S_M = W⁻¹ S_V W⁻¹. */
export function complianceVoigtToMandel(S: Mat): Mat {
  const w = mandelWeights(S.length);
  return S.map((row, i) => row.map((s, j) => s / (w[i] * w[j])));
}

export function complianceMandelToVoigt(S: Mat): Mat {
  const w = mandelWeights(S.length);
  return S.map((row, i) => row.map((s, j) => s * w[i] * w[j]));
}

function mandelWeights(n: number): number[] {
  if (n === 6) return MANDEL_W;
  if (n === 3) return [1, 1, R2]; // 2D order: 11, 22, 12
  throw new Error(`Mandel weights undefined for size ${n}`);
}

/** Orthonormal Mandel basis tensor B_a (3×3). B_a : B_b = δ_ab. */
function mandelBasis(a: number): Mat {
  const [i, j] = VOIGT_PAIRS[a];
  const B = zeros(3);
  if (i === j) B[i][i] = 1;
  else {
    B[i][j] = 1 / R2;
    B[j][i] = 1 / R2;
  }
  return B;
}

/**
 * 6×6 orthogonal matrix Q such that, for T' = R T Rᵀ, the Mandel vectors obey
 * t' = Q t. Built directly from its definition Q_ab = B_a : (R B_b Rᵀ) rather
 * than from a memorised Bond-matrix formula.
 * Fourth-order tensors in Mandel form transform as C' = Q C Qᵀ.
 */
export function mandelRotation(R: Mat): Mat {
  const Rt = transpose(R);
  const Q = zeros(6);
  for (let b = 0; b < 6; b++) {
    const RBRt = matMul(matMul(R, mandelBasis(b)), Rt);
    for (let a = 0; a < 6; a++) {
      const Ba = mandelBasis(a);
      let s = 0;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += Ba[i][j] * RBRt[i][j];
      Q[a][b] = s;
    }
  }
  return Q;
}

/**
 * Express a 6×6 Voigt compliance given in material axes in a new frame.
 * R maps material-frame vector components to new-frame components (v' = R v),
 * i.e. the columns of R are the material axes written in the new frame.
 */
export function rotateComplianceVoigt(S: Mat, R: Mat): Mat {
  const Q = mandelRotation(R);
  const SM = complianceVoigtToMandel(S);
  return complianceMandelToVoigt(matMul(matMul(Q, SM), transpose(Q)));
}

/** Rotation by θ (radians, counter-clockwise) about the z axis. */
export function rotationZ(theta: number): Mat {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}

/** Rotation by θ about an arbitrary unit axis (Rodrigues). Used in tests. */
export function rotationAxisAngle(axis: [number, number, number], theta: number): Mat {
  const n = Math.hypot(...axis);
  const [x, y, z] = axis.map((v) => v / n);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
}
