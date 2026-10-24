import { describe, expect, it } from 'vitest';
import { inverse, matVec } from './linalg';
import { PRESETS, SYMMETRY_CLASSES } from './materials';
import { rotateComplianceVoigt, rotationAxisAngle, stiffnessVoigtToMandel } from './tensor';
import { voigtReuss, youngModulus3D } from './anisotropy';
import {
  compressibilityAlong,
  directionalExtremes,
  perpendicularBasis,
  poissonAlong,
  rangePerpendicular,
  shearModulusAlong,
  youngAlong,
} from './directional3d';
import { kelvinModes3D } from './solid';

const S = (id: string, R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) => {
  const p = PRESETS.find((x) => x.id === id)!;
  return rotateComplianceVoigt(SYMMETRY_CLASSES[p.classId].build(p.params), R);
};
const s2 = Math.SQRT1_2;
const s3 = 1 / Math.sqrt(3);

describe('3D directional properties', () => {
  it('isotropic solid: E, β, G and ν are the same in every direction', () => {
    const St = S('iso-2a');
    for (const n of [[1, 0, 0], [s3, s3, s3], [0.6, 0, 0.8]]) {
      expect(youngAlong(St, n) / 1000).toBeCloseTo(200, 9);
      expect(compressibilityAlong(St, n) * 1e6).toBeCloseTo((1e6 * (1 - 2 * 0.3)) / 200_000, 9); // 2 TPa⁻¹
      const r = rangePerpendicular((a, b) => shearModulusAlong(St, a, b), n);
      expect(r.min / 1000).toBeCloseTo(76.923, 2);
      expect(r.max / 1000).toBeCloseTo(76.923, 2);
      const p = rangePerpendicular((a, b) => poissonAlong(St, a, b), n);
      expect(p.min).toBeCloseTo(0.3, 9);
      expect(p.max).toBeCloseTo(0.3, 9);
    }
  });

  it('agrees with the Voigt entries along the axes, and E agrees with the existing routine', () => {
    const Sa = S('trc-21a', rotationAxisAngle([1, 2, 3], 0.4));
    expect(youngAlong(Sa, [1, 0, 0])).toBeCloseTo(1 / Sa[0][0], 6);
    expect(shearModulusAlong(Sa, [1, 0, 0], [0, 1, 0])).toBeCloseTo(1 / Sa[5][5], 6);
    expect(poissonAlong(Sa, [1, 0, 0], [0, 1, 0])).toBeCloseTo(-Sa[1][0] / Sa[0][0], 12);
    expect(compressibilityAlong(Sa, [0, 0, 1])).toBeCloseTo(Sa[2][0] + Sa[2][1] + Sa[2][2], 15);
    const n = [0.3, -0.5, Math.sqrt(1 - 0.34)];
    expect(youngAlong(Sa, n)).toBeCloseTo(youngModulus3D(Sa, n), 6);
  });

  it('compressibility along any orthogonal triad sums to 1/K_Reuss', () => {
    const Sa = S('trc-21a');
    const R = rotationAxisAngle([2, -1, 0.5], 0.9);
    const sum = [0, 1, 2].reduce((acc, k) => acc + compressibilityAlong(Sa, [R[0][k], R[1][k], R[2][k]]), 0);
    expect(sum * voigtReuss(Sa).KR).toBeCloseTo(1, 12);
  });

  it('cubic crystal: G = C₄₄ for every shear on a cube face; ν(⟨110⟩, ⟨1−10⟩) ≈ −0.11 is the most negative', () => {
    const Cub = S('cub-3a');
    const r = rangePerpendicular((a, b) => shearModulusAlong(Cub, a, b), [1, 0, 0]);
    expect(r.min / 1000).toBeCloseTo(75, 6);
    expect(r.max / 1000).toBeCloseTo(75, 6);
    expect(poissonAlong(Cub, [s2, s2, 0], [s2, -s2, 0])).toBeCloseTo(-0.109, 3);
    const ext = directionalExtremes(Cub, 'nu');
    expect(ext.min.value).toBeCloseTo(-0.109, 2);
    expect(ext.max.value).toBeCloseTo(0.783, 2);
  });

  it('the perpendicular basis is orthonormal and perpendicular to n', () => {
    for (const n of [[1, 0, 0], [0, 0, 1], [s3, -s3, s3]]) {
      const [u, v] = perpendicularBasis(n);
      const d = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
      expect(d(u, n)).toBeCloseTo(0, 15);
      expect(d(v, n)).toBeCloseTo(0, 15);
      expect(d(u, v)).toBeCloseTo(0, 15);
      expect(d(u, u)).toBeCloseTo(1, 15);
    }
  });

  it('extremes of E match the dedicated search; the fibre composite is least compressible along its fibres', () => {
    const Ply = S('ort-9b');
    const e = directionalExtremes(Ply, 'E');
    expect(e.max.value / 1000).toBeCloseTo(180, 3);
    const b = directionalExtremes(Ply, 'beta');
    expect(Math.abs(b.min.n[0])).toBeCloseTo(1, 3);
  });
});

describe('3D Kelvin modes', () => {
  it('isotropic solid: one dilatation (3K = 500 GPa) and five shears (2G = 153.8 GPa); σ = λ ε in every mode', () => {
    const C = inverse(S('iso-2a'));
    const modes = kelvinModes3D(C);
    for (let k = 0; k < 5; k++) expect(modes[k].modulus / 1000).toBeCloseTo(153.85, 2);
    expect(modes[5].modulus / 1000).toBeCloseTo(500, 9);
    expect(modes[5].strain.slice(0, 3).map((v) => v / modes[5].strain[0])).toEqual([1, 1, 1].map(() => expect.closeTo(1, 12)));
    const Ca = inverse(S('trc-21a'));
    for (const m of kelvinModes3D(Ca)) {
      const sigma = matVec(Ca, m.strain);
      // Mandel: σ_M = λ ε_M; in Voigt with engineering shear, σ_i = λ ε_i (normal) and τ = λ γ / 2 (shear).
      sigma.forEach((s, i) => expect(s).toBeCloseTo(m.modulus * m.strain[i] * (i >= 3 ? 0.5 : 1), 6));
    }
    expect(stiffnessVoigtToMandel(Ca).length).toBe(6);
  });
});
