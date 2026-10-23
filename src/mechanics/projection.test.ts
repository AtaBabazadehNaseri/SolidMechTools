import { describe, expect, it } from 'vitest';
import { type Mat, inverse, matMul, maxAbsDiff, submatrix, transpose } from './linalg';
import { PRESETS, SYMMETRY_CLASSES, type PlaneClassId, type SpaceClassId, knobInterval } from './index';
import { IN_PLANE } from './plane';
import {
  PLANE_ORDER,
  SPACE_ORDER,
  bestFit,
  effectivePlaneSymmetry,
  generateGroup,
  mandelToVoigt,
  planeClassFits,
  projectMandel,
  spaceClassFits,
  voigtToMandel,
} from './projection';
import { axesFromVectors, nearestRotation } from './orientation';
import { mandelRotation, rotateComplianceVoigt, rotationAxisAngle } from './tensor';
import { snapTargets } from './snapping';
import { randomRotation, rng } from './testUtils';

const S = (id: string) => {
  const p = PRESETS.find((x) => x.id === id)!;
  return SYMMETRY_CLASSES[p.classId].build(p.params);
};
const fit = (M: Mat, id: SpaceClassId) => spaceClassFits(M, 'compliance').find((f) => f.classId === id)!;
const rel = (A: Mat, B: Mat) => maxAbsDiff(A, B) / Math.max(...B.flat().map(Math.abs));

