import { describe, expect, it } from 'vitest';
import { isPositiveDefinite } from './linalg';
import { MONOCLINIC_B_TO_3, PRESETS, SYMMETRY_CLASSES, type Params } from './materials';
import { compliancePattern, effectiveSymmetry } from './symmetry';
import { snapTargets } from './snapping';

const presetById = (id: string) => PRESETS.find((q) => q.id === id)!;
const symOf = (id: string, params?: Params) => {
  const p = presetById(id);
  return effectiveSymmetry(SYMMETRY_CLASSES[p.classId].build(params ?? p.params));
};
const snapTo = (id: string, params: Params, key: string, label: RegExp) => {
  const cls = SYMMETRY_CLASSES[presetById(id).classId];
  const t = snapTargets(cls, params)[key].ticks.find((x) => label.test(x.label));
  if (!t) throw new Error(`no snap target ${label} for ${key}: ${JSON.stringify(snapTargets(cls, params)[key])}`);
  return { ...params, [key]: t.value };
};

describe('effective symmetry', () => {
  it('each preset is detected as its class (the composite as transversely isotropic about its fibres)', () => {
    expect(symOf('iso-2a')).toEqual({ classId: 'isotropic', axis: null });
    expect(symOf('cub-3a')).toEqual({ classId: 'cubic', axis: null });
    expect(symOf('hex-5a')).toEqual({ classId: 'hexagonal', axis: 2 });
    expect(symOf('tet-6a')).toEqual({ classId: 'tetragonal', axis: 2 });
    expect(symOf('trg-6a')).toEqual({ classId: 'trigonal', axis: 2 });
    expect(symOf('ort-9a')).toEqual({ classId: 'orthotropic', axis: null });
    expect(symOf('ort-9b')).toEqual({ classId: 'hexagonal', axis: 0 });
    expect(symOf('mon-13a')).toEqual({ classId: 'monoclinic', axis: 2 });
    expect(symOf('mon-13b')).toEqual({ classId: 'monoclinic', axis: 2 });
    expect(symOf('trc-21a')).toEqual({ classId: 'triclinic', axis: null });
  });

  it('the MON-13A re-expression keeps it monoclinic about axis 3 and positive definite', () => {
    const p = presetById('mon-13a');
    expect(isPositiveDefinite(SYMMETRY_CLASSES.monoclinic.build(p.params))).toBe(true);
    expect(MONOCLINIC_B_TO_3.length).toBe(3);
  });
});

describe('snapping raises symmetry', () => {
  it('cubic: snapping G to its isotropic value makes it isotropic', () => {
    const p = presetById('cub-3a');
    expect(symOf('cub-3a', snapTo('cub-3a', p.params, 'G12', /isotropic/))).toEqual({ classId: 'isotropic', axis: null });
  });

  it('cubic: snapping ν instead also makes it isotropic (one anisotropy degree of freedom)', () => {
    const p = presetById('cub-3a');
    expect(symOf('cub-3a', snapTo('cub-3a', p.params, 'nu12', /isotropic/))).toEqual({ classId: 'isotropic', axis: null });
  });

  it('tetragonal: snapping G₁₂ to its in-plane isotropic value makes it hexagonal', () => {
    const p = presetById('tet-6a');
    expect(symOf('tet-6a', snapTo('tet-6a', p.params, 'G12', /isotropic/))).toEqual({ classId: 'hexagonal', axis: 2 });
  });

  it('orthotropic: E₂ → E₁, G₂₃ → G₁₃, then G₁₂ → isotropic gives transverse isotropy about axis 3', () => {
    let q = presetById('ort-9a').params;
    q = snapTo('ort-9a', q, 'E2', /= E₁/);
    expect(symOf('ort-9a', q).classId).toBe('orthotropic'); // G₁₃ ≠ G₂₃ still breaks the 4-fold axis
    q = snapTo('ort-9a', q, 'G23', /= G₁₃/);
    expect(symOf('ort-9a', q)).toEqual({ classId: 'tetragonal', axis: 2 });
    q = snapTo('ort-9a', q, 'G12', /isotropic/);
    expect(symOf('ort-9a', q)).toEqual({ classId: 'hexagonal', axis: 2 });
  });

  it('monoclinic: η couplings snap to zero, which restores orthotropy', () => {
    let q = presetById('mon-13b').params;
    for (const k of ['eta12_1', 'eta12_2', 'eta12_3', 'mu13_23']) q = snapTo('mon-13b', q, k, /^0/);
    expect(symOf('mon-13b', q)).toEqual({ classId: 'orthotropic', axis: null });
  });
});

describe('matrix pattern', () => {
  it('orthotropic has 12 nonzero entries per triangle-and-diagonal count; triclinic has none zero', () => {
    const ortho = compliancePattern(SYMMETRY_CLASSES.orthotropic, presetById('ort-9a').params);
    const nz = ortho.flat().filter((c) => c.kind !== 'zero').length;
    expect(nz).toBe(12); // 3×3 normal block (9) + 3 shear diagonals
    const tri = compliancePattern(SYMMETRY_CLASSES.triclinic, presetById('trc-21a').params);
    expect(tri.flat().every((c) => c.kind === 'free')).toBe(true);
  });

  it('cubic ties all three normal diagonals, the three Poisson terms and the three shear diagonals', () => {
    const pat = compliancePattern(SYMMETRY_CLASSES.cubic, presetById('cub-3a').params);
    const groups = new Set(pat.flat().flatMap((c) => (c.kind === 'tied' ? [c.group] : [])));
    expect(groups.size).toBe(3);
  });
});
