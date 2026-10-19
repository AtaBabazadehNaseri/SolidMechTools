// Two-dimensional sections of a 3D material and the homogeneous mixed-control solver.
//
// Plane stress  (σzz = τyz = τxz = 0): the in-plane COMPLIANCE is literally the
//   (1,2,6) block of the 3D S; the in-plane stiffness is its inverse ("reduced",
//   Q̄ in laminate notation), not the (1,2,6) block of C.
// Plane strain (εzz = γyz = γxz = 0): the mirror image. The in-plane STIFFNESS is
//   the (1,2,6) block of the 3D C; the in-plane compliance is its inverse.
//
// 2D Voigt order: 0: xx, 1: yy, 2: xy (engineering shear γxy).

import { type Mat, type Vec, dot, inverse, matVec, submatrix } from './linalg';

export type PlaneMode = 'stress' | 'strain';

/** Voigt slots of the in-plane components xx, yy, xy within the 6-vector. */
export const IN_PLANE = [0, 1, 5] as const;
/** Voigt slots of zz, yz, xz. */
export const OUT_OF_PLANE = [2, 3, 4] as const;

export function planeCompliance(S6: Mat, mode: PlaneMode): Mat {
  return mode === 'stress'
    ? submatrix(S6, IN_PLANE, IN_PLANE)
    : inverse(submatrix(inverse(S6), IN_PLANE, IN_PLANE));
}

export function planeStiffness(S6: Mat, mode: PlaneMode): Mat {
  return mode === 'strain'
    ? submatrix(inverse(S6), IN_PLANE, IN_PLANE)
    : inverse(submatrix(S6, IN_PLANE, IN_PLANE));
}

export interface OutOfPlane {
  /** [σzz, τyz, τxz]: zero in plane stress, reactions in plane strain. */
  stress: Vec;
  /** [εzz, γyz, γxz]: free in plane stress, zero in plane strain. */
  strain: Vec;
}

export function outOfPlane(S6: Mat, mode: PlaneMode, r: PlaneResponse): OutOfPlane {
  if (mode === 'stress') return { stress: [0, 0, 0], strain: matVec(submatrix(S6, OUT_OF_PLANE, IN_PLANE), r.stress) };
  return { stress: matVec(submatrix(inverse(S6), OUT_OF_PLANE, IN_PLANE), r.strain), strain: [0, 0, 0] };
}

// ---------------------------------------------------------------------------
// Mixed control. Each in-plane component is either
//   'stress' – traction-controlled: its stress is prescribed (0 = traction-free), or
//   'strain' – displacement-controlled: its strain is prescribed (0 = mode locked).
// The specimen is homogeneous, so this is an exact 3×3 algebraic problem.

export type Control = 'stress' | 'strain';

export interface LoadCase {
  control: [Control, Control, Control];
  /** Prescribed σ (MPa) for stress control, ε or γ (–) for strain control. */
  value: [number, number, number];
}

export interface PlaneResponse {
  stress: Vec;
  strain: Vec;
}

/**
 * Partition into P (stress prescribed) and K (strain prescribed):
 *   σ_K = S_KK⁻¹ (ε_K − S_KP σ_P)
 *   ε_P = S_PK σ_K + S_PP σ_P
 * S_KK is a principal submatrix of a positive-definite S, hence invertible.
 */
export function solveMixed(S2: Mat, load: LoadCase): PlaneResponse {
  const P = [0, 1, 2].filter((i) => load.control[i] === 'stress');
  const K = [0, 1, 2].filter((i) => load.control[i] === 'strain');
  const stress = [0, 0, 0];
  const strain = [0, 0, 0];
  for (const i of P) stress[i] = load.value[i];
  for (const i of K) strain[i] = load.value[i];

  if (K.length > 0) {
    const sigmaP = P.map((i) => stress[i]);
    const rhs = K.map((k, a) => strain[k] - (P.length ? dot(submatrix(S2, K, P)[a], sigmaP) : 0));
    const sigmaK = matVec(inverse(submatrix(S2, K, K)), rhs);
    K.forEach((k, a) => (stress[k] = sigmaK[a]));
  }
  for (const i of P) strain[i] = dot(S2[i], stress);
  return { stress, strain };
}

