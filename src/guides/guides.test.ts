import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  SYMMETRY_CLASSES,
  directionalModuli,
  inverse,
  kelvinModuli,
  knobInterval,
  planeCompliance,
  planeExtremes,
  rotateComplianceVoigt,
  specimenRotation,
  strainPrincipal,
  tractionOnCut,
  universalAnisotropy,
  youngExtremes3D,
} from '../mechanics';
import { constraintLadder, deriveLab, initialState, type LabState } from '../app/lab';
import { GUIDES } from './index';
import type { PanelId } from './types';
import { etaForZeroC16 } from './c1-c16-still-shears';
import { ISO_ORTHO, SCULPT_E1, SCULPT_G12, eAt, shearTerm, stiffest } from './b3-sculpt-e';
import { CUBIC_A, gInverseA } from './c4-anisotropy-indices';
import { kelvinModulusOf, principalGap, withExperiment, withParam } from './helpers';
import { currentPhase, entryState } from './runner';

/** Walk a guide as a learner who answers every prediction and presses "Show me" on every task. */
function walk(run: (stepIndex: number, before: LabState, after: LabState) => void, guideIndex: number) {
  let s = initialState('iso-2a');
  GUIDES[guideIndex].steps.forEach((step, k) => {
    if (step.setup) s = step.setup(s);
    if (step.predict?.reveal) s = step.predict.reveal(s);
    const before = s;
    if (step.try?.task) s = step.try.task.solve(s);
    run(k, before, s);
  });
}

const mat = (id: string) => SYMMETRY_CLASSES[PRESETS.find((p) => p.id === id)!.classId].build(PRESETS.find((p) => p.id === id)!.params);
const ratio = (d: ReturnType<typeof deriveLab>) => d.planeExt.Emax / d.planeExt.Emin;

describe('guides', () => {
  for (const [g, guide] of GUIDES.entries()) {
    describe(guide.title, () => {
      it('every question has exactly one correct option', () => {
        for (const step of guide.steps)
          for (const q of [step.predict, step.observe]) if (q) expect(q.options.filter((o) => o.correct).length, `${step.title}: ${q.question}`).toBe(1);
      });

      it('every step sets the scene and shows the panels it refers to', () => {
        for (const step of guide.steps) {
          expect(step.context.length, step.title).toBeGreaterThan(0);
          const later = step.try?.show ?? [];
          for (const p of later) expect(step.show, `${step.title}: ${p} is shown twice`).not.toContain(p);
          const all = new Set<PanelId>([...step.show, ...later]);
          if (step.sweep) expect(all.has('sweep'), `${step.title}: sweep quantity without the sweep panel`).toBe(true);
          if (all.has('ladder')) expect(all.has('response'), `${step.title}: the ladder lives in the response panel`).toBe(true);
          for (const c of step.try?.controls ?? []) if (c.kind === 'preset') for (const id of c.ids) expect(PRESETS.some((p) => p.id === id)).toBe(true);
        }
      });

      it('every step derives a valid lab state', () => {
        walk((_k, before, after) => {
          expect(() => deriveLab(before)).not.toThrow();
          expect(() => deriveLab(after)).not.toThrow();
        }, g);
      });

      it('every task starts unsolved and "Show me" solves it', () => {
        walk((k, before, after) => {
          const task = guide.steps[k].try?.task;
          if (!task) return;
          expect(task.check(before, deriveLab(before)), `step ${k + 1} already solved`).toBe(false);
          expect(task.check(after, deriveLab(after)), `step ${k + 1} not solved by solve()`).toBe(true);
        }, g);
      });

      it('no task is already met before its prediction is answered (an unloaded state must not pass)', () => {
        guide.steps.forEach((step, k) => {
          const task = step.try?.task;
          if (!task || !step.predict) return;
          const s = entryState(guide, k, initialState('iso-2a'), false);
          expect(task.check(s, deriveLab(s)), `step ${k + 1}`).toBe(false);
        });
      });

      it('unlocked parameters exist in the material of their step', () => {
        walk((k, before) => {
          for (const c of guide.steps[k].try?.controls ?? []) if (c.kind === 'param') expect(before.params).toHaveProperty(c.key);
        }, g);
      });

      it('readouts and snap points evaluate on the state of their step', () => {
        walk((k, before, after) => {
          const t = guide.steps[k].try;
          for (const s of [before, after]) {
            const d = deriveLab(s);
            for (const [, v] of t?.readouts?.(s, d) ?? []) expect(v).not.toMatch(/NaN|Infinity/);
            for (const list of Object.values(t?.extraSnaps?.(s) ?? {})) for (const snap of list) expect(Number.isFinite(snap.value)).toBe(true);
          }
        }, g);
      });
    });
  }
});

