// Read-only engineering constants and invariants of a 3D compliance.

import { type Mat, symmetricEigen } from './linalg';
import { complianceVoigtToMandel } from './tensor';

/** Apparent engineering constants in the specimen frame (x, y in plane, z normal). */
export interface ApparentConstants {
  Ex: number;
  Ey: number;
  Gxy: number;
  nuxy: number;
  nuyx: number;
  /** γ_xy per ε_xx under σ_xx alone. */
  etaxy_x: number;
  /** γ_xy per ε_yy under σ_yy alone. */
  etaxy_y: number;
  /** Thickness contraction −ε_zz/ε_xx under σ_xx alone. */
  nuxz: number;
  nuyz: number;
}

export function apparentConstants(S6: Mat): ApparentConstants {
  const S = S6;
  return {
    Ex: 1 / S[0][0],
    Ey: 1 / S[1][1],
    Gxy: 1 / S[5][5],
    nuxy: -S[1][0] / S[0][0],
    nuyx: -S[0][1] / S[1][1],
    etaxy_x: S[5][0] / S[0][0],
    etaxy_y: S[5][1] / S[1][1],
    nuxz: -S[2][0] / S[0][0],
    nuyz: -S[2][1] / S[1][1],
  };
}

/**
 * Kelvin moduli: eigenvalues of the 6×6 stiffness in Mandel form, ascending.
 * They do not depend on the coordinate frame, so rotating the material leaves
 * them unchanged even though every matrix entry changes.
 */
export function kelvinModuli(S6: Mat): number[] {
  return symmetricEigen(complianceVoigtToMandel(S6))
    .values.map((s) => 1 / s)
    .sort((a, b) => a - b);
}

/**
 * Engineering constants of the in-plane compliance S̄ of the current 2D mode,
 * in specimen axes: what free (traction-controlled) 2D tests would measure.
 * In plane stress they equal the 3D constants read in specimen axes.
 */
export interface PlaneConstants {
  Ex: number;
  Ey: number;
  Gxy: number;
  nuxy: number;
  nuyx: number;
  /** γxy / εxx under σxx alone: extension–shear coupling. */
  etaxy_x: number;
  /** γxy / εyy under σyy alone. */
  etaxy_y: number;
}

export function planeConstants(S2: Mat): PlaneConstants {
  return {
    Ex: 1 / S2[0][0],
    Ey: 1 / S2[1][1],
    Gxy: 1 / S2[2][2],
    nuxy: -S2[1][0] / S2[0][0],
    nuyx: -S2[0][1] / S2[1][1],
    etaxy_x: S2[2][0] / S2[0][0],
    etaxy_y: S2[2][1] / S2[1][1],
  };
}
