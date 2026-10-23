import { describe, expect, it } from 'vitest';
import { inverse, matVec } from './linalg';
import { PRESETS, SYMMETRY_CLASSES } from './materials';
import { IN_PLANE, OUT_OF_PLANE, type Control, outOfPlane, planeCompliance, solveMixed } from './plane';
import { apparentStiffnessN, principal3D, principalMisalignment, solveMixedN, strainTensor, stressTensor } from './solid';
import { rotateComplianceVoigt, rotationAxisAngle } from './tensor';
import { youngModulus3D } from './anisotropy';

const S = (id: string, R = rotationAxisAngle([1, 2, 3], 0.7)) => {
  const p = PRESETS.find((x) => x.id === id)!;
  return rotateComplianceVoigt(SYMMETRY_CLASSES[p.classId].build(p.params), R);
};
const close = (a: number[], b: number[], tol = 1e-12) => {
  const ref = Math.max(...b.map(Math.abs), 1e-300);
  for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i]), `component ${i}`).toBeLessThan(tol * ref);
};
const all = (c: Control): Control[] => [c, c, c, c, c, c];

describe('the 3D cube under mixed control', () => {
  const S6 = S('tri-albite');
  const C6 = inverse(S6);

  it('all tractions prescribed: the strain is S σ; all strains prescribed: the stress is C ε', () => {
    const sigma = [10, -3, 2, 1, -4, 5];
    close(solveMixedN(S6, { control: all('stress'), value: sigma }).strain, matVec(S6, sigma));
    const eps = [1e-3, -2e-4, 3e-4, 1e-4, 0, -5e-4];
    close(solveMixedN(S6, { control: all('strain'), value: eps }).stress, matVec(C6, eps));
  });

  it('a mixed case satisfies σ = C ε and meets every prescribed value', () => {
    const control: Control[] = ['stress', 'strain', 'stress', 'strain', 'stress', 'strain'];
    const value = [50, 2e-4, -20, 0, 7, -1e-4];
    const r = solveMixedN(S6, { control, value });
    close(matVec(C6, r.strain), r.stress, 1e-10);
    control.forEach((c, i) => expect(c === 'stress' ? r.stress[i] : r.strain[i]).toBeCloseTo(value[i], 12));
  });

  it('reproduces the 2D plane-stress and plane-strain tests exactly', () => {
    const sxx = 100;
    // plane stress: only σxx, everything else traction-free
    const ps = solveMixedN(S6, { control: all('stress'), value: [sxx, 0, 0, 0, 0, 0] });
    const ps2 = solveMixed(planeCompliance(S6, 'stress'), { control: ['stress', 'stress', 'stress'], value: [sxx, 0, 0] });
    close(IN_PLANE.map((i) => ps.strain[i]), ps2.strain);
    close(OUT_OF_PLANE.map((i) => ps.strain[i]), outOfPlane(S6, 'stress', ps2).strain);
    // plane strain: εzz = γyz = γxz = 0 held
    const pe = solveMixedN(S6, { control: ['stress', 'stress', 'strain', 'strain', 'strain', 'stress'], value: [sxx, 0, 0, 0, 0, 0] });
    const pe2 = solveMixed(planeCompliance(S6, 'strain'), { control: ['stress', 'stress', 'stress'], value: [sxx, 0, 0] });
    close(IN_PLANE.map((i) => pe.strain[i]), pe2.strain);
    close(OUT_OF_PLANE.map((i) => pe.stress[i]), outOfPlane(S6, 'strain', pe2).stress);
  });

  it('apparent stiffness runs from 1/S₁₁ (all free) to C₁₁ (all held), and equals E along x when free', () => {
    expect(apparentStiffnessN(C6, all('stress'), 0)).toBeCloseTo(1 / S6[0][0], 6);
    expect(apparentStiffnessN(C6, all('strain'), 0)).toBeCloseTo(C6[0][0], 6);
    expect(1 / S6[0][0]).toBeCloseTo(youngModulus3D(S6, [1, 0, 0]), 6);
    const mid = apparentStiffnessN(C6, ['strain', 'stress', 'strain', 'stress', 'stress', 'stress'], 0);
    expect(mid).toBeGreaterThan(1 / S6[0][0]);
    expect(mid).toBeLessThan(C6[0][0]);
  });

  it('hydrostatic pressure: copper shrinks equally in every direction, carbon/epoxy does not', () => {
    const p = { control: all('stress'), value: [-1, -1, -1, 0, 0, 0] };
    const cu = solveMixedN(S('cubic-cu'), p).strain;
    close(cu.slice(0, 3), [cu[0], cu[0], cu[0]], 1e-10);
    for (const g of cu.slice(3)) expect(Math.abs(g)).toBeLessThan(1e-9 * Math.abs(cu[0]));
    const id = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const cf = solveMixedN(S('ortho-cfrp', id), p).strain;
    expect(cf[1] / cf[0]).toBeGreaterThan(5); // far more compressible across the fibres
  });

  it('principal values and directions, and the misalignment between stress and strain', () => {
    const T = stressTensor([3, 1, 2, 0, 0, 0]);
    const pr = principal3D(T);
    expect(pr.values).toEqual([3, 2, 1].map((v) => expect.closeTo(v, 12)));
    // isotropic: stress and strain are coaxial; an anisotropic crystal under uniaxial stress off its axes is not
    const iso = S('iso-steel');
    const r = solveMixedN(iso, { control: all('stress'), value: [10, 3, -2, 1, 0.5, 4] });
    expect(principalMisalignment(principal3D(stressTensor(r.stress)), principal3D(strainTensor(r.strain)))).toBeLessThan(1e-4); // degrees; arccos near 1 amplifies round-off
    const tri = solveMixedN(S6, { control: all('stress'), value: [10, 3, -2, 1, 0.5, 4] });
    expect(principalMisalignment(principal3D(stressTensor(tri.stress)), principal3D(strainTensor(tri.strain)))).toBeGreaterThan(1);
  });
});