describe('step phases', () => {
  it('run predict → try → observe → explain, skipping the ones a step lacks', () => {
    const step = GUIDES.find((x) => x.id === 'negative-poisson')!.steps[4];
    expect(currentPhase(step, false, false, false)).toBe('predict');
    expect(currentPhase(step, true, false, false)).toBe('try');
    expect(currentPhase(step, true, true, false)).toBe('observe');
    expect(currentPhase(step, true, true, true)).toBe('explain');
    const checklist = GUIDES.find((x) => x.id === 'plane-stress-input')!.steps[3];
    expect(currentPhase(checklist, false, false, false)).toBe('done');
  });
});

describe('direct navigation (jumping to any step)', () => {
  for (const guide of GUIDES) {
    it(`${guide.title}: every step is self-contained when entered directly`, () => {
      const start = initialState('iso-2a');
      guide.steps.forEach((step, k) => {
        const s = entryState(guide, k, start, true);
        expect(() => deriveLab(s)).not.toThrow();
        const task = step.try?.task;
        if (!task) return;
        expect(task.check(s, deriveLab(s)), `step ${k + 1} already solved on entry`).toBe(false);
        const solved = task.solve(s);
        expect(task.check(solved, deriveLab(solved)), `step ${k + 1} not solved by solve()`).toBe(true);
      });
    });
  }

  it('the reported bug: jumping to "Rotate the fibres" arrives with the load applied', () => {
    const g = GUIDES.find((x) => x.id === 'pull-without-shear')!;
    const s = entryState(g, 1, initialState('iso-2a'), false);
    expect(s.load.value[0]).toBeGreaterThan(0);
  });
});

// The numbers quoted in the guide texts must match the engine.
describe('claims: Poisson ratio and two constants (Level 1)', () => {
  const cub = PRESETS.find((p) => p.id === 'cub-3a')!;
  const S6cub45 = rotateComplianceVoigt(SYMMETRY_CLASSES.cubic.build(cub.params), specimenRotation('n3', Math.PI / 4));

  it('cubic crystal along ⟨110⟩: ν_xy ≈ −0.11 in plane, ν_xz ≈ 0.78 through the thickness, nearly twice the cube-axis 0.41', () => {
    const S2 = planeCompliance(S6cub45, 'stress');
    expect(-S2[1][0] / S2[0][0]).toBeCloseTo(-0.11, 2);
    expect(-S6cub45[2][0] / S6cub45[0][0]).toBeCloseTo(0.78, 2);
    expect(deriveLab(initialState('cub-3a')).constants.nuxz).toBeCloseTo(0.41, 2);
  });

  it('cubic crystal along ⟨110⟩ in plane strain: contracts, with σzz ≈ 0.41 σxx', () => {
    const d = deriveLab({ ...initialState('cub-3a'), thetaDeg: 45, mode: 'strain' });
    expect(d.response.strain[1]).toBeLessThan(0);
    expect(d.out.stress[0] / d.response.stress[0]).toBeCloseTo(0.41, 2);
  });

  it('two constants: isotropic G = E/2(1+ν) = 76.9 GPa, and the 45° cut of pure shear carries pure tension τ', () => {
    const s = { ...withExperiment(initialState('iso-2a'), 'shear'), cutDeg: 45 };
    const d = deriveLab(s);
    expect(d.plane.Gxy / 1000).toBeCloseTo(76.92, 2);
    const t = tractionOnCut(d.response.stress, Math.PI / 4);
    expect(t.normal).toBeCloseTo(s.scales.stress, 9);
    expect(Math.abs(t.shear)).toBeLessThan(1e-9 * s.scales.stress);
  });

  it('two constants: a raised G makes the diagonals stiffer; the cubic crystal’s E⟨100⟩, E⟨110⟩ (about half the stretch), E⟨111⟩, isotropic ν', () => {
    const isoLikeCubic = { ...initialState('cub-3a'), custom: true, params: { E1: 200_000, nu12: 0.3, G12: (1.8 * 200_000) / 2.6 } };
    expect(deriveLab({ ...isoLikeCubic, thetaDeg: 45 }).plane.Ex).toBeGreaterThan(deriveLab(isoLikeCubic).plane.Ex * 1.05);
    const c = initialState('cub-3a');
    const d0 = deriveLab(c);
    const d45 = deriveLab({ ...c, thetaDeg: 45 });
    expect(d0.plane.Ex / 1000).toBeCloseTo(70.7, 1);
    expect(d45.plane.Ex / 1000).toBeCloseTo(133.7, 1);
    expect(d45.response.strain[0] / d0.response.strain[0]).toBeCloseTo(0.53, 2);
    expect(youngExtremes3D(mat('cub-3a')).max / 1000).toBeCloseTo(190, 0);
    expect(c.params.E1 / (2 * c.params.G12) - 1).toBeCloseTo(-0.53, 2);
  });

  it('cubic with G below its isotropic value: E is largest along the axes, smallest along the diagonals', () => {
    const lowG = { ...initialState('cub-3a'), custom: true, params: { E1: 200_000, nu12: 0.3, G12: (0.6 * 200_000) / 2.6 } };
    expect(deriveLab(lowG).plane.Ex).toBeGreaterThan(deriveLab({ ...lowG, thetaDeg: 45 }).plane.Ex * 1.05);
  });
});

