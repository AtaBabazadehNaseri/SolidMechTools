export * from './linalg';
export * from './tensor';
export * from './materials';
export * from './plane';
export * from './principal';
export * from './admissibility';
export * from './constants';
export * from './anisotropy';
export * from './symmetry';
export * from './snapping';
export * from './projection';
export * from './orientation';
export * from './solid';
export * from './directional3d';

import { type Mat, matMul } from './linalg';
import { type SectionId, SECTIONS } from './materials';
import { rotationZ } from './tensor';

/**
 * Material-to-specimen rotation: first the chosen section plane, then an
 * in-plane rotation of the material by θ (counter-clockwise, about z).
 */
export function specimenRotation(section: SectionId, thetaRad: number): Mat {
  return matMul(rotationZ(thetaRad), SECTIONS[section].R);
}

/** The same, from any material → specimen rotation R0 (columns: axes 1, 2, 3 in x, y, z). */
export function specimenRotationFrom(R0: Mat, thetaRad: number): Mat {
  return matMul(rotationZ(thetaRad), R0);
}
