// Directional properties of a 3D compliance S (Voigt, engineering shear), for
// unit directions n and m ⟂ n:
//   E(n)     uniaxial stress along n, every other stress zero      1/E = a·S a
//   β(n)     linear compressibility: strain along n per unit pressure  β = a·S h
//   G(n, m)  shear stress τ_nm alone                               1/G = c·S c
//   ν(n, m)  lateral strain along m per axial strain along n under uniaxial stress along n
// with a = (n₁², n₂², n₃², n₂n₃, n₁n₃, n₁n₂), h = (1, 1, 1, 0, 0, 0) and c the
// Voigt stress of a unit shear τ_nm. The same vectors read ε_nn = a·ε and
// γ_nm = c·ε from an engineering-shear strain, which is why the forms are symmetric.

import type { Mat, Vec } from './linalg';
import { youngExtremes3D } from './anisotropy';

export const axialVector = (n: Vec): Vec => [n[0] * n[0], n[1] * n[1], n[2] * n[2], n[1] * n[2], n[0] * n[2], n[0] * n[1]];
export const shearVector = (n: Vec, m: Vec): Vec => [
  2 * n[0] * m[0],
  2 * n[1] * m[1],
  2 * n[2] * m[2],
  n[1] * m[2] + n[2] * m[1],
  n[0] * m[2] + n[2] * m[0],
  n[0] * m[1] + n[1] * m[0],
];
const HYDRO = [1, 1, 1, 0, 0, 0];
// Allocation-free forms: these run tens of thousands of times per surface.
const bilinear = (S: Mat, u: Vec, v: Vec) => {
  let s = 0;
  for (let i = 0; i < 6; i++) {
    const Si = S[i];
    let r = 0;
    for (let j = 0; j < 6; j++) r += Si[j] * v[j];
    s += u[i] * r;
  }
  return s;
};
const quad = (S: Mat, v: Vec) => bilinear(S, v, v);

export const youngAlong = (S: Mat, n: Vec) => 1 / quad(S, axialVector(n));
/** Strain along n per unit hydrostatic pressure. The sum over any three orthogonal directions is the volume compressibility 1/K_Reuss. */
export const compressibilityAlong = (S: Mat, n: Vec) => bilinear(S, axialVector(n), HYDRO);
export const shearModulusAlong = (S: Mat, n: Vec, m: Vec) => 1 / quad(S, shearVector(n, m));
export const poissonAlong = (S: Mat, n: Vec, m: Vec) => {
  const a = axialVector(n);
  return -bilinear(S, axialVector(m), a) / quad(S, a);
};

const unit = (v: Vec) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Two unit vectors that span the plane perpendicular to the unit vector n. */
export function perpendicularBasis(n: Vec): [Vec, Vec] {
  const k = [0, 1, 2].reduce((m, i) => (Math.abs(n[i]) < Math.abs(n[m]) ? i : m), 0);
  const e: Vec = [0, 0, 0];
  e[k] = 1;
  const u = unit(cross(n, e));
  return [u, cross(n, u)];
}

export interface Range {
  min: number;
  max: number;
  mMin: Vec;
  mMax: Vec;
}

/**
 * Min and max of f(n, m) over unit m ⟂ n. f has period π in the angle of m,
 * so [0, π) is sampled and each extreme refined by a parabola through its
 * neighbours.
 */
export function rangePerpendicular(f: (n: Vec, m: Vec) => number, n: Vec, samples = 36): Range {
  const [u, v] = perpendicularBasis(n);
  const m = (t: number): Vec => [0, 1, 2].map((i) => Math.cos(t) * u[i] + Math.sin(t) * v[i]);
  const h = Math.PI / samples;
  const vals = Array.from({ length: samples }, (_, k) => f(n, m(k * h)));
  const refine = (k: number) => {
    const a = vals[(k + samples - 1) % samples];
    const b = vals[k];
    const c = vals[(k + 1) % samples];
    const den = a - 2 * b + c;
    const off = den === 0 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den));
    const t = (k + off) * h;
    return { value: f(n, m(t)), m: m(t) };
  };
  let kMin = 0;
  let kMax = 0;
  vals.forEach((x, k) => {
    if (x < vals[kMin]) kMin = k;
    if (x > vals[kMax]) kMax = k;
  });
  const lo = refine(kMin);
  const hi = refine(kMax);
  return { min: Math.min(lo.value, vals[kMin]), max: Math.max(hi.value, vals[kMax]), mMin: lo.m, mMax: hi.m };
}

export type DirectionalQuantity = 'E' | 'beta' | 'G' | 'nu';

export interface Extreme {
  value: number;
  n: Vec;
  /** The second direction, for G and ν. */
  m?: Vec;
}

/** Global minimum and maximum of a quantity over all directions (and over m ⟂ n for G and ν). */
export function directionalExtremes(S: Mat, q: DirectionalQuantity, samples = 1200): { min: Extreme; max: Extreme } {
  if (q === 'E') {
    const y = youngExtremes3D(S);
    return { min: { value: y.min, n: y.nMin }, max: { value: y.max, n: y.nMax } };
  }
  const golden = Math.PI * (3 - Math.sqrt(5));
  const pair = q === 'G' ? (a: Vec, b: Vec) => shearModulusAlong(S, a, b) : (a: Vec, b: Vec) => poissonAlong(S, a, b);
  // Value at n for the minimum (sign −1) or maximum (+1), with the m that attains it.
  const at = (n: Vec, sign: 1 | -1): Extreme => {
    if (q === 'beta') return { value: compressibilityAlong(S, n), n };
    const rg = rangePerpendicular(pair, n);
    return sign > 0 ? { value: rg.max, n, m: rg.mMax } : { value: rg.min, n, m: rg.mMin };
  };
  const dir = (th: number, ph: number): Vec => [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
  let best = { min: { th: 0, ph: 0, value: Infinity }, max: { th: 0, ph: 0, value: -Infinity } };
  // Half the sphere suffices: every quantity is even in n.
  for (let k = 0; k < samples; k++) {
    const th = Math.acos(1 - (k + 0.5) / samples);
    const ph = golden * k;
    const n = dir(th, ph);
    const lo = at(n, -1).value;
    const hi = at(n, 1).value;
    if (lo < best.min.value) best = { ...best, min: { th, ph, value: lo } };
    if (hi > best.max.value) best = { ...best, max: { th, ph, value: hi } };
  }
  // Shrinking pattern search from the best samples, as for E.
  const refine = (start: { th: number; ph: number }, sign: 1 | -1): Extreme => {
    let { th, ph } = start;
    let f = sign * at(dir(th, ph), sign).value;
    for (let step = 0.05; step > 1e-7; ) {
      let moved = false;
      for (const [dt, dp] of [
        [step, 0],
        [-step, 0],
        [0, step],
        [0, -step],
      ]) {
        const g = sign * at(dir(th + dt, ph + dp), sign).value;
        if (g > f) {
          f = g;
          th += dt;
          ph += dp;
          moved = true;
        }
      }
      if (!moved) step /= 2;
    }
    return at(dir(th, ph), sign);
  };
  return { min: refine(best.min, -1), max: refine(best.max, 1) };
}