describe('symmetry groups and projections', () => {
  it('generate groups of the right order', () => {
    const rot = (a: [number, number, number], deg: number) => rotationAxisAngle(a, (deg * Math.PI) / 180);
    expect(generateGroup([rot([1, 0, 0], 90), rot([0, 1, 0], 90)]).length).toBe(24);
    expect(generateGroup([rot([0, 0, 1], 60), rot([1, 0, 0], 180)]).length).toBe(12);
    expect(generateGroup([rot([0, 0, 1], 90), rot([1, 0, 0], 180)]).length).toBe(8);
    expect(generateGroup([rot([0, 0, 1], 120), rot([1, 0, 0], 180)]).length).toBe(6);
    expect(generateGroup([rot([1, 0, 0], 180), rot([0, 1, 0], 180)]).length).toBe(4);
  });

  it('every preset is an exact member of its own class, in its own axes', () => {
    for (const p of PRESETS) {
      if (SYMMETRY_CLASSES[p.classId].dimension !== 3) continue;
      expect(fit(S(p.id), p.classId as SpaceClassId).distance, p.id).toBeLessThan(1e-12);
    }
  });

  it('projection is idempotent, and the residual is orthogonal to the class', () => {
    const r = rng(3);
    const M = rotateComplianceVoigt(S('tri-albite'), randomRotation(r));
    const Mm = voigtToMandel(M, 'compliance');
    for (const id of SPACE_ORDER) {
      const P = projectMandel(Mm, id);
      expect(rel(projectMandel(P, id), P), id).toBeLessThan(1e-10);
      // ⟨M − P, P⟩ = 0 for an orthogonal projection.
      const inner = Mm.flat().reduce((a, v, k) => a + (v - P.flat()[k]) * P.flat()[k], 0);
      expect(Math.abs(inner) / P.flat().reduce((a, v) => a + v * v, 0), id).toBeLessThan(1e-10);
    }
  });

  it('the isotropic part is invariant under any rotation', () => {
    const r = rng(5);
    const P = projectMandel(voigtToMandel(S('tri-albite'), 'compliance'), 'isotropic');
    const Q = mandelRotation(randomRotation(r));
    expect(rel(matMul(matMul(Q, P), transpose(Q)), P)).toBeLessThan(1e-12);
  });

  it('picks the highest symmetry: copper cubic, quartz trigonal, CFRP transversely isotropic about axis 1', () => {
    expect(bestFit(spaceClassFits(S('cubic-cu'), 'compliance'), SPACE_ORDER).classId).toBe('cubic');
    expect(bestFit(spaceClassFits(S('trig-quartz'), 'compliance'), SPACE_ORDER).classId).toBe('trigonal');
    const cf = bestFit(spaceClassFits(S('ortho-cfrp'), 'compliance'), SPACE_ORDER);
    expect(cf.classId).toBe('hexagonal');
    // Its symmetry axis (class axis 3) is the entered axis 1.
    expect(cf.relabel[2]).toEqual([1, 0, 0]);
    expect(bestFit(spaceClassFits(S('tri-albite'), 'compliance'), SPACE_ORDER).classId).toBe('triclinic');
  });

  it('a relabelled class reproduces the entered material exactly', () => {
    // Quartz with its 3-fold axis turned onto axis 1, and its 2-fold onto axis 2.
    const P: Mat = [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
    ];
    const entered = rotateComplianceVoigt(S('trig-quartz'), transpose(P));
    const f = fit(entered, 'trigonal');
    expect(f.distance).toBeLessThan(1e-12);
    const back = rotateComplianceVoigt(f.nearest, transpose(f.relabel));
    expect(rel(back, entered)).toBeLessThan(1e-12);
  });

  it('rounding-level noise stays within the rounding tolerance of the true class', () => {
    const r = rng(11);
    const C = inverse(S('cubic-cu')).map((row) => row.map((v) => (v === 0 ? 0 : v * (1 + 2e-4 * (r() - 0.5)))));
    const sym = C.map((row, i) => row.map((v, j) => 0.5 * (v + C[j][i])));
    const fits = spaceClassFits(sym, 'stiffness');
    expect(bestFit(fits, SPACE_ORDER).classId).toBe('cubic');
    const nearest = fits.find((f) => f.classId === 'cubic')!.nearest;
    expect(rel(nearest, inverse(S('cubic-cu')))).toBeLessThan(1e-3);
  });

  it('in-plane classes: steel isotropic, copper (001) square, aligned CFRP orthotropic, rotated CFRP anisotropic', () => {
    const block = (M: Mat) => submatrix(M, IN_PLANE, IN_PLANE);
    const best = (M: Mat) => bestFit(planeClassFits(block(M), 'compliance'), PLANE_ORDER).classId;
    expect(best(S('iso-steel'))).toBe('plane-isotropic');
    expect(best(S('cubic-cu'))).toBe('plane-square');
    expect(best(S('ortho-cfrp'))).toBe('plane-orthotropic');
    expect(best(rotateComplianceVoigt(S('ortho-cfrp'), rotationAxisAngle([0, 0, 1], 0.5)))).toBe('plane-anisotropic');
    // copper on (111) is isotropic in the plane
    const R111 = [
      [1 / Math.SQRT2, -1 / Math.SQRT2, 0],
      [1 / Math.sqrt(6), 1 / Math.sqrt(6), -2 / Math.sqrt(6)],
      [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)],
    ];
    expect(effectivePlaneSymmetry(rotateComplianceVoigt(S('cubic-cu'), R111))).toBe('plane-isotropic');
  });

  it('Mandel and Voigt conversions invert each other', () => {
    const M = S('tri-albite');
    expect(rel(mandelToVoigt(voigtToMandel(M, 'compliance'), 'compliance'), M)).toBeLessThan(1e-15);
    expect(rel(mandelToVoigt(voigtToMandel(inverse(M), 'stiffness'), 'stiffness'), inverse(M))).toBeLessThan(1e-15);
  });
});