/**
 * Apparent stiffness dσ_i/dε_i of component i when every other component keeps
 * its current control: locked components hold their strain, free components
 * hold their stress. With F = the free components other than i,
 *   M_i = C̄_ii − C̄_iF C̄_FF⁻¹ C̄_Fi.
 * Bounds: 1/S̄_ii (all others free) ≤ M_i ≤ C̄_ii (all others locked). Each
 * added lock can only raise M_i.
 */
export function apparentStiffness(C2: Mat, control: readonly Control[], i: number): number {
  const F = [0, 1, 2].filter((k) => k !== i && control[k] === 'stress');
  if (F.length === 0) return C2[i][i];
  const CFFinv = inverse(submatrix(C2, F, F));
  const CFi = F.map((k) => C2[k][i]);
  return C2[i][i] - dot(CFi, matVec(CFFinv, CFi));
}

/**
 * W = ½ σ·ε over the in-plane components (Voigt, engineering shear). The
 * out-of-plane terms vanish in both modes because either their stress or their
 * strain is zero, so this is the full 3D density.
 */
export function strainEnergyDensity(r: PlaneResponse): number {
  return 0.5 * dot(r.stress, r.strain);
}

/**
 * Moduli for the in-plane direction n = (cos φ, sin φ), t = (−sin φ, cos φ):
 *   E(φ)  = 1 / S̄_nnnn   uniaxial stress along n, every other in-plane stress zero
 *   Cn(φ) =     C̄_nnnn   uniaxial strain along n, every other in-plane strain zero
 *   G(φ)  = 1 / S̄_ntnt   shear stress τ_nt alone
 * Always E(φ) ≤ Cn(φ).
 */
export function directionalModuli(S2: Mat, C2: Mat, phi: number): { E: number; Cn: number; G: number; nu: number } {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const nStress = [c * c, s * s, c * s]; // σ_V per unit σ_nn
  const nStrain = [c * c, s * s, 2 * c * s]; // ε_V per unit ε_nn
  const tShear = [-2 * c * s, 2 * c * s, c * c - s * s]; // σ_V per unit τ_nt; also γ_nt = tShear·ε_V
  const tLateral = [s * s, c * c, -c * s]; // ε_tt = tLateral·ε_V
  const eps = matVec(S2, nStress);
  return {
    E: 1 / dot(nStress, eps),
    Cn: dot(nStrain, matVec(C2, nStrain)),
    G: 1 / dot(tShear, matVec(S2, tShear)),
    // In-plane Poisson ratio for a pull along n: −ε_tt/ε_nn. Its partner for a pull along t is nu(φ + 90°).
    nu: -dot(tLateral, eps) / dot(nStress, eps),
  };
}

/**
 * Extension–shear coupling for uniaxial stress along φ: γ_nt / ε_nn.
 * It is proportional to dS̄_nnnn/dφ, so it vanishes exactly where E(φ) is
 * stationary. Along those directions a uniaxial pull produces strain whose
 * principal axes coincide with the load axis.
 */
export function directionalShearCoupling(S2: Mat, phi: number): number {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const nStress = [c * c, s * s, c * s];
  const tShear = [-2 * c * s, 2 * c * s, c * c - s * s];
  const eps = matVec(S2, nStress);
  return dot(tShear, eps) / dot(nStress, eps);
}

/**
 * Directions φ ∈ [0, π) along which uniaxial stress produces no extension–shear
 * coupling (strain coaxial with the load). `all` is true when every direction
 * qualifies, i.e. the plane is isotropic.
 */
export function coaxialDirections(S2: Mat, samples = 720): { all: boolean; angles: number[] } {
  const f = (p: number) => directionalShearCoupling(S2, p);
  const vals = Array.from({ length: samples + 1 }, (_, k) => f((Math.PI * k) / samples));
  if (Math.max(...vals.map(Math.abs)) < 1e-10) return { all: true, angles: [] };
  const angles: number[] = [];
  for (let k = 0; k < samples; k++) {
    let a = (Math.PI * k) / samples;
    let b = (Math.PI * (k + 1)) / samples;
    let fa = vals[k];
    if (fa === 0) {
      angles.push(a);
      continue;
    }
    if (Math.sign(fa) === Math.sign(vals[k + 1]) || vals[k + 1] === 0) continue;
    for (let it = 0; it < 60; it++) {
      const m = 0.5 * (a + b);
      const fm = f(m);
      if (Math.sign(fm) === Math.sign(fa)) {
        a = m;
        fa = fm;
      } else b = m;
    }
    angles.push(0.5 * (a + b));
  }
  return { all: false, angles };
}