describe('claims: E₁ and Eₓ (Level 1)', () => {
  const cf = initialState('ort-9b');
  const ex = (t: number) => deriveLab({ ...cf, thetaDeg: t }).plane.Ex / 1000;

  it('fibre composite: Eₓ = 180 → 10 GPa at 90°, 16.3 GPa at 45°, and 15 %, 41 %, 84 % lost at 5°, 10°, 30°', () => {
    expect(ex(0)).toBeCloseTo(180, 9);
    expect(ex(90)).toBeCloseTo(10, 9);
    expect(ex(45)).toBeCloseTo(16.32, 2);
    expect(ex(5)).toBeCloseTo(153.2, 1);
    expect(1 - ex(5) / ex(0)).toBeCloseTo(0.15, 2);
    expect(1 - ex(10) / ex(0)).toBeCloseTo(0.41, 2);
    expect(1 - ex(30) / ex(0)).toBeCloseTo(0.84, 2);
  });

  it('the 45° formula holds, with 1/G₁₂ more than half of the sum', () => {
    const p = cf.params;
    const sum = 1 / p.E1 + 1 / p.E2 + 1 / p.G12 - (2 * p.nu12) / p.E1;
    expect(4 / sum / 1000).toBeCloseTo(ex(45), 9);
    expect(1 / p.G12 / sum).toBeGreaterThan(0.5);
  });

  it('the sweep is the polar curve unrolled: Eₓ(θ) = E(−θ) of the unrotated material', () => {
    const d0 = deriveLab(cf);
    for (const t of [10, 30, 60, -20]) expect(ex(t) * 1000).toBeCloseTo(directionalModuli(d0.S2, d0.C2, (-t * Math.PI) / 180).E, 6);
  });

  it('cubic crystal: Eₓ along the face diagonal is nearly twice E₁', () => {
    const c = initialState('cub-3a');
    expect(deriveLab({ ...c, thetaDeg: 45 }).plane.Ex / c.params.E1).toBeCloseTo(1.89, 2);
  });
});

