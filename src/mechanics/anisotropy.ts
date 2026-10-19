// Measures of elastic anisotropy.
//
// No single number captures anisotropy; each index answers a narrower question.
//   • Axis ratios such as E₁/E₂: the first, simplest notion.
//   • Zener ratio A = 2C₄₄/(C₁₁ − C₁₂) = G/G_iso for cubic crystals: the one
//     anisotropy degree of freedom left when E₁ = E₂ = E₃.
//   • Directional extremes E_max/E_min, G_max/G_min: how far the E(n) and G(n)
//     surfaces deviate from a circle (2D) or sphere (3D). In 2D a circular
//     E(φ) implies in-plane isotropy; in 3D a spherical E(n) is necessary but
//     NOT sufficient (E(n) sees only the totally symmetric part of S).
//   • Universal index A^U = 5 G_V/G_R + K_V/K_R − 6 (Ranganathan &
//     Ostoja-Starzewski 2008): zero only for isotropy, any symmetry class.

import { type Mat, type Vec, dot, inverse, matVec } from './linalg';
import { directionalModuli } from './plane';

export interface VoigtReuss {
  KV: number;
  GV: number;
  KR: number;
  GR: number;
}

/** Voigt (uniform strain) and Reuss (uniform stress) averages of bulk and shear moduli. */
export function voigtReuss(S6: Mat): VoigtReuss {
  const C = inverse(S6);
  const S = S6;
  const tC = C[0][0] + C[1][1] + C[2][2];
  const oC = C[0][1] + C[0][2] + C[1][2];
  const sC = C[3][3] + C[4][4] + C[5][5];
  const tS = S[0][0] + S[1][1] + S[2][2];
  const oS = S[0][1] + S[0][2] + S[1][2];
  const sS = S[3][3] + S[4][4] + S[5][5];
  return {
    KV: (tC + 2 * oC) / 9,
    GV: (tC - oC + 3 * sC) / 15,
    KR: 1 / (tS + 2 * oS),
    GR: 15 / (4 * tS - 4 * oS + 3 * sS),
  };
}

export function universalAnisotropy(S6: Mat): number {
  const { KV, GV, KR, GR } = voigtReuss(S6);
  return (5 * GV) / GR + KV / KR - 6;
}

/** Young's modulus along the unit vector n: 1/E = v·S v with v = (n₁², n₂², n₃², n₂n₃, n₁n₃, n₁n₂). */
export function youngModulus3D(S6: Mat, n: Vec): number {
  const [a, b, c] = n;
  const v = [a * a, b * b, c * c, b * c, a * c, a * b];
  return 1 / dot(v, matVec(S6, v));
}

const dir = (th: number, ph: number): Vec => [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];

/** Extremes of E(n) over the sphere: Fibonacci sampling, then a shrinking pattern search. */
export function youngExtremes3D(S6: Mat, samples = 4000): { min: number; max: number; nMin: Vec; nMax: Vec } {
  const golden = Math.PI * (3 - Math.sqrt(5));
  let best = { min: Infinity, max: -Infinity, tMin: [0, 0], tMax: [0, 0] };
  for (let k = 0; k < samples; k++) {
    const z = 1 - (2 * (k + 0.5)) / samples;
    const th = Math.acos(z);
    const ph = golden * k;
    const E = youngModulus3D(S6, dir(th, ph));
    if (E < best.min) best = { ...best, min: E, tMin: [th, ph] };
    if (E > best.max) best = { ...best, max: E, tMax: [th, ph] };
  }
  const refine = (start: number[], sign: 1 | -1) => {
    let [th, ph] = start;
    let f = sign * youngModulus3D(S6, dir(th, ph));
    for (let step = 0.05; step > 1e-7; ) {
      let moved = false;
      for (const [dt, dp] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const g = sign * youngModulus3D(S6, dir(th + dt, ph + dp));
        if (g > f) {
          f = g;
          th += dt;
          ph += dp;
          moved = true;
        }
      }
      if (!moved) step /= 2;
    }
    return { value: sign * f, n: dir(th, ph) };
  };
  const lo = refine(best.tMin, -1);
  const hi = refine(best.tMax, 1);
  return { min: lo.value, max: hi.value, nMin: lo.n, nMax: hi.n };
}

/** In-plane extremes of E(φ) and G(φ) over φ ∈ [0, π). */
export function planeExtremes(S2: Mat, C2: Mat, samples = 1440): { Emin: number; Emax: number; Gmin: number; Gmax: number } {
  let Emin = Infinity;
  let Emax = -Infinity;
  let Gmin = Infinity;
  let Gmax = -Infinity;
  for (let k = 0; k < samples; k++) {
    const { E, G } = directionalModuli(S2, C2, (Math.PI * k) / samples);
    Emin = Math.min(Emin, E);
    Emax = Math.max(Emax, E);
    Gmin = Math.min(Gmin, G);
    Gmax = Math.max(Gmax, G);
  }
  return { Emin, Emax, Gmin, Gmax };
}
