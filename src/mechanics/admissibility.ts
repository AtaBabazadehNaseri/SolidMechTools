// Positive definiteness and exact admissible ranges for material knobs.
//
// A stable linear elastic material needs W = ½ εᵀCε > 0 for every ε ≠ 0,
// i.e. C (equivalently S = C⁻¹) positive definite. Voigt and Mandel forms are
// congruent, so either can be tested; Cholesky success is the test.

import { type Mat, cholesky, lowerTriangularInverse, matMul, scale, sub, symmetricEigen, transpose } from './linalg';
import type { Params, SymmetryClassDef } from './materials';

export interface Interval {
  /** Open interval; may be ±Infinity. */
  lo: number;
  hi: number;
}

/**
 * Values of t for which S0 + t·A stays positive definite, given S0 is.
 * With S0 = L Lᵀ:  S0 + tA = L (I + t M) Lᵀ,  M = L⁻¹ A L⁻ᵀ.
 * PD ⟺ 1 + t μ_k > 0 for every eigenvalue μ_k of M.
 */
export function affineAdmissibleInterval(S0: Mat, A: Mat): Interval {
  const L = cholesky(S0);
  if (!L) throw new Error('affineAdmissibleInterval: base matrix is not positive definite');
  const Li = lowerTriangularInverse(L);
  const M = matMul(matMul(Li, A), transpose(Li));
  const sym = M.map((row, i) => row.map((v, j) => 0.5 * (v + M[j][i])));
  const { values } = symmetricEigen(sym);
  const tol = 1e-12 * Math.max(...values.map(Math.abs), Number.MIN_VALUE);
  let lo = -Infinity;
  let hi = Infinity;
  for (const mu of values) {
    if (mu > tol) lo = Math.max(lo, -1 / mu);
    else if (mu < -tol) hi = Math.min(hi, -1 / mu);
  }
  return { lo, hi };
}

/**
 * dS/dg for one constant, where g = 1/value for moduli and g = value for
 * ratios. S is affine in g (verified per class in the tests), so a single
 * finite difference is exact up to round-off.
 */
export function knobDirection(cls: SymmetryClassDef, params: Params, key: string): { A: Mat; g0: number } {
  const def = cls.params.find((d) => d.key === key);
  if (!def) throw new Error(`knobDirection: ${key} is not a constant of ${cls.id}`);
  const isModulus = def.kind === 'modulus';
  const g0 = isModulus ? 1 / params[key] : params[key];
  const dg = isModulus ? 0.5 * g0 : 1;
  const S0 = cls.build(params);
  const S1 = cls.build({ ...params, [key]: isModulus ? 1 / (g0 + dg) : g0 + dg });
  return { A: scale(sub(S1, S0), 1 / dg), g0 };
}

/**
 * Exact open interval of admissible values for one constant of a symmetry
 * class, holding every other constant of that class fixed.
 */
export function knobInterval(cls: SymmetryClassDef, params: Params, key: string): Interval {
  const def = cls.params.find((d) => d.key === key)!;
  const { A, g0 } = knobDirection(cls, params, key);
  const t = affineAdmissibleInterval(cls.build(params), A);
  const gLo = g0 + t.lo;
  const gHi = g0 + t.hi;

  if (def.kind === 'ratio') return { lo: gLo, hi: gHi };
  // g = 1/modulus is necessarily positive on the admissible set (S_ii > 0).
  // A lower end of g = 0 (up to round-off) means the modulus may grow without bound.
  return {
    lo: Number.isFinite(gHi) ? 1 / gHi : 0,
    hi: gLo > 1e-9 * g0 ? 1 / gLo : Infinity,
  };
}
