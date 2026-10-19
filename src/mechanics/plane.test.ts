import { describe, expect, it } from 'vitest';
import { dot, identity, inverse, matMul, matVec, maxAbsDiff, submatrix, type Mat } from './linalg';
import { PRESETS, SYMMETRY_CLASSES } from './materials';
import { type Control, IN_PLANE, apparentStiffness, directionalModuli, solveMixed, strainEnergyDensity } from './plane';
import { expectClose, expectMatClose, psCompliance, psOutStrain, psStiffness, randomSPD, rng } from './testUtils';

const iso = (E: number, nu: number) => SYMMETRY_CLASSES.isotropic.build({ E1: E, nu12: nu });
const uniaxial = (s: number) => ({ control: ['stress', 'stress', 'stress'] as [Control, Control, Control], value: [s, 0, 0] as [number, number, number] });
const preset = (id: string) => {
  const p = PRESETS.find((q) => q.id === id)!;
  return SYMMETRY_CLASSES[p.classId].build(p.params);
};

describe('plane-stress benchmarks', () => {
  it('isotropic E = 1000 MPa, ν = 0.3, σ_xx = 10 MPa', () => {
    const S6 = iso(1000, 0.3);
    const r = solveMixed(psCompliance(S6), uniaxial(10));
    expectClose(r.strain[0], 0.01);
    expectClose(r.strain[1], -0.003);
    expect(r.strain[2]).toBe(0);
    const [ezz, gyz, gxz] = psOutStrain(S6, r.stress);
    expectClose(ezz, -0.003);
    expect(gyz).toBe(0);
    expect(gxz).toBe(0);
    expectClose(strainEnergyDensity(r), 0.5 * 10 * 0.01);
  });

  it('auxetic ν = −0.5 expands laterally under tension', () => {
    const r = solveMixed(psCompliance(iso(1000, -0.5)), uniaxial(10));
    expectClose(r.strain[1], 0.005);
  });

  it('isotropic reduced stiffness is E/(1−ν²)[1 ν 0; ν 1 0; 0 0 (1−ν)/2]', () => {
    const E = 1000;
    const nu = 0.3;
    const f = E / (1 - nu * nu);
    expectMatClose(psStiffness(iso(E, nu)), [[f, f * nu, 0], [f * nu, f, 0], [0, 0, (f * (1 - nu)) / 2]], 1e-12);
  });

  it('Q̄ is not the (1,2,6) block of C, and the 3D state has zero out-of-plane stress', () => {
    const S6 = preset('ortho-cfrp');
    const C6 = inverse(S6);
    const Q = psStiffness(S6);
    expect(maxAbsDiff(Q, submatrix(C6, IN_PLANE, IN_PLANE))).toBeGreaterThan(1);
    const sigma2 = [37, -12, 5];
    const sigma6 = [sigma2[0], sigma2[1], 0, 0, 0, sigma2[2]];
    const eps6 = matVec(S6, sigma6);
    const back = matVec(C6, eps6);
    for (const k of [2, 3, 4]) expect(Math.abs(back[k])).toBeLessThan(1e-9);
    expectMatClose([matVec(Q, IN_PLANE.map((k) => eps6[k]))], [sigma2], 1e-12);
  });
});

describe('normal–shear coupling', () => {
  it('aligned isotropic and orthotropic materials do not shear under uniaxial stress', () => {
    for (const S6 of [iso(70_000, 0.33), preset('ortho-cfrp')]) {
      expect(solveMixed(psCompliance(S6), uniaxial(50)).strain[2]).toBe(0);
    }
  });

  it('monoclinic material shears under uniaxial stress; sign follows η₁₂,₁', () => {
    const p = PRESETS.find((q) => q.id === 'mono-coupled')!;
    const build = (eta: number) => SYMMETRY_CLASSES.monoclinic.build({ ...p.params, eta12_1: eta });
    const plus = solveMixed(psCompliance(build(0.5)), uniaxial(50));
    const minus = solveMixed(psCompliance(build(-0.5)), uniaxial(50));
    const zero = solveMixed(psCompliance(build(0)), uniaxial(50));
    expect(plus.strain[2]).toBeGreaterThan(0);
    expectClose(minus.strain[2], -plus.strain[2]);
    expect(zero.strain[2]).toBe(0);
    expectClose(plus.strain[2] / plus.strain[0], 0.5); // η = γ_xy / ε_xx under σ_xx
  });

  it('S̄₁₆ = (Q̄₁₂Q̄₂₆ − Q̄₂₂Q̄₁₆)/det Q̄, so tension shears even with Q̄₁₆ = 0', () => {
    const Q: Mat = [[100, 30, 0], [30, 80, 20], [0, 20, 40]];
    const S = inverse(Q);
    const det = 100 * (80 * 40 - 20 * 20) - 30 * (30 * 40 - 0) + 0;
    expectClose(S[0][2], (Q[0][1] * Q[1][2] - Q[1][1] * Q[0][2]) / det);
    expect(S[0][2]).not.toBe(0);
    expect(solveMixed(S, uniaxial(1)).strain[2]).not.toBe(0);
  });
});

