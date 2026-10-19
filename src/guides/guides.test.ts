import { describe, expect, it } from 'vitest';
import { planeCompliance, rotateComplianceVoigt, specimenRotation, SYMMETRY_CLASSES, PRESETS, tractionOnCut } from '../mechanics';
import { deriveLab, initialState, type LabState } from '../app/lab';
import { GUIDES } from './index';
import { etaForZeroC16 } from './c1-c16-still-shears';
import { withExperiment, withParam } from './helpers';

/** Walk a guide as a learner who presses "Show me" on every task. */
function walk(run: (stepIndex: number, before: LabState, after: LabState) => void, guideIndex: number) {
  let s = initialState('iso-steel');
  GUIDES[guideIndex].steps.forEach((step, k) => {
    if (step.setup) s = step.setup(s);
    if (step.predict?.reveal) s = step.predict.reveal(s);
    const before = s;
    if (step.task) s = step.task.solve(s);
    run(k, before, s);
  });
}

describe('guides', () => {
  for (const [g, guide] of GUIDES.entries()) {
    describe(guide.title, () => {
      it('every prediction has exactly one correct option', () => {
        for (const step of guide.steps) if (step.predict) expect(step.predict.options.filter((o) => o.correct).length).toBe(1);
      });

      it('every step derives a valid lab state', () => {
        walk((_k, before, after) => {
          expect(() => deriveLab(before)).not.toThrow();
          expect(() => deriveLab(after)).not.toThrow();
        }, g);
      });

      it('every task starts unsolved and "Show me" solves it', () => {
        walk((k, before, after) => {
          const task = guide.steps[k].task;
          if (!task) return;
          expect(task.check(before, deriveLab(before)), `step ${k + 1} already solved`).toBe(false);
          expect(task.check(after, deriveLab(after)), `step ${k + 1} not solved by solve()`).toBe(true);
        }, g);
      });

      it('unlocked parameters exist in the material of their step', () => {
        walk((k, before) => {
          for (const c of guide.steps[k].controls ?? []) if (c.kind === 'param') expect(before.params).toHaveProperty(c.key);
        }, g);
      });
    });
  }
});

// The numbers quoted in the guide texts must match the engine.
describe('claims made in guide texts', () => {
  const cu = PRESETS.find((p) => p.id === 'cubic-cu')!;
  const S6cu45 = rotateComplianceVoigt(SYMMETRY_CLASSES.cubic.build(cu.params), specimenRotation('n3', Math.PI / 4));

  it('copper along ⟨110⟩: ν_xy ≈ −0.14 in plane, ν_xz ≈ 0.82 through the thickness', () => {
    const S2 = planeCompliance(S6cu45, 'stress');
    expect(-S2[1][0] / S2[0][0]).toBeCloseTo(-0.136, 2);
    expect(-S6cu45[2][0] / S6cu45[0][0]).toBeCloseTo(0.818, 2);
  });

  it('copper along ⟨110⟩ in plane strain: contracts, with σzz ≈ 0.42 σxx', () => {
    let s = initialState('cubic-cu');
    s = { ...s, thetaDeg: 45, mode: 'strain' };
    const d = deriveLab(s);
    expect(d.response.strain[1]).toBeLessThan(0);
    expect(d.out.stress[0] / d.response.stress[0]).toBeCloseTo(0.42, 2);
  });

  it('T300/5208: a third no-shear direction appears below G₁₂ ≈ 5.07 GPa', () => {
    const base = initialState('ortho-cfrp');
    const threshold = 1 / (2 / base.params.E2 + (2 * base.params.nu12) / base.params.E1);
    expect(threshold / 1000).toBeCloseTo(5.07, 2);
    expect(deriveLab(withParam(base, 'G12', threshold * 1.02)).coaxial.angles.length).toBe(2);
    expect(deriveLab(withParam(base, 'G12', threshold * 0.98)).coaxial.angles.length).toBe(4);
  });

  it('monoclinic preset: η₁₂,₁ = −ν₁₂ η₁₂,₂ zeroes C̄₁₆ while S̄₁₆ ≠ 0, and η₁₂,₁ = 0 does the reverse', () => {
    const base = initialState('mono-coupled');
    const a = deriveLab(withParam(base, 'eta12_1', etaForZeroC16(base)));
    expect(Math.abs(a.C2[0][2])).toBeLessThan(1e-9 * a.C2[2][2]);
    expect(Math.abs(a.S2[0][2])).toBeGreaterThan(1e-3 * a.S2[2][2]);
    expect(a.response.strain[2] / a.response.strain[0]).toBeCloseTo(0.075, 6); // quoted in step 2
    const b = deriveLab(withParam(base, 'eta12_1', 0));
    expect(Math.abs(b.S2[0][2])).toBe(0);
    expect(Math.abs(b.C2[0][2])).toBeGreaterThan(1e-3 * b.C2[2][2]);
  });
});

