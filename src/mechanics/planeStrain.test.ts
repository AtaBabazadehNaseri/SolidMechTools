import { describe, expect, it } from 'vitest';
import { inverse, matVec, submatrix, sub, symmetricEigen } from './linalg';
import { PRESETS, SYMMETRY_CLASSES } from './materials';
import {
  IN_PLANE,
  OUT_OF_PLANE,
  directionalModuli,
  directionalShearCoupling,
  outOfPlane,
  planeCompliance,
  planeStiffness,
  solveMixed,
} from './plane';
import { rotateComplianceVoigt, rotationZ } from './tensor';
import { expectClose, expectMatClose, randomSPD, rng } from './testUtils';

const iso = (E: number, nu: number) => SYMMETRY_CLASSES.isotropic.build({ E1: E, nu12: nu });
const preset = (id: string) => {
  const p = PRESETS.find((q) => q.id === id)!;
  return SYMMETRY_CLASSES[p.classId].build(p.params);
};

describe('plane strain', () => {
  it('isotropic: C̄ = E/((1+ν)(1−2ν)) [1−ν ν 0; ν 1−ν 0; 0 0 (1−2ν)/2]', () => {
    const E = 1000;
    const nu = 0.3;
    const f = E / ((1 + nu) * (1 - 2 * nu));
    expectMatClose(planeStiffness(iso(E, nu), 'strain'), [[f * (1 - nu), f * nu, 0], [f * nu, f * (1 - nu), 0], [0, 0, (f * (1 - 2 * nu)) / 2]], 1e-12);
  });

  it('isotropic: the out-of-plane reaction is σzz = ν(σxx + σyy)', () => {
    const S6 = iso(1000, 0.3);
    const S2 = planeCompliance(S6, 'strain');
    const r = solveMixed(S2, { control: ['stress', 'strain', 'stress'], value: [10, 0.002, 3] });
    const out = outOfPlane(S6, 'strain', r);
    expectClose(out.stress[0], 0.3 * (r.stress[0] + r.stress[1]));
    expect(out.strain).toEqual([0, 0, 0]);
  });

  it('orthotropic reduced compliance S̄ᵢⱼ = Sᵢⱼ − Sᵢ₃Sⱼ₃/S₃₃ (Lekhnitskii)', () => {
    const S6 = preset('ort-9a');
    const S2 = planeCompliance(S6, 'strain');
    for (const [a, i] of IN_PLANE.entries())
      for (const [b, j] of IN_PLANE.entries()) expectClose(S2[a][b], S6[i][j] - (S6[i][2] * S6[j][2]) / S6[2][2], 1e-12, 1e-18);
  });

  it('general anisotropy: reduced compliance is the Schur complement over zz, yz, xz', () => {
    const r = rng(5);
    for (let k = 0; k < 10; k++) {
      const S6 = randomSPD(6, r);
      const Spp = submatrix(S6, IN_PLANE, IN_PLANE);
      const Spo = submatrix(S6, IN_PLANE, OUT_OF_PLANE);
      const Soo = submatrix(S6, OUT_OF_PLANE, OUT_OF_PLANE);
      const X = inverse(Soo);
      const schur = Spp.map((row, a) =>
        row.map((v, b) => {
          let s = 0;
          for (let m = 0; m < 3; m++) for (let n = 0; n < 3; n++) s += Spo[a][m] * X[m][n] * Spo[b][n];
          return v - s;
        }),
      );
      expectMatClose(planeCompliance(S6, 'strain'), schur, 1e-10);
    }
  });

  it('3D consistency: embedding the in-plane strain with εzz = γyz = γxz = 0 recovers σ = C̄ε and the reactions', () => {
    const S6 = rotateComplianceVoigt(preset('trc-21a'), rotationZ(0.4));
    const C6 = inverse(S6);
    const r = solveMixed(planeCompliance(S6, 'strain'), { control: ['stress', 'stress', 'stress'], value: [40, -10, 7] });
    const eps6 = [r.strain[0], r.strain[1], 0, 0, 0, r.strain[2]];
    const sig6 = matVec(C6, eps6);
    expectMatClose([IN_PLANE.map((k) => sig6[k])], [r.stress], 1e-10);
    expectMatClose([OUT_OF_PLANE.map((k) => sig6[k])], [outOfPlane(S6, 'strain', r).stress], 1e-10);
  });

  it('plane strain is stiffer than plane stress: C̄_strain − C̄_stress is positive semi-definite', () => {
    const r = rng(9);
    for (let k = 0; k < 20; k++) {
      const S6 = randomSPD(6, r);
      const d = sub(planeStiffness(S6, 'strain'), planeStiffness(S6, 'stress'));
      const { values } = symmetricEigen(d.map((row, i) => row.map((v, j) => 0.5 * (v + d[j][i]))));
      expect(values[0]).toBeGreaterThan(-1e-9 * Math.max(...values.map(Math.abs)));
    }
  });

  it('near incompressibility stiffens plane strain without bound, but not plane stress', () => {
    const S6 = iso(1000, 0.499);
    expect(planeStiffness(S6, 'strain')[0][0] / planeStiffness(S6, 'stress')[0][0]).toBeGreaterThan(100);
  });
});

describe('directional extension–shear coupling', () => {
  it('γ_nt/ε_nn = ½ E · d(1/E)/dφ, so it vanishes exactly where E(φ) is stationary', () => {
    for (const mode of ['stress', 'strain'] as const) {
      const S6 = rotateComplianceVoigt(preset('mon-13b'), rotationZ(0.3));
      const S2 = planeCompliance(S6, mode);
      const C2 = planeStiffness(S6, mode);
      for (const phi of [0.1, 0.7, 1.3, 2.2, 2.9]) {
        const h = 1e-6;
        const dInvE = (1 / directionalModuli(S2, C2, phi + h).E - 1 / directionalModuli(S2, C2, phi - h).E) / (2 * h);
        const E = directionalModuli(S2, C2, phi).E;
        expectClose(directionalShearCoupling(S2, phi), 0.5 * E * dInvE, 1e-6);
      }
    }
  });
});