describe('claims: pure tension and shear (Level 2)', () => {
  it('fibre composite: a third no-shear direction appears below G₁₂ ≈ 4.92 GPa', () => {
    const base = initialState('ort-9b');
    const threshold = 1 / (2 / base.params.E2 + (2 * base.params.nu12) / base.params.E1);
    expect(threshold / 1000).toBeCloseTo(4.92, 2);
    expect(deriveLab(withParam(base, 'G12', threshold * 1.02)).coaxial.angles.length).toBe(2);
    expect(deriveLab(withParam(base, 'G12', threshold * 0.98)).coaxial.angles.length).toBe(4);
  });

  it('soft-matrix composite: the new no-shear direction near 66° is a minimum of E below E₂, and γxy vanishes there', () => {
    const base = withParam(initialState('ort-9b'), 'G12', 4_000);
    const d = deriveLab(base);
    const off = d.coaxial.angles.find((x) => Math.abs(Math.sin(2 * x)) > 0.5)!;
    const deg = (off * 180) / Math.PI;
    expect(Math.min(deg, 180 - deg)).toBeCloseTo(66.0, 0);
    expect(eAt(d, deg)).toBeLessThan(base.params.E2);
    expect(eAt(d, deg)).toBeLessThan(eAt(d, deg + 2));
    expect(eAt(d, deg)).toBeLessThan(eAt(d, deg - 2));
    const exact = deriveLab({ ...base, thetaDeg: -deg });
    expect(Math.abs(exact.response.strain[2] / exact.response.strain[0])).toBeLessThan(1e-6);
  });
});

describe('claims: holding a specimen (Level 2)', () => {
  const gpa = (rungs: ReturnType<typeof constraintLadder>) => rungs.map((r) => r.stiffness / 1000);

  it('isotropic sheet: E = 200, E/(1−ν²) = 219.8 with the sides held, σyy = ν σxx; holding the shear changes nothing', () => {
    const st = initialState('iso-2a');
    const ps = gpa(constraintLadder(deriveLab(st).C2));
    expect(ps[0]).toBeCloseTo(200, 9);
    expect(ps[1]).toBeCloseTo(219.78, 2);
    expect(ps[2]).toBeCloseTo(200, 9);
    const ly = deriveLab(withExperiment(st, 'lock-yy'));
    expect(ly.response.stress[1] / ly.response.stress[0]).toBeCloseTo(0.3, 9);
    expect(ly.apparentModulus.value / 1000).toBeCloseTo(219.78, 2);
    const lx = deriveLab(withExperiment(st, 'lock-xy'));
    expect(Math.abs(lx.response.stress[2])).toBeLessThan(1e-9 * st.scales.stress);
    expect(lx.apparentModulus.value / 1000).toBeCloseTo(200, 9);
  });

  it('fibre composite at 30°: free 28.1 GPa with γxy ≈ −1.36 εxx; shear held 63.7 GPa (×2.26) with τxy ≈ 0.41 σxx; sides held +2 %', () => {
    const cf = { ...initialState('ort-9b'), thetaDeg: 30 };
    const d = deriveLab(cf);
    expect(d.plane.etaxy_x).toBeCloseTo(-1.36, 2);
    const lad = gpa(constraintLadder(d.C2));
    expect(lad[0]).toBeCloseTo(28.14, 2);
    expect(lad[2]).toBeCloseTo(63.68, 2);
    expect(lad[2] / lad[0]).toBeCloseTo(2.26, 2);
    expect(lad[1] / lad[0] - 1).toBeCloseTo(0.02, 2);
    const S = d.S2;
    expect(1 / (S[0][0] - S[0][2] ** 2 / S[2][2]) / 1000).toBeCloseTo(lad[2], 9);
    const g = deriveLab(withExperiment(cf, 'lock-xy'));
    expect(g.response.stress[2] / g.response.stress[0]).toBeCloseTo(0.41, 2);
  });

  it('isotropic sheet in plane strain: the free rung equals the plane-stress lateral-held rung; the top is 269 GPa', () => {
    const st = initialState('iso-2a');
    const pe = gpa(constraintLadder(deriveLab({ ...st, mode: 'strain' }).C2));
    expect(pe[0]).toBeCloseTo(gpa(constraintLadder(deriveLab(st).C2))[1], 9);
    expect(pe[3]).toBeCloseTo(269.23, 2);
  });
});

