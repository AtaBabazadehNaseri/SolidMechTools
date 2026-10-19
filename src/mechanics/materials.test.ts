import { describe, expect, it } from 'vitest';
import { inverse, isPositiveDefinite, isSymmetric, maxAbsDiff, scale, sub, add, type Mat } from './linalg';
import {
  PRESETS,
  SYMMETRY_CLASSES,
  type SymmetryClassId,
  paramsFromCompliance,
  stiffnessFromEntries,
} from './materials';
import { rotateComplianceVoigt, rotationAxisAngle } from './tensor';
import { expectClose, expectMatClose, randomRotation, rng } from './testUtils';

const presetFor = (cls: SymmetryClassId) => PRESETS.find((p) => p.classId === cls)!;
const rot = (axis: [number, number, number], deg: number) => rotationAxisAngle(axis, (deg * Math.PI) / 180);

const invariant = (S: Mat, R: Mat) => maxAbsDiff(rotateComplianceVoigt(S, R), S) < 1e-12 * Math.max(...S.flat().map(Math.abs));

describe('symmetry classes', () => {
  it('every preset is symmetric and positive definite', () => {
    for (const p of PRESETS) {
      const S = SYMMETRY_CLASSES[p.classId].build(p.params);
      expect(isSymmetric(S), p.id).toBe(true);
      expect(isPositiveDefinite(S), p.id).toBe(true);
    }
  });

  it('each class has the stated number of independent constants', () => {
    for (const cls of Object.values(SYMMETRY_CLASSES)) expect(cls.params.length).toBe(cls.independentConstants);
  });

  it('constants round-trip through the compliance', () => {
    for (const p of PRESETS) {
      const cls = SYMMETRY_CLASSES[p.classId];
      const back = paramsFromCompliance(cls, cls.build(p.params));
      for (const k of Object.keys(p.params)) expectClose(back[k], p.params[k], 1e-12, 1e-15);
    }
  });

  // Each class must be invariant under its symmetry operations, and the
  // lower-symmetry classes must NOT be invariant under higher-symmetry ones.
  const r = rng(7);
  const generators: Record<SymmetryClassId, Mat[]> = {
    isotropic: [randomRotation(r), randomRotation(r), randomRotation(r)],
    cubic: [rot([0, 0, 1], 90), rot([1, 0, 0], 90), rot([0, 1, 0], 90), rot([1, 1, 1], 120)],
    hexagonal: [rot([0, 0, 1], 37), rot([0, 0, 1], 60), rot([1, 0, 0], 180)],
    tetragonal: [rot([0, 0, 1], 90), rot([1, 0, 0], 180)],
    trigonal: [rot([0, 0, 1], 120), rot([1, 0, 0], 180)],
    orthotropic: [rot([1, 0, 0], 180), rot([0, 1, 0], 180), rot([0, 0, 1], 180)],
    monoclinic: [rot([0, 0, 1], 180)],
    triclinic: [],
  };
  const notInvariant: Record<SymmetryClassId, Mat[]> = {
    isotropic: [],
    cubic: [rot([0, 0, 1], 30)],
    hexagonal: [rot([1, 0, 0], 30)],
    tetragonal: [rot([0, 0, 1], 30), rot([1, 0, 0], 90)],
    trigonal: [rot([0, 0, 1], 90), rot([0, 1, 0], 180)],
    orthotropic: [rot([0, 0, 1], 90)],
    monoclinic: [rot([1, 0, 0], 180)],
    triclinic: [rot([0, 0, 1], 180)],
  };

  for (const id of Object.keys(generators) as SymmetryClassId[]) {
    it(`${id}: invariant under its symmetry operations only`, () => {
      const S = SYMMETRY_CLASSES[id].build(presetFor(id).params);
      for (const R of generators[id]) expect(invariant(S, R)).toBe(true);
      for (const R of notInvariant[id]) expect(invariant(S, R)).toBe(false);
    });
  }

  it('trigonal compliance built from published-style C_ij reproduces C exactly', () => {
    // C14 = −C24 = C56, C66 = (C11 − C12)/2 (MPa)
    const C = stiffnessFromEntries([
      [1, 1, 86600], [2, 2, 86600], [3, 3, 106100],
      [1, 2, 6700], [1, 3, 12600], [2, 3, 12600],
      [4, 4, 57800], [5, 5, 57800], [6, 6, (86600 - 6700) / 2],
      [1, 4, 17800], [2, 4, -17800], [5, 6, 17800],
    ]);
    const cls = SYMMETRY_CLASSES.trigonal;
    expectMatClose(inverse(cls.build(paramsFromCompliance(cls, inverse(C)))), C, 1e-11);
  });

  it('copper preset: E_100 ≈ 66.7 GPa, ν ≈ 0.419, Zener ratio ≈ 3.21', () => {
    const p = presetFor('cubic').params;
    expectClose(p.E1, 66_690, 1e-3);
    expectClose(p.nu12, 0.4189, 1e-3);
    // Zener ratio A = 2C44/(C11 − C12) = 2(1 + ν)G/E in engineering constants.
    expectClose((2 * (1 + p.nu12) * p.G12) / p.E1, 3.209, 1e-3);
  });

  // Holding the other constants fixed, each knob must move S along a straight
  // line (in 1/value for moduli). The exact admissible-interval method relies on it.
  it('every knob path is affine in its natural coordinate', () => {
    for (const p of PRESETS) {
      const cls = SYMMETRY_CLASSES[p.classId];
      for (const d of cls.params) {
        const toG = (v: number) => (d.kind === 'modulus' ? 1 / v : v);
        const g0 = toG(p.params[d.key]);
        const h = d.kind === 'modulus' ? 0.3 * g0 : 0.1;
        const S = (g: number) => cls.build({ ...p.params, [d.key]: toG(g) });
        const secondDiff = add(sub(S(g0 + 2 * h), scale(S(g0 + h), 2)), S(g0));
        const ref = Math.max(...S(g0).flat().map(Math.abs));
        expect(Math.max(...secondDiff.flat().map(Math.abs)), `${p.id}.${d.key}`).toBeLessThan(1e-12 * ref);
      }
    }
  });
});