describe('in-plane (2D) classes', () => {
  const sample: Record<PlaneClassId, Record<string, number>> = {
    'plane-isotropic': { E1: 200_000, nu12: 0.3 },
    'plane-square': { E1: 66_690, nu12: 0.419, G12: 75_400 },
    'plane-orthotropic': { E1: 181_000, E2: 10_300, nu12: 0.28, G12: 7_170 },
    'plane-anisotropic': { E1: 50_000, E2: 20_000, nu12: 0.25, G12: 10_000, eta12_1: 0.8, eta12_2: -0.3 },
  };

  it('embed the in-plane block exactly, decoupled from the placeholder', () => {
    for (const id of PLANE_ORDER) {
      const S6 = SYMMETRY_CLASSES[id].build(sample[id]);
      for (const i of [2, 3, 4]) for (const j of IN_PLANE) expect(S6[i][j]).toBe(0);
      expect(effectivePlaneSymmetry(S6)).toBe(id);
    }
  });

  it('isotropic sheets allow −1 < ν < 1, and orthotropic ones ν₁₂² < E₁/E₂', () => {
    const iso = knobInterval(SYMMETRY_CLASSES['plane-isotropic'], sample['plane-isotropic'], 'nu12');
    expect(iso.lo).toBeCloseTo(-1, 9);
    expect(iso.hi).toBeCloseTo(1, 9);
    const o = sample['plane-orthotropic'];
    const ortho = knobInterval(SYMMETRY_CLASSES['plane-orthotropic'], o, 'nu12');
    expect(ortho.hi).toBeCloseTo(Math.sqrt(o.E1 / o.E2), 9);
  });

  it('offer no snap targets from the placeholder out-of-plane entries', () => {
    for (const id of PLANE_ORDER) {
      const snaps = snapTargets(SYMMETRY_CLASSES[id], sample[id]);
      for (const s of Object.values(snaps)) for (const t of s.ticks) expect(t.label).not.toMatch(/₃/);
    }
  });

  it('every knob path is affine in its natural coordinate', () => {
    for (const id of PLANE_ORDER) {
      const cls = SYMMETRY_CLASSES[id];
      for (const d of cls.params) {
        const toG = (v: number) => (d.kind === 'modulus' ? 1 / v : v);
        const g0 = toG(sample[id][d.key]);
        const h = d.kind === 'modulus' ? 0.3 * g0 : 0.1;
        const at = (g: number) => cls.build({ ...sample[id], [d.key]: toG(g) });
        const second = at(g0 + 2 * h).map((row, i) => row.map((v, j) => v - 2 * at(g0 + h)[i][j] + at(g0)[i][j]));
        expect(Math.max(...second.flat().map(Math.abs)), `${id}.${d.key}`).toBeLessThan(1e-12 * Math.max(...at(g0).flat().map(Math.abs)));
      }
    }
  });
});

describe('orientation', () => {
  it('builds right-handed axes from axis 1 and a vector in the 1–2 plane', () => {
    const o = axesFromVectors([1, 1, 0], [0, 1, 0]);
    if ('error' in o) throw new Error(o.error);
    const R = o.R;
    expect(rel(matMul(transpose(R), R), [[1, 0, 0], [0, 1, 0], [0, 0, 1]])).toBeLessThan(1e-15);
    expect(R[0][0]).toBeCloseTo(Math.SQRT1_2, 15);
    expect(R[2][2]).toBeCloseTo(1, 15); // axis 3 = z
    expect('error' in axesFromVectors([1, 0, 0], [2, 0, 0])).toBe(true);
    expect('error' in axesFromVectors([0, 0, 0], [0, 1, 0])).toBe(true);
  });

  it('accepts rounded direction cosines and refuses left-handed or non-orthogonal sets', () => {
    const rounded = [
      [0.866, -0.5, 0],
      [0.5, 0.866, 0],
      [0, 0, 1],
    ];
    const o = nearestRotation(rounded);
    if ('error' in o) throw new Error(o.error);
    expect(rel(matMul(transpose(o.R), o.R), [[1, 0, 0], [0, 1, 0], [0, 0, 1]])).toBeLessThan(1e-14);
    expect(o.R[0][0]).toBeCloseTo(Math.cos(Math.PI / 6), 4);
    expect('error' in nearestRotation([[1, 0, 0], [0, 1, 0], [0, 0, -1]])).toBe(true);
    expect('error' in nearestRotation([[1, 0.1, 0], [0, 1, 0], [0, 0, 1]])).toBe(true);
  });
});
