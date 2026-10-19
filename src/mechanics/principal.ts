// Principal values and directions of in-plane stress and strain, tractions on a
// cut, and the eigenmodes (Kelvin modes) of the in-plane stiffness.

import { type Mat, type Vec, symmetricEigen } from './linalg';
import { stiffnessVoigtToMandel } from './tensor';

export interface Principal2D {
  max: number;
  min: number;
  /** Direction of the maximum principal value, radians in (−π/2, π/2]. */
  angle: number;
  /** True when max = min (every direction is principal). */
  degenerate: boolean;
}

/** Principal values of the symmetric 2×2 tensor [[xx, xy], [xy, yy]] (tensor shear, not engineering). */
export function principal2D(xx: number, yy: number, xy: number): Principal2D {
  const c = 0.5 * (xx + yy);
  const r = Math.hypot(0.5 * (xx - yy), xy);
  let angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  if (angle <= -Math.PI / 2) angle += Math.PI;
  return { max: c + r, min: c - r, angle, degenerate: r <= 1e-12 * Math.max(Math.abs(c), 1e-300) };
}

export const stressPrincipal = (s: Vec) => principal2D(s[0], s[1], s[2]);
/** Strain uses γxy/2 as the tensor shear component. */
export const strainPrincipal = (e: Vec) => principal2D(e[0], e[1], 0.5 * e[2]);

/**
 * Traction on a cut with unit normal n = (cos α, sin α): t = σ n, split into the
 * normal part σ_n = t·n and the shear part τ_nt = t·t̂ with t̂ = (−sin α, cos α).
 */
export function tractionOnCut(stress: Vec, alpha: number): { vector: [number, number]; normal: number; shear: number } {
  const [sxx, syy, sxy] = stress;
  const c = Math.cos(alpha);
  const s = Math.sin(alpha);
  const t: [number, number] = [sxx * c + sxy * s, sxy * c + syy * s];
  return { vector: t, normal: t[0] * c + t[1] * s, shear: -t[0] * s + t[1] * c };
}

/** Normal strain of a line element along n and the tensor shear ε_nt = γ_nt / 2. */
export function strainOnLine(strain: Vec, alpha: number): { normal: number; shear: number } {
  const [exx, eyy, gxy] = strain;
  const c = Math.cos(alpha);
  const s = Math.sin(alpha);
  return {
    normal: exx * c * c + eyy * s * s + gxy * c * s,
    shear: (eyy - exx) * c * s + 0.5 * gxy * (c * c - s * s),
  };
}

export interface KelvinMode {
  /** Eigenvalue λ of the Mandel stiffness: σ = λ ε for this mode (λ = 2G for a pure shear mode). */
  modulus: number;
  /** Voigt strain (engineering shear) of the mode, unit Mandel norm. */
  strain: Vec;
}

/**
 * Eigenmodes of the in-plane stiffness. For each mode the stress is
 * proportional to the strain, so stress and strain are coaxial. These are the
 * "principal" states of the stiffness tensor itself.
 */
export function kelvinModes2D(C2: Mat): KelvinMode[] {
  const { values, vectors } = symmetricEigen(stiffnessVoigtToMandel(C2));
  return values.map((modulus, k) => {
    const v = vectors[k];
    // Fix the sign so the largest component is positive.
    const big = v.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
    const sgn = big < 0 ? -1 : 1;
    return { modulus, strain: [sgn * v[0], sgn * v[1], sgn * Math.SQRT2 * v[2]] };
  });
}
