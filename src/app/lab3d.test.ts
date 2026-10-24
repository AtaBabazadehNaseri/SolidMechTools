import { describe, expect, it } from 'vitest';
import { axesFromVectors, inverse, kelvinModuli } from '../mechanics';
import { decodeFragment, documentOf, encodeFragment } from './share';
import { EXPERIMENTS3, type LabState, cut3Of, deriveLab, entryExperiment3, initialState, loadCase3For, numericalChecks, reducer } from './lab';
import { analyze, toLoadable } from './ownMaterial';

describe('3D mode', () => {
  it('switches to the cube and back, keeping the plane mode', () => {
    let s: LabState = { ...initialState('ort-9b'), mode: 'strain' };
    s = reducer(s, { type: 'space', space: '3d' });
    expect(s.space).toBe('3d');
    s = reducer(s, { type: 'space', space: '2d' });
    expect(s.mode).toBe('strain');
  });

  it('keeps 3D when the material changes, and refuses it for 2D data', () => {
    const s = reducer(initialState('iso-2a'), { type: 'space', space: '3d' });
    expect(reducer(s, { type: 'preset', id: 'cub-3a' }).space).toBe('3d');
    const e = { definition: 'constants' as const, dimension: 2 as const, plane: 'stress' as const, classId: 'plane-isotropic' as const, constants: { E1: 200, nu12: 0.3 }, unit: 'GPa' as const };
    const l = toLoadable(e, analyze(e), { classId: 'plane-isotropic', R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], thetaDeg: 0, name: '', source: '' });
    const plane = reducer(s, { type: 'loadMaterial', preset: l.preset });
    expect(plane.space).toBe('2d');
    expect(reducer(plane, { type: 'space', space: '3d' }).space).toBe('2d');
  });

  it('an entry’s test reads its column of C or S on the cube', () => {
    const s = { ...reducer(initialState('trc-21a'), { type: 'space', space: '3d' }), thetaDeg: 20 };
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
    const base = reducer(initialState('trg-6a'), { type: 'space', space: '3d' });
    for (const e of EXPERIMENTS3) {
      const s = { ...base, load3: loadCase3For(e, base.scales) };
      for (const c of numericalChecks(s, deriveLab(s))) expect(c.limit === 0 ? c.value > 0 : c.value < c.limit, `${e.id}: ${c.name}`).toBe(true);
    }
    const s3 = { ...base, load3: loadCase3For(EXPERIMENTS3.find((e) => e.id === 'plane-strain')!, base.scales) };
    const s2 = { ...initialState('trg-6a'), mode: 'strain' as const };
    const r3 = deriveLab(s3).solid.response;
    const d2 = deriveLab(s2);
    expect(r3.strain[0]).toBeCloseTo(d2.response.strain[0], 12);
    expect(r3.stress[2]).toBeCloseTo(d2.out.stress[0], 9);
    expect(deriveLab(s3).solid.apparentModulus.free).toBeCloseTo(1 / inverse(deriveLab(s3).C6)[0][0], 6);
  });
});

describe('orientation beyond θ', () => {
  const rel = (A: number[][], B: number[][]) => Math.max(...A.flatMap((r, i) => r.map((v, j) => Math.abs(v - B[i][j])))) / Math.max(...B.flat().map(Math.abs));

  it('a tilt of 90° about y puts axis 1 along −z; θ then turns it about z only', () => {
    let s = reducer(initialState('ort-9b'), { type: 'tilt', axis: 1, deg: 90 });
    const R = deriveLab(s).R;
    expect([R[0][0], R[1][0], R[2][0]].map((v) => Math.round(v * 1e12) / 1e12 + 0)).toEqual([0, 0, -1]);
    s = reducer(s, { type: 'theta', deg: 30 });
    expect(deriveLab(s).R[2][0]).toBeCloseTo(-1, 12);
  });

  it('a tilt is the same material seen in other axes: Kelvin moduli unchanged, the share link carries it', () => {
    const s = reducer(reducer(initialState('trc-21a'), { type: 'tilt', axis: 0, deg: 35 }), { type: 'tilt', axis: 1, deg: -20 });
    const a = deriveLab(s);
    const b = deriveLab(initialState('trc-21a'));
    const k = (S: number[][]) => [...kelvinModuli(S)].sort((x, y) => x - y);
    expect(rel([k(a.S6)], [k(b.S6)])).toBeLessThan(1e-10);
    const r = decodeFragment('#' + encodeFragment(documentOf({ ...s, thetaDeg: 15 })));
    if (!r || 'error' in r) throw new Error('no document');
    const back = reducer(s, { type: 'loadMaterial', preset: r.loadable.preset, thetaDeg: r.loadable.thetaDeg });
    expect(rel(deriveLab(back).S6, deriveLab({ ...s, thetaDeg: 15 }).S6)).toBeLessThan(1e-9);
  });

  it('setting the axes directly replaces the orientation and zeroes θ and the tilts; 2D data refuses both', () => {
    const o = axesFromVectors([1, 1, 1], [1, -1, 0]);
    if ('error' in o) throw new Error(o.error);
    const s = reducer({ ...initialState('cub-3a'), thetaDeg: 40, tiltDeg: [10, 5] }, { type: 'orientation', R: o.R });
    expect(s.section).toBe('custom');
    expect(s.thetaDeg).toBe(0);
    expect(s.tiltDeg).toEqual([0, 0]);
    expect(rel(deriveLab(s).R, o.R)).toBeLessThan(1e-12);
    const e = { definition: 'constants' as const, dimension: 2 as const, plane: 'stress' as const, classId: 'plane-isotropic' as const, constants: { E1: 200, nu12: 0.3 }, unit: 'GPa' as const };
    const plane = reducer(s, { type: 'loadMaterial', preset: toLoadable(e, analyze(e), { classId: 'plane-isotropic', R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], thetaDeg: 0, name: '', source: '' }).preset });
    expect(reducer(plane, { type: 'tilt', axis: 0, deg: 30 }).tiltDeg).toEqual([0, 0]);
    expect(reducer(plane, { type: 'orientation', R: o.R })).toBe(plane);
  });
});

describe('the 3D cut', () => {
  it('hydrostatic pressure: t = −p n on every plane, with no shear', () => {
    for (const deg of [[0, 0], [30, 25], [-120, 70]] as Array<[number, number]>) {
      const c = cut3Of([-5, -5, -5, 0, 0, 0], [0, 0, 0, 0, 0, 0], deg);
      expect(Math.hypot(...c.n)).toBeCloseTo(1, 14);
      expect(c.normal).toBeCloseTo(-5, 12);
      expect(c.shear).toBeLessThan(1e-12);
    }
  });

  it('uniaxial σ on the 45° plane: σn = τ = σ/2; strain uses the tensor shear γ/2', () => {
    const c = cut3Of([10, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 2e-3], [45, 0]);
    expect(c.normal).toBeCloseTo(5, 12);
    expect(c.shear).toBeCloseTo(5, 12);
    expect(c.strainNormal).toBeCloseTo(1e-3, 15);
    expect(c.strainShear).toBeCloseTo(0, 15);
  });
});