describe('claims: sculpting E(φ) (Level 2)', () => {
  const base: LabState = { ...initialState('ort-9b'), custom: true, params: { ...ISO_ORTHO } };
  const s1 = withParam(base, 'E1', SCULPT_E1);
  const s2 = withParam(s1, 'G12', SCULPT_G12);
  const fold = (deg: number) => Math.min(deg, 180 - deg);

  it('starts as a circle; doubling E₁ leaves E(45°) ≈ 211 GPa, with the shear term the largest at 45°', () => {
    expect(ratio(deriveLab(base))).toBeCloseTo(1, 9);
    expect(eAt(deriveLab(s1), 45) / 1000).toBeCloseTo(210.5, 0);
    const p = s1.params;
    expect(shearTerm(p)).toBeGreaterThan(1 / p.E2);
  });

  it('the stiffest direction leaves axis 1 exactly above G₁₂ = E₁/2(1+ν₁₂) = 154 GPa, and stays below 45°', () => {
    const thr = SCULPT_E1 / (2 * (1 + 0.3));
    expect(thr / 1000).toBeCloseTo(153.8, 1);
    expect(stiffest(deriveLab(withParam(s1, 'G12', thr * 0.98))).deg).toBe(0);
    for (const G of [thr * 1.05, SCULPT_G12, 1e8]) {
      const top = stiffest(deriveLab(withParam(s1, 'G12', G)));
      expect(top.E).toBeGreaterThan(SCULPT_E1);
      expect(fold(top.deg)).toBeGreaterThan(0);
      expect(fold(top.deg)).toBeLessThan(45);
    }
  });

  it('ν₁₂ → 0 with G₁₂ = 545 GPa restores E(φ) exactly, but not G(φ) or ν(φ)', () => {
    const s3 = withParam(withParam(s2, 'nu12', 0), 'G12', 1 / shearTerm(s2.params));
    expect(s3.params.G12 / 1000).toBeCloseTo(545.5, 0);
    const a = deriveLab(s2);
    const b = deriveLab(s3);
    for (const t of [0, 17, 45, 70, 90, 130]) expect(eAt(b, t)).toBeCloseTo(eAt(a, t), 6);
    const at = (d: typeof a, deg: number) => directionalModuli(d.S2, d.C2, (deg * Math.PI) / 180);
    expect(Math.abs(at(b, 0).G - at(a, 0).G)).toBeGreaterThan(1000);
    expect(Math.abs(at(b, 20).nu - at(a, 20).nu)).toBeGreaterThan(0.05);
  });

  it('the monoclinic crystal in its mirror plane is stiffest about 24° from axis 1, at 251 GPa', () => {
    const top = stiffest(deriveLab(initialState('mon-13a')));
    expect(fold(top.deg)).toBeCloseTo(23.5, 0);
    expect(top.E / 1000).toBeCloseTo(251, 0);
  });
});

describe('claims: coaxiality (Level 2)', () => {
  const cf = { ...initialState('ort-9b'), thetaDeg: 30 };

  it('isotropic sheet: any combined load is coaxial', () => {
    const st = initialState('iso-2a');
    const s = st.scales.stress;
    for (const value of [[s, 0, 0.5 * s], [s, -0.4 * s, 0.5 * s], [0, 0.3 * s, -s]] as const)
      expect(principalGap(deriveLab({ ...st, load: { control: ['stress', 'stress', 'stress'], value: [...value] } }))).toBeLessThan(1e-9);
  });

  it('fibre composite at 30°: the larger principal strain is about 24° from the load, away from the fibres', () => {
    expect((deriveLab(cf).principal.strain.angle * 180) / Math.PI).toBeCloseTo(-24, 0);
  });

  it('pure shear on the ply is coaxial every 45° and not in between', () => {
    const sh = withExperiment(cf, 'shear');
    for (const t of [0, 45, 90, -45]) expect(principalGap(deriveLab({ ...sh, thetaDeg: t }))).toBeLessThan(1e-6);
    for (const t of [20, 30, 60, -30]) expect(principalGap(deriveLab({ ...sh, thetaDeg: t }))).toBeGreaterThan(1);
  });

  it('a no-shear pull is coaxial but not a Kelvin mode; the stiffest mode is almost a stretch along the fibres', () => {
    const pull = deriveLab({ ...cf, thetaDeg: 90 });
    expect(principalGap(pull)).toBeLessThan(1e-6);
    expect(kelvinModulusOf(pull)).toBeNull();
    const top = deriveLab(cf).kelvin2D.reduce((a, m) => (m.modulus > a.modulus ? m : a));
    expect((strainPrincipal(top.strain).angle * 180) / Math.PI).toBeCloseTo(30, 0);
  });
});

