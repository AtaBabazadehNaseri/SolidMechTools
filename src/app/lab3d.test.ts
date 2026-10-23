import { describe, expect, it } from 'vitest';
import { inverse } from '../mechanics';
import { EXPERIMENTS3, type LabState, deriveLab, entryExperiment3, initialState, loadCase3For, numericalChecks, reducer } from './lab';
import { analyze, toLoadable } from './ownMaterial';

describe('3D mode', () => {
  it('switches to the cube and back, keeping the plane mode', () => {
    let s: LabState = { ...initialState('ortho-cfrp'), mode: 'strain' };
    s = reducer(s, { type: 'space', space: '3d' });
    expect(s.space).toBe('3d');
    s = reducer(s, { type: 'space', space: '2d' });
    expect(s.mode).toBe('strain');
  });

  it('keeps 3D when the material changes, and refuses it for 2D data', () => {
    const s = reducer(initialState('iso-steel'), { type: 'space', space: '3d' });
    expect(reducer(s, { type: 'preset', id: 'cubic-cu' }).space).toBe('3d');
    const e = { definition: 'constants' as const, dimension: 2 as const, plane: 'stress' as const, classId: 'plane-isotropic' as const, constants: { E1: 200, nu12: 0.3 }, unit: 'GPa' as const };
    const l = toLoadable(e, analyze(e), { classId: 'plane-isotropic', R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], thetaDeg: 0, name: '', source: '' });
    const plane = reducer(s, { type: 'loadMaterial', preset: l.preset });
    expect(plane.space).toBe('2d');
    expect(reducer(plane, { type: 'space', space: '3d' }).space).toBe('2d');
  });

  it('an entry’s test reads its column of C or S on the cube', () => {
    const s = { ...reducer(initialState('tri-albite'), { type: 'space', space: '3d' }), thetaDeg: 20 };
    const d = deriveLab(s);
    for (const [matrix, j] of [['S', 3], ['C', 5]] as const) {
      const t = deriveLab({ ...s, load3: entryExperiment3({ matrix, i: 0, j }, s.scales) });
      const M = matrix === 'S' ? d.S6 : d.C6;
      const out = matrix === 'S' ? t.solid.response.strain : t.solid.response.stress;
      const input = matrix === 'S' ? s.scales.stress : s.scales.strain;
      for (let i = 0; i < 6; i++) expect(out[i]).toBeCloseTo(M[i][j] * input, 10);
    }
  });

  it('every 3D experiment passes the numerical checks, and the plane-strain test matches the 2D lab', () => {
    const base = reducer(initialState('trig-quartz'), { type: 'space', space: '3d' });
    for (const e of EXPERIMENTS3) {
      const s = { ...base, load3: loadCase3For(e, base.scales) };
      for (const c of numericalChecks(s, deriveLab(s))) expect(c.limit === 0 ? c.value > 0 : c.value < c.limit, `${e.id}: ${c.name}`).toBe(true);
    }
    const s3 = { ...base, load3: loadCase3For(EXPERIMENTS3.find((e) => e.id === 'plane-strain')!, base.scales) };
    const s2 = { ...initialState('trig-quartz'), mode: 'strain' as const };
    const r3 = deriveLab(s3).solid.response;
    const d2 = deriveLab(s2);
    expect(r3.strain[0]).toBeCloseTo(d2.response.strain[0], 12);
    expect(r3.stress[2]).toBeCloseTo(d2.out.stress[0], 9);
    expect(deriveLab(s3).solid.apparentModulus.free).toBeCloseTo(1 / inverse(deriveLab(s3).C6)[0][0], 6);
  });
});
