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
    expect(symOf('iso-steel')).toEqual({ classId: 'isotropic', axis: null });
    expect(symOf('cubic-cu')).toEqual({ classId: 'cubic', axis: null });
    expect(symOf('hex-ti')).toEqual({ classId: 'hexagonal', axis: 2 });
    expect(symOf('tetra-rutile')).toEqual({ classId: 'tetragonal', axis: 2 });
    expect(symOf('trig-quartz')).toEqual({ classId: 'trigonal', axis: 2 });
    expect(symOf('ortho-bone')).toEqual({ classId: 'orthotropic', axis: null });
    expect(symOf('ortho-cfrp')).toEqual({ classId: 'hexagonal', axis: 0 });
    expect(symOf('mono-diopside')).toEqual({ classId: 'monoclinic', axis: 2 });
    expect(symOf('mono-coupled')).toEqual({ classId: 'monoclinic', axis: 2 });
    expect(symOf('tri-albite')).toEqual({ classId: 'triclinic', axis: null });
  });

  it('the diopside re-expression keeps it monoclinic about axis 3 and positive definite', () => {
    const p = presetById('mono-diopside');
    expect(isPositiveDefinite(SYMMETRY_CLASSES.monoclinic.build(p.params))).toBe(true);
    expect(MONOCLINIC_B_TO_3.length).toBe(3);
  });
});

describe('snapping raises symmetry', () => {
  it('cubic copper: snapping G to its isotropic value makes it isotropic', () => {
    const p = presetById('cubic-cu');
    expect(symOf('cubic-cu', snapTo('cubic-cu', p.params, 'G12', /isotropic/))).toEqual({ classId: 'isotropic', axis: null });
  });

  it('cubic copper: snapping ν instead also makes it isotropic (one anisotropy degree of freedom)', () => {
    const p = presetById('cubic-cu');
    expect(symOf('cubic-cu', snapTo('cubic-cu', p.params, 'nu12', /isotropic/))).toEqual({ classId: 'isotropic', axis: null });
  });

  it('rutile: snapping G₁₂ to its in-plane isotropic value makes it hexagonal', () => {
    const p = presetById('tetra-rutile');
    expect(symOf('tetra-rutile', snapTo('tetra-rutile', p.params, 'G12', /isotropic/))).toEqual({ classId: 'hexagonal', axis: 2 });
  });

  it('bone: E₂ → E₁, G₂₃ → G₁₃, then G₁₂ → isotropic gives transverse isotropy about the femoral axis', () => {
    let q = presetById('ortho-bone').params;
    q = snapTo('ortho-bone', q, 'E2', /= E₁/);
    expect(symOf('ortho-bone', q).classId).toBe('orthotropic'); // G₁₃ ≠ G₂₃ still breaks the 4-fold axis
    q = snapTo('ortho-bone', q, 'G23', /= G₁₃/);
    expect(symOf('ortho-bone', q)).toEqual({ classId: 'tetragonal', axis: 2 });
    q = snapTo('ortho-bone', q, 'G12', /isotropic/);
    expect(symOf('ortho-bone', q)).toEqual({ classId: 'hexagonal', axis: 2 });
  });

  it('monoclinic: η couplings snap to zero, which restores orthotropy', () => {
    let q = presetById('mono-coupled').params;
    for (const k of ['eta12_1', 'eta12_2', 'eta12_3', 'mu13_23']) q = snapTo('mono-coupled', q, k, /^0/);
    expect(symOf('mono-coupled', q)).toEqual({ classId: 'orthotropic', axis: null });
  });
});

describe('matrix pattern', () => {
  it('orthotropic has 12 nonzero entries per triangle-and-diagonal count; triclinic has none zero', () => {
    const ortho = compliancePattern(SYMMETRY_CLASSES.orthotropic, presetById('ortho-bone').params);
    const nz = ortho.flat().filter((c) => c.kind !== 'zero').length;
    expect(nz).toBe(12); // 3×3 normal block (9) + 3 shear diagonals
    const tri = compliancePattern(SYMMETRY_CLASSES.triclinic, presetById('tri-albite').params);
    expect(tri.flat().every((c) => c.kind === 'free')).toBe(true);
  });

  it('cubic ties all three normal diagonals, the three Poisson terms and the three shear diagonals', () => {
    const pat = compliancePattern(SYMMETRY_CLASSES.cubic, presetById('cubic-cu').params);
    const groups = new Set(pat.flat().flatMap((c) => (c.kind === 'tied' ? [c.group] : [])));
    expect(groups.size).toBe(3);
  });
});