describe('claims: Kelvin modes (Level 3)', () => {
  const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b).map((x) => x / 1000);

  it('isotropic sheet: equal biaxial stretch λ = E/(1−ν) = 285.7 GPa and two pure shears λ = 2G = 153.8 GPa; 3D 2G ×5 and 3K = 500 GPa', () => {
    const d = deriveLab(initialState('iso-2a'));
    const lam = sorted(d.kelvin2D.map((m) => m.modulus));
    expect(lam[0]).toBeCloseTo(153.85, 2);
    expect(lam[1]).toBeCloseTo(153.85, 2);
    expect(lam[2]).toBeCloseTo(285.71, 2);
    const k3 = sorted(kelvinModuli(d.S6));
    for (let i = 0; i < 5; i++) expect(k3[i]).toBeCloseTo(153.85, 2);
    expect(k3[5]).toBeCloseTo(500, 6);
  });

  it('fibre composite: λ = 10.0, 2G₁₂ = 14, 181.0 GPa, unchanged at 30° while C̄₁₁ falls from 180.9 to 108.8', () => {
    const cf = initialState('ort-9b');
    const d0 = deriveLab(cf);
    const d30 = deriveLab({ ...cf, thetaDeg: 30 });
    const l0 = sorted(d0.kelvin2D.map((m) => m.modulus));
    const l30 = sorted(d30.kelvin2D.map((m) => m.modulus));
    expect(l0[0]).toBeCloseTo(10.0, 1);
    expect(l0[1]).toBeCloseTo((2 * cf.params.G12) / 1000, 9);
    expect(l0[2]).toBeCloseTo(181.0, 1);
    for (let i = 0; i < 3; i++) expect(l30[i]).toBeCloseTo(l0[i], 9);
    expect(d0.C2[0][0] / 1000).toBeCloseTo(180.9, 1);
    expect(d30.C2[0][0] / 1000).toBeCloseTo(108.8, 1);
    const top = d0.kelvin2D.reduce((a, m) => (m.modulus > a.modulus ? m : a));
    expect(top.strain[1] / top.strain[0]).toBeCloseTo(0.018, 3);
  });

  it('isotropic sheet ν → ½: 3K diverges, the plane-stress moduli stay below 400 GPa, the plane-strain ones do not', () => {
    const s = withParam(initialState('iso-2a'), 'nu12', 0.49);
    expect(Math.max(...kelvinModuli(deriveLab(s).S6)) / 1000).toBeCloseTo(10_000, 3);
    expect(Math.max(...deriveLab(s).kelvin2D.map((m) => m.modulus))).toBeLessThan(400_000);
    expect(Math.max(...deriveLab({ ...s, mode: 'strain' }).kelvin2D.map((m) => m.modulus))).toBeGreaterThan(6_000_000);
  });

  it('both 2D reductions keep their moduli between the smallest and largest 3D Kelvin moduli', () => {
    for (const p of PRESETS)
      for (const mode of ['stress', 'strain'] as const)
        for (const t of [0, 25]) {
          const d = deriveLab({ ...initialState(p.id), mode, thetaDeg: t });
          const k3 = kelvinModuli(d.S6);
          for (const m of d.kelvin2D) {
            expect(m.modulus).toBeGreaterThanOrEqual(Math.min(...k3) * (1 - 1e-9));
            expect(m.modulus).toBeLessThanOrEqual(Math.max(...k3) * (1 + 1e-9));
          }
        }
  });

  it('fibre composite ν₁₂ can reach about 3.8 (√(E₁/E₂) ≈ 4.2 for the 1–2 pair alone); the largest 3D modulus is what diverges', () => {
    const cf = initialState('ort-9b');
    const { lo, hi } = knobInterval(SYMMETRY_CLASSES.orthotropic, cf.params, 'nu12');
    expect(hi).toBeCloseTo(3.76, 2);
    expect(lo).toBeCloseTo(-4.0, 2);
    expect(Math.sqrt(cf.params.E1 / cf.params.E2)).toBeCloseTo(4.24, 2);
    expect(cf.params.E1 / cf.params.E2).toBeCloseTo(18, 9);
    const k0 = sorted(kelvinModuli(deriveLab(cf).S6));
    const k3 = sorted(kelvinModuli(deriveLab(withParam(cf, 'nu12', 3)).S6));
    expect(k3[5] / k0[5]).toBeGreaterThan(2.5);
    for (let i = 0; i < 5; i++) expect(Math.abs(k3[i] / k0[i] - 1)).toBeLessThan(0.05);
  });
});

