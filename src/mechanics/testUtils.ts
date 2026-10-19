// Deterministic random generators for property-style tests.

import { type Mat, type Vec, add, identity, matMul, scale, transpose } from './linalg';
import { outOfPlane, planeCompliance, planeStiffness } from './plane';
import { rotationAxisAngle } from './tensor';

export const psCompliance = (S6: Mat) => planeCompliance(S6, 'stress');
export const psStiffness = (S6: Mat) => planeStiffness(S6, 'stress');
/** [εzz, γyz, γxz] under plane stress for the in-plane stress σ. */
export const psOutStrain = (S6: Mat, stress: Vec) => outOfPlane(S6, 'stress', { stress, strain: [0, 0, 0] }).strain;

/** mulberry32: small seeded PRNG returning uniform numbers in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random symmetric positive-definite n×n matrix scaled like a compliance in MPa⁻¹. */
export function randomSPD(n: number, r: () => number, magnitude = 1e-5): Mat {
  const A = Array.from({ length: n }, () => Array.from({ length: n }, () => 2 * r() - 1));
  return scale(add(matMul(A, transpose(A)), scale(identity(n), 0.2)), magnitude);
}

export function randomRotation(r: () => number): Mat {
  return rotationAxisAngle([2 * r() - 1, 2 * r() - 1, 2 * r() - 1 + 1e-3], 2 * Math.PI * r());
}

export function expectClose(a: number, b: number, rel = 1e-9, abs = 0): void {
  const tol = Math.max(abs, rel * Math.max(Math.abs(a), Math.abs(b)));
  if (!(Math.abs(a - b) <= tol)) throw new Error(`expected ${a} ≈ ${b} (tol ${tol})`);
}

export function expectMatClose(A: Mat, B: Mat, rel = 1e-9): void {
  const scaleRef = Math.max(...A.flat().map(Math.abs), ...B.flat().map(Math.abs));
  A.forEach((row, i) =>
    row.forEach((a, j) => {
      if (Math.abs(a - B[i][j]) > rel * scaleRef)
        throw new Error(`entry (${i},${j}): ${a} vs ${B[i][j]} (scale ${scaleRef})`);
    }),
  );
}