describe('mixed control', () => {
  const r = rng(11);
  const controls: Array<[Control, Control, Control]> = [];
  for (const a of ['stress', 'strain'] as Control[])
    for (const b of ['stress', 'strain'] as Control[]) for (const c of ['stress', 'strain'] as Control[]) controls.push([a, b, c]);

  it('all strain-controlled: stresses are a column of Q̄; all stress-controlled: strains are a column of S̄', () => {
    const S = randomSPD(3, r);
    const Q = inverse(S);
    for (let j = 0; j < 3; j++) {
      const e = [0, 0, 0] as [number, number, number];
      e[j] = 1;
      expectMatClose([solveMixed(S, { control: ['strain', 'strain', 'strain'], value: e }).stress], [Q.map((row) => row[j])], 1e-11);
      expectMatClose([solveMixed(S, { control: ['stress', 'stress', 'stress'], value: e }).strain], [S.map((row) => row[j])], 1e-12);
    }
  });

  it('random materials and controls: prescribed values hold, σ = Q̄ε, energies agree and are positive', () => {
    for (let trial = 0; trial < 50; trial++) {
      const S = randomSPD(3, r);
      const Q = inverse(S);
      const control = controls[trial % controls.length];
      const value = [r() - 0.5, r() - 0.5, r() - 0.5].map((v, i) => (control[i] === 'stress' ? 100 * v : 1e-3 * v)) as [number, number, number];
      const res = solveMixed(S, { control, value });
      for (let i = 0; i < 3; i++) expectClose(control[i] === 'stress' ? res.stress[i] : res.strain[i], value[i], 1e-12, 1e-18);
      expectMatClose([matVec(Q, res.strain)], [res.stress], 1e-10);
      const W = strainEnergyDensity(res);
      expect(W).toBeGreaterThan(0);
      expectClose(W, 0.5 * dot(res.strain, matVec(Q, res.strain)), 1e-10);
      expectClose(W, 0.5 * dot(res.stress, matVec(S, res.stress)), 1e-10);
    }
  });

  it('apparent axial stiffness lies in [1/S̄₁₁, Q̄₁₁] and only rises as locks are added', () => {
    for (let trial = 0; trial < 30; trial++) {
      const S = randomSPD(3, r);
      const Q = inverse(S);
      const M = (c1: Control, c2: Control) => apparentStiffness(Q, ['strain', c1, c2], 0);
      const free = M('stress', 'stress');
      expectClose(free, 1 / S[0][0], 1e-10);
      expectClose(M('strain', 'strain'), Q[0][0], 1e-12);
      for (const m of [M('strain', 'stress'), M('stress', 'strain')]) {
        expect(m).toBeGreaterThanOrEqual(free * (1 - 1e-12));
        expect(m).toBeLessThanOrEqual(Q[0][0] * (1 + 1e-12));
      }
      // Agrees with the solver: drive ε_xx, others traction-free / locked.
      const res = solveMixed(S, { control: ['strain', 'stress', 'strain'], value: [1e-3, 0, 0] });
      expectClose(res.stress[0] / res.strain[0], M('stress', 'strain'), 1e-10);
    }
  });
});

describe('directional moduli', () => {
  it('E(0) = 1/S̄₁₁, Q_n(0) = Q̄₁₁, and E(φ) ≤ Q_n(φ) everywhere', () => {
    const S2 = psCompliance(preset('mono-coupled'));
    const Q2 = inverse(S2);
    const d0 = directionalModuli(S2, Q2, 0);
    expectClose(d0.E, 1 / S2[0][0]);
    expectClose(d0.Cn, Q2[0][0]);
    for (let k = 0; k < 72; k++) {
      const d = directionalModuli(S2, Q2, (k * Math.PI) / 36);
      expect(d.E).toBeLessThanOrEqual(d.Cn * (1 + 1e-12));
    }
  });

  it('identity sanity: Q̄ S̄ = I for every preset', () => {
    for (const p of PRESETS) {
      const S6 = SYMMETRY_CLASSES[p.classId].build(p.params);
      expectMatClose(matMul(psStiffness(S6), psCompliance(S6)), identity(3), 1e-11);
    }
  });
});

describe('directional Poisson ratio', () => {
  it('ν(0) = νxy, ν(90°) = νyx, reciprocity ν(φ)/E(φ) = ν(φ+90°)/E(φ+90°)', () => {
    const S6 = preset('mono-coupled');
    const S2 = psCompliance(S6);
    const C2 = psStiffness(S6);
    expectClose(directionalModuli(S2, C2, 0).nu, -S2[1][0] / S2[0][0], 1e-12);
    expectClose(directionalModuli(S2, C2, Math.PI / 2).nu, -S2[0][1] / S2[1][1], 1e-9);
    for (const phi of [0.2, 0.9, 1.7, 2.6]) {
      const a = directionalModuli(S2, C2, phi);
      const b = directionalModuli(S2, C2, phi + Math.PI / 2);
      expectClose(a.nu / a.E, b.nu / b.E, 1e-9);
    }
  });

  it('isotropic: ν(φ) = ν in every direction; copper (001): ν goes negative along ⟨110⟩', () => {
    const S2 = psCompliance(iso(1000, 0.3));
    const C2 = psStiffness(iso(1000, 0.3));
    for (const phi of [0, 0.5, 1.1]) expectClose(directionalModuli(S2, C2, phi).nu, 0.3, 1e-12);
    const cu = preset('cubic-cu');
    expect(directionalModuli(psCompliance(cu), psStiffness(cu), Math.PI / 4).nu).toBeCloseTo(-0.136, 2);
  });
});