describe('claims: anisotropy indices (Level 3)', () => {
  it('cubic crystal (001): in-plane 1.89, A = 3, 3D 2.69, Aᵁ = 1.6 = 6/5 (√A − 1/√A)²; on (111) the plane is isotropic at 133.7 GPa', () => {
    const cub = initialState('cub-3a');
    expect(ratio(deriveLab(cub))).toBeCloseTo(1.89, 2);
    expect(CUBIC_A).toBeCloseTo(3, 9);
    const y = youngExtremes3D(mat('cub-3a'));
    expect(y.max / y.min).toBeCloseTo(2.69, 2);
    const AU = universalAnisotropy(mat('cub-3a'));
    expect(AU).toBeCloseTo(1.6, 6);
    expect(AU).toBeCloseTo(1.2 * (Math.sqrt(CUBIC_A) - 1 / Math.sqrt(CUBIC_A)) ** 2, 9);
    const d111 = deriveLab({ ...cub, section: 'n111' });
    expect(ratio(d111)).toBeCloseTo(1, 9);
    expect(d111.plane.Ex / 1000).toBeCloseTo(133.7, 1);
  });

  it('A → 1/A (G = 8.3 GPa): Aᵁ unchanged, while the E ratios rise to 2.89 (3D) and 2.41 (in plane)', () => {
    const cub = initialState('cub-3a');
    expect(cub.params.E1 / (2 * (1 + cub.params.nu12)) / 1000).toBeCloseTo(25, 9);
    expect(gInverseA(cub) / 1000).toBeCloseTo(8.33, 2);
    const inv = withParam(cub, 'G12', gInverseA(cub));
    const S = SYMMETRY_CLASSES.cubic.build(inv.params);
    expect(universalAnisotropy(S)).toBeCloseTo(universalAnisotropy(mat('cub-3a')), 9);
    const y = youngExtremes3D(S);
    expect(y.max / y.min).toBeCloseTo(2.885, 3);
    expect(ratio(deriveLab(inv))).toBeCloseTo(2.41, 2);
  });

  it('hexagonal vs trigonal crystal: sections 1.37 vs 1.00, but Aᵁ 0.15 vs 0.83 (more than five times) and 3D 1.37 vs 1.87', () => {
    const hex = deriveLab(initialState('hex-5a'));
    const trg = deriveLab(initialState('trg-6a'));
    expect(ratio(hex)).toBeCloseTo(1.37, 2);
    expect(ratio(trg)).toBeCloseTo(1, 9);
    const aHex = universalAnisotropy(mat('hex-5a'));
    const aTrg = universalAnisotropy(mat('trg-6a'));
    expect(aHex).toBeCloseTo(0.15, 2);
    expect(aTrg).toBeCloseTo(0.83, 2);
    expect(aTrg / aHex).toBeGreaterThan(5);
    const yHex = youngExtremes3D(mat('hex-5a'));
    const yTrg = youngExtremes3D(mat('trg-6a'));
    expect(yHex.max / yHex.min).toBeCloseTo(1.37, 2);
    expect(yTrg.max / yTrg.min).toBeCloseTo(1.87, 2);
  });
});

