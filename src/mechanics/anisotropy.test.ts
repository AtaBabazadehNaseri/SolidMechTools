import { describe, expect, it } from 'vitest';
import { PRESETS, SYMMETRY_CLASSES } from './materials';
import { planeExtremes, universalAnisotropy, voigtReuss, youngExtremes3D, youngModulus3D } from './anisotropy';
import { planeCompliance, planeStiffness } from './plane';
import { rotateComplianceVoigt } from './tensor';
import { expectClose, randomRotation, randomSPD, rng } from './testUtils';

const preset = (id: string) => {
  const p = PRESETS.find((q) => q.id === id)!;
  return { S: SYMMETRY_CLASSES[p.classId].build(p.params), p };
};

describe('anisotropy measures', () => {
  it('isotropic: A^U = 0, E(n) is a sphere, E(φ) and G(φ) are circles', () => {
    const { S } = preset('iso-steel');
    expect(Math.abs(universalAnisotropy(S))).toBeLessThan(1e-12);
    const e = youngExtremes3D(S, 500);
    expectClose(e.min, 200_000, 1e-12);
    expectClose(e.max, 200_000, 1e-12);
    const p = planeExtremes(planeCompliance(S, 'stress'), planeStiffness(S, 'stress'));
    expectClose(p.Emax / p.Emin, 1, 1e-12);
    expectClose(p.Gmax / p.Gmin, 1, 1e-12);
  });

  it('copper: E⟨100⟩ ≈ 66.7, E⟨111⟩ ≈ 191 GPa; A^U = (6/5)(√A − 1/√A)²', () => {
    const { S, p } = preset('cubic-cu');
    const e = youngExtremes3D(S);
    expectClose(e.min, p.params.E1, 1e-9);
    const s3 = 1 / Math.sqrt(3);
    expectClose(e.max, youngModulus3D(S, [s3, s3, s3]), 1e-9);
    expectClose(e.max / 1000, 191.1, 2e-3);
    const A = (2 * (1 + p.params.nu12) * p.params.G12) / p.params.E1;
    expectClose(universalAnisotropy(S), 1.2 * (Math.sqrt(A) - 1 / Math.sqrt(A)) ** 2, 1e-10);
  });

  it('Voigt ≥ Reuss and A^U ≥ 0 for random materials; A^U is frame-independent', () => {
    const r = rng(8);
    for (let k = 0; k < 20; k++) {
      const S = randomSPD(6, r);
      const b = voigtReuss(S);
      expect(b.KV).toBeGreaterThanOrEqual(b.KR * (1 - 1e-12));
      expect(b.GV).toBeGreaterThanOrEqual(b.GR * (1 - 1e-12));
      const a = universalAnisotropy(S);
      expect(a).toBeGreaterThanOrEqual(-1e-12);
      expectClose(universalAnisotropy(rotateComplianceVoigt(S, randomRotation(r))), a, 1e-9, 1e-12);
    }
  });

  it('unidirectional composite: in-plane E ratio equals E₁/E₂ in the fibre plane', () => {
    const { S, p } = preset('ortho-cfrp');
    const ext = planeExtremes(planeCompliance(S, 'stress'), planeStiffness(S, 'stress'));
    expectClose(ext.Emax / ext.Emin, p.params.E1 / p.params.E2, 1e-6);
  });
});
