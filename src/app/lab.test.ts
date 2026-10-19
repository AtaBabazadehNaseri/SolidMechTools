import { describe, expect, it } from 'vitest';
import { PRESETS } from '../mechanics';
import { EXPERIMENTS, SWEEP_QUANTITIES, constraintLadder, deriveLab, initialState, loadCaseFor, numericalChecks, rotationSweep, sweepValue } from './lab';

const close = (a: number, b: number, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-300);

describe('constraint ladder', () => {
  it('runs from 1/S̄11 (all free) to C̄11 (all held), with the mixed rungs in between', () => {
    for (const p of PRESETS) {
      const d = deriveLab({ ...initialState(p.id), thetaDeg: 23 });
      const [ff, hf, fh, hh] = constraintLadder(d.C2).map((r) => r.stiffness);
      expect(close(ff, 1 / d.S2[0][0])).toBe(true);
      expect(close(hh, d.C2[0][0])).toBe(true);
      for (const m of [hf, fh]) {
        expect(m).toBeGreaterThanOrEqual(ff * (1 - 1e-12));
        expect(m).toBeLessThanOrEqual(hh * (1 + 1e-12));
      }
    }
  });

  it('isotropic: holding the shear changes nothing, so the mixed rungs coincide with the ends', () => {
    const d = deriveLab(initialState('iso-steel'));
    const [ff, hf, fh, hh] = constraintLadder(d.C2).map((r) => r.stiffness);
    expect(close(hf, hh)).toBe(true);
    expect(close(fh, ff)).toBe(true);
  });

  it('off-axis composite: a mixed rung lands strictly between the ends', () => {
    const d = deriveLab({ ...initialState('ortho-cfrp'), thetaDeg: 30 });
    const [ff, , fh, hh] = constraintLadder(d.C2).map((r) => r.stiffness);
    expect(fh).toBeGreaterThan(ff * 1.1);
    expect(fh).toBeLessThan(hh * 0.9);
  });
});

describe('rotation sweep', () => {
  it('matches the lab at the current angle and repeats every 180°', () => {
    const s = { ...initialState('mono-coupled'), thetaDeg: 0 };
    const d = deriveLab(s);
    expect(close(sweepValue(s, 'gxy', 0), d.response.strain[2] * 1e3)).toBe(true);
    expect(close(sweepValue(s, 'energy', 0), d.energy * 1e3)).toBe(true);
    for (const q of SWEEP_QUANTITIES) {
      const sweep = rotationSweep(s, q.id, 19);
      expect(close(sweep[0].value, sweep[sweep.length - 1].value, 1e-8) || Math.abs(sweep[0].value) < 1e-9).toBe(true);
    }
  });
});

describe('numerical checks', () => {
  it('pass for every preset, both modes and every experiment', () => {
    for (const p of PRESETS)
      for (const mode of ['stress', 'strain'] as const)
        for (const e of EXPERIMENTS) {
          let s = initialState(p.id, { mode });
          s = { ...s, thetaDeg: 17, load: loadCaseFor(e, s.scales) };
          for (const c of numericalChecks(s, deriveLab(s))) {
            if (c.limit === 0) expect(c.value, `${p.id} ${mode} ${e.id} ${c.name}`).toBeGreaterThan(0);
            else expect(c.value, `${p.id} ${mode} ${e.id} ${c.name}`).toBeLessThan(c.limit);
          }
        }
  });
});