describe('claims made in the second batch of guides', () => {
  it('two constants: steel G = E/2(1+ν) = 76.9 GPa, and the 45° cut of pure shear carries pure tension', () => {
    const s = { ...withExperiment(initialState('iso-steel'), 'shear'), cutDeg: 45 };
    const d = deriveLab(s);
    expect(d.plane.Gxy / 1000).toBeCloseTo(76.92, 2);
    const t = tractionOnCut(d.response.stress, Math.PI / 4);
    expect(t.normal).toBeCloseTo(s.scales.stress, 9);
    expect(Math.abs(t.shear)).toBeLessThan(1e-9 * s.scales.stress);
  });

  it('two constants: freeing G with A > 1 makes the diagonals stiffer; copper E⟨100⟩, E⟨110⟩ and its isotropic ν', () => {
    const steelCubic = { ...initialState('cubic-cu'), custom: true, params: { E1: 200_000, nu12: 0.3, G12: (1.8 * 200_000) / 2.6 } };
    const d0 = deriveLab(steelCubic);
    const d45 = deriveLab({ ...steelCubic, thetaDeg: 45 });
    expect(d45.plane.Ex).toBeGreaterThan(d0.plane.Ex * 1.05);
    const cu = initialState('cubic-cu');
    expect(deriveLab(cu).plane.Ex / 1000).toBeCloseTo(66.69, 1);
    expect(deriveLab({ ...cu, thetaDeg: 45 }).plane.Ex / 1000).toBeCloseTo(130.3, 1);
    expect(cu.params.E1 / (2 * cu.params.G12) - 1).toBeCloseTo(-0.558, 3);
  });

  it('looks isotropic: copper (111) has E = 130.3 GPa in every direction; γyz vanishes at 30°, γxz at 0°', () => {
    const base = { ...initialState('cubic-cu'), section: 'n111' as const };
    for (const t of [0, 17, 45, 80]) expect(deriveLab({ ...base, thetaDeg: t }).plane.Ex / 1000).toBeCloseTo(130.3, 1);
    const at = (t: number) => deriveLab({ ...base, thetaDeg: t }).out.strain;
    expect(Math.abs(at(30)[1])).toBeLessThan(1e-9 * Math.abs(at(30)[2]));
    expect(Math.abs(at(0)[2])).toBeLessThan(1e-9 * Math.abs(at(0)[1]));
  });

  it('looks isotropic: quartz in plane strain develops τyz/τxz reactions but no τxy', () => {
    const d = deriveLab({ ...initialState('trig-quartz'), mode: 'strain' });
    expect(Math.hypot(d.out.stress[1], d.out.stress[2])).toBeGreaterThan(1);
    expect(Math.abs(d.C2[0][2])).toBeLessThan(1e-9 * d.C2[0][0]);
  });

  it('plane-stress input: the 3D block overstates C̄22 by 20 %, C̄12 by 68 %, C̄11 by 1 %; ν = 0.495 gives ×25', () => {
    const ps = deriveLab(initialState('ortho-cfrp')).C2;
    const pe = deriveLab({ ...initialState('ortho-cfrp'), mode: 'strain' }).C2;
    expect(ps[1][1] / 1000).toBeCloseTo(10.35, 2);
    expect(pe[1][1] / 1000).toBeCloseTo(12.39, 2);
    expect(ps[0][1] / 1000).toBeCloseTo(2.9, 2);
    expect(pe[0][1] / 1000).toBeCloseTo(4.88, 2);
    expect(pe[1][1] / ps[1][1]).toBeCloseTo(1.2, 1);
    expect(pe[0][1] / ps[0][1]).toBeCloseTo(1.68, 2);
    expect(pe[0][0] / ps[0][0]).toBeCloseTo(1.01, 2);
    const steel = withParam(initialState('iso-steel'), 'nu12', 0.495);
    const ratio = deriveLab({ ...steel, mode: 'strain' }).C2[0][0] / deriveLab(steel).C2[0][0];
    expect(ratio).toBeCloseTo(25.5, 1);
  });
});