describe('claims: Level 3 FE input', () => {
  it('monoclinic preset: η₁₂,₁ = −ν₁₂ η₁₂,₂ zeroes C̄₁₆ while S̄₁₆ ≠ 0 (γxy 0.8 → 0.075 εxx), and η₁₂,₁ = 0 does the reverse', () => {
    const base = initialState('mon-13b');
    expect(shearPerStretchOf(base)).toBeCloseTo(0.8, 9);
    const a = deriveLab(withParam(base, 'eta12_1', etaForZeroC16(base)));
    expect(Math.abs(a.C2[0][2])).toBeLessThan(1e-9 * a.C2[2][2]);
    expect(Math.abs(a.S2[0][2])).toBeGreaterThan(1e-3 * a.S2[2][2]);
    expect(a.response.strain[2] / a.response.strain[0]).toBeCloseTo(0.075, 6);
    const b = deriveLab(withParam(base, 'eta12_1', 0));
    expect(Math.abs(b.S2[0][2])).toBe(0);
    expect(Math.abs(b.C2[0][2])).toBeGreaterThan(1e-3 * b.C2[2][2]);
  });

  it('plane-stress input: the 3D block overstates C̄22 by 20 %, C̄12 by 69 %, C̄11 by 1 %, leaves C̄66 alone; ν = 0.495 gives ×25', () => {
    const ps = deriveLab(initialState('ort-9b')).C2;
    const pe = deriveLab({ ...initialState('ort-9b'), mode: 'strain' }).C2;
    expect(ps[1][1] / 1000).toBeCloseTo(10.05, 2);
    expect(pe[1][1] / 1000).toBeCloseTo(12.05, 2);
    expect(ps[0][1] / 1000).toBeCloseTo(3.02, 2);
    expect(pe[0][1] / 1000).toBeCloseTo(5.08, 2);
    expect(pe[1][1] / ps[1][1]).toBeCloseTo(1.2, 1);
    expect(pe[0][1] / ps[0][1]).toBeCloseTo(1.69, 2);
    expect(pe[0][0] / ps[0][0]).toBeCloseTo(1.01, 2);
    expect(pe[2][2]).toBeCloseTo(ps[2][2], 9);
    const iso = withParam(initialState('iso-2a'), 'nu12', 0.495);
    expect(deriveLab({ ...iso, mode: 'strain' }).C2[0][0] / deriveLab(iso).C2[0][0]).toBeCloseTo(25.5, 1);
  });

  it('trigonal crystal in plane strain: τyz ≠ 0 but τxz = 0 at θ = 0 (a 2-fold axis), both at 30°, and no τxy', () => {
    const d = deriveLab({ ...initialState('trg-6a'), mode: 'strain' });
    expect(Math.abs(d.out.stress[1])).toBeGreaterThan(1);
    expect(Math.abs(d.out.stress[2])).toBeLessThan(1e-9 * Math.abs(d.out.stress[1]));
    expect(Math.abs(d.C2[0][2])).toBeLessThan(1e-9 * d.C2[0][0]);
    const d30 = deriveLab({ ...initialState('trg-6a'), mode: 'strain', thetaDeg: 30 });
    expect(Math.abs(d30.out.stress[2])).toBeGreaterThan(1);
  });

  it('plane-stress C̄ is the Schur complement of the 3D C over the out-of-plane components', () => {
    const d = deriveLab({ ...initialState('trc-21a'), thetaDeg: 25 });
    const a = [0, 1, 5];
    const b = [2, 3, 4];
    const C = d.C6;
    const Cbb = inverse(b.map((i) => b.map((j) => C[i][j])));
    const schur = a.map((i) =>
      a.map((j) => C[i][j] - b.reduce((acc, p, m) => acc + C[i][p] * b.reduce((acc2, q, n) => acc2 + Cbb[m][n] * C[q][j], 0), 0)),
    );
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(Math.abs(schur[i][j] - d.C2[i][j])).toBeLessThan(1e-9 * d.C2[0][0]);
  });
});

function shearPerStretchOf(s: LabState): number {
  const r = deriveLab(s).response.strain;
  return r[2] / r[0];
}

describe('plane extremes helper used by the guides', () => {
  it('matches a sampled E(φ) for the cubic crystal', () => {
    const d = deriveLab(initialState('cub-3a'));
    const e = planeExtremes(d.S2, d.C2);
    expect(e.Emax).toBeCloseTo(stiffest(d).E, 3);
  });
});
