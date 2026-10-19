import { describe, expect, it } from 'vitest';
import { isPositiveDefinite } from './linalg';
import { PRESETS, SYMMETRY_CLASSES } from './materials';
import { knobInterval } from './admissibility';
import { psCompliance } from './testUtils';
import { expectClose } from './testUtils';

const ortho = SYMMETRY_CLASSES.orthotropic;
const mono = SYMMETRY_CLASSES.monoclinic;

describe('positive definiteness', () => {
  it('isotropic: 3D admissibility is −1 < ν < ½, while the 2D block alone would allow ν < 1', () => {
    const iso = SYMMETRY_CLASSES.isotropic;
    expect(isPositiveDefinite(iso.build({ E1: 1000, nu12: 0.49 }))).toBe(true);
    expect(isPositiveDefinite(iso.build({ E1: 1000, nu12: 0.5 }))).toBe(false);
    expect(isPositiveDefinite(iso.build({ E1: 1000, nu12: 0.6 }))).toBe(false);
    expect(isPositiveDefinite(iso.build({ E1: 1000, nu12: -1 }))).toBe(false);
    expect(isPositiveDefinite(psCompliance(iso.build({ E1: 1000, nu12: 0.6 })))).toBe(true);
  });
});

describe('knob intervals', () => {
  it('isotropic: ν ∈ (−1, ½), E ∈ (0, ∞)', () => {
    const cls = SYMMETRY_CLASSES.isotropic;
    const nu = knobInterval(cls, { E1: 1000, nu12: 0.2 }, 'nu12');
    expectClose(nu.lo, -1, 1e-10);
    expectClose(nu.hi, 0.5, 1e-10);
    const E = knobInterval(cls, { E1: 1000, nu12: 0.2 }, 'E1');
    expect(E.lo).toBe(0);
    expect(E.hi).toBe(Infinity);
  });

  it('orthotropic with ν₁₃ = ν₂₃ = 0: |ν₁₂| < √(E₁/E₂) and E₂ < E₁/ν₁₂²', () => {
    const p = { E1: 140_000, E2: 10_000, E3: 10_000, nu12: 0.3, nu13: 0, nu23: 0, G23: 3000, G13: 5000, G12: 5000 };
    const nu = knobInterval(ortho, p, 'nu12');
    expectClose(nu.hi, Math.sqrt(140 / 10), 1e-10);
    expectClose(nu.lo, -Math.sqrt(140 / 10), 1e-10);
    // 1 − ν12 ν21 > 0 with ν21 = ν12 E2/E1  ⇒  E2 < E1/ν12² (E1 held fixed)
    const E2 = knobInterval(ortho, p, 'E2');
    expect(E2.lo).toBe(0);
    expectClose(E2.hi, 140_000 / 0.09, 1e-10);
  });

  it('monoclinic extension–shear coupling alone: |η₁₂,₁| < √(E₁/G₁₂)', () => {
    const p = {
      E1: 50_000, E2: 20_000, E3: 15_000, nu12: 0, nu13: 0, nu23: 0, G23: 5000, G13: 6000, G12: 10_000,
      eta12_1: 0.2, eta12_2: 0, eta12_3: 0, mu13_23: 0,
    };
    const eta = knobInterval(mono, p, 'eta12_1');
    expectClose(eta.hi, Math.sqrt(5), 1e-10);
    expectClose(eta.lo, -Math.sqrt(5), 1e-10);
  });

  it('for every preset and knob: current value is inside, the ends are exactly the PD boundary', () => {
    for (const preset of PRESETS) {
      const cls = SYMMETRY_CLASSES[preset.classId];
      for (const d of cls.params) {
        const { lo, hi } = knobInterval(cls, preset.params, d.key);
        const v = preset.params[d.key];
        expect(v, `${preset.id}.${d.key}`).toBeGreaterThan(lo);
        expect(v, `${preset.id}.${d.key}`).toBeLessThan(hi);
        const pd = (x: number) => isPositiveDefinite(cls.build({ ...preset.params, [d.key]: x }));
        const eps = 1e-6;
        if (Number.isFinite(hi) && hi !== 0) {
          expect(pd(hi - eps * Math.abs(hi)), `${preset.id}.${d.key} below hi`).toBe(true);
          expect(pd(hi + eps * Math.abs(hi)), `${preset.id}.${d.key} above hi`).toBe(false);
        }
        if (Number.isFinite(lo) && lo !== 0) {
          expect(pd(lo + eps * Math.abs(lo)), `${preset.id}.${d.key} above lo`).toBe(true);
          expect(pd(lo - eps * Math.abs(lo)), `${preset.id}.${d.key} below lo`).toBe(false);
        }
      }
    }
  });
});
