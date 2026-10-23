// Material orientation: the rotation R whose columns are the material axes
// 1, 2, 3 written in the specimen axes x, y, z (v_specimen = R v_material).

import { type Mat, matMul, symmetricEigen, transpose } from './linalg';

export type Vec3 = [number, number, number];

const norm = (v: number[]) => Math.hypot(...v);
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const fromColumns = (a: Vec3, b: Vec3, c: Vec3): Mat => [0, 1, 2].map((i) => [a[i], b[i], c[i]]);

export type Orientation = { R: Mat } | { error: string };

/**
 * From the direction of axis 1 and any vector in the 1–2 plane: axis 1 is
 * normalized, axis 2 is the in-plane vector made perpendicular to it, and
 * axis 3 = axis 1 × axis 2.
 */
export function axesFromVectors(axis1: Vec3, inPlane12: Vec3): Orientation {
  const n1 = norm(axis1);
  if (!(n1 > 0) || !Number.isFinite(n1)) return { error: 'Axis 1 must be a nonzero vector.' };
  const a1 = axis1.map((v) => v / n1) as Vec3;
  const d = inPlane12.reduce((s, v, i) => s + v * a1[i], 0);
  const p = inPlane12.map((v, i) => v - d * a1[i]) as Vec3;
  const np = norm(p);
  if (!(np > 1e-9 * Math.max(norm(inPlane12), 1e-300)) || !Number.isFinite(np))
    return { error: 'The second vector must not be parallel to axis 1: it has to span the 1–2 plane with it.' };
  const a2 = p.map((v) => v / np) as Vec3;
  return { R: fromColumns(a1, a2, cross(a1, a2)) };
}

/**
 * From direction cosines whose columns are axes 1, 2, 3 in x, y, z. Rounded
 * values (such as 0.866) are accepted to within `tol` and replaced by the
 * nearest rotation, R = M (MᵀM)^(−1/2); a left-handed set is refused.
 */
export function nearestRotation(M: Mat, tol = 1e-3): Orientation {
  if (M.length !== 3 || M.some((r) => r.length !== 3 || r.some((v) => !Number.isFinite(v)))) return { error: 'Enter nine numbers.' };
  const MtM = matMul(transpose(M), M);
  const off = Math.max(...MtM.flatMap((row, i) => row.map((v, j) => Math.abs(v - (i === j ? 1 : 0)))));
  const det =
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  if (off > tol) return { error: `The axes are not perpendicular unit vectors (off by up to ${off.toPrecision(2)}).` };
  if (det < 0) return { error: 'The axes form a left-handed set; axis 3 must be axis 1 × axis 2.' };
  const { values, vectors } = symmetricEigen(MtM);
  // (MᵀM)^(−1/2) = Σ v vᵀ / √λ
  const invSqrt = [0, 1, 2].map((i) => [0, 1, 2].map((j) => values.reduce((s, lam, k) => s + (vectors[k][i] * vectors[k][j]) / Math.sqrt(lam), 0)));
  return { R: matMul(M, invSqrt) };
}

/** Columns of R: axes 1, 2, 3 in x, y, z. */
export const axesOf = (R: Mat): [Vec3, Vec3, Vec3] => [0, 1, 2].map((k) => [R[0][k], R[1][k], R[2][k]] as Vec3) as [Vec3, Vec3, Vec3];
