import { describe, expect, it } from 'vitest';
import { identity, matMul, transpose } from './linalg';
import { PRESETS, SYMMETRY_CLASSES } from './materials';
import { directionalModuli } from './plane';
import { psCompliance, psOutStrain, psStiffness } from './testUtils';
import { mandelRotation, rotateComplianceVoigt, rotationZ } from './tensor';
import { kelvinModuli } from './constants';
import { specimenRotation } from './index';
import { expectClose, expectMatClose, randomRotation, randomSPD, rng } from './testUtils';

const presetS = (id: string) => {
  const p = PRESETS.find((q) => q.id === id)!;
  return { S: SYMMETRY_CLASSES[p.classId].build(p.params), p };
};
const deg = (d: number) => (d * Math.PI) / 180;

describe('coordinate transformation', () => {
  const r = rng(3);

  it('the Mandel rotation is orthogonal and composes like R', () => {
    const R1 = randomRotation(r);
    const R2 = randomRotation(r);
    const Q1 = mandelRotation(R1);
    expectMatClose(matMul(Q1, transpose(Q1)), identity(6), 1e-12);
    expectMatClose(mandelRotation(matMul(R1, R2)), matMul(Q1, mandelRotation(R2)), 1e-12);
  });

  it('rotating there and back restores S; Kelvin moduli are invariant', () => {
    const S = randomSPD(6, r);
    const R = randomRotation(r);
    const Srot = rotateComplianceVoigt(S, R);
    expectMatClose(rotateComplianceVoigt(Srot, transpose(R)), S, 1e-11);
    const k0 = kelvinModuli(S);
    kelvinModuli(Srot).forEach((k, i) => expectClose(k, k0[i], 1e-9));
  });

  it('isotropic compliance is unchanged by any rotation', () => {
    const { S } = presetS('iso-steel');
    for (let i = 0; i < 5; i++) expectMatClose(rotateComplianceVoigt(S, randomRotation(r)), S, 1e-12);
  });

  it('orthotropic off-axis modulus matches the classical formula', () => {
    const { S, p } = presetS('ortho-cfrp');
    const { E1, E2, G12, nu12 } = p.params;
    for (const t of [0, 10, 30, 45, 60, 90, 135]) {
      const S2 = psCompliance(rotateComplianceVoigt(S, specimenRotation('n3', deg(t))));
      const c = Math.cos(deg(t));
      const s = Math.sin(deg(t));
      const inv = c ** 4 / E1 + (1 / G12 - (2 * nu12) / E1) * c * c * s * s + s ** 4 / E2;
      expectClose(1 / S2[0][0], 1 / inv, 1e-12);
    }
  });

  it('rotating the material by θ equals loading it along −θ in material axes', () => {
    const { S } = presetS('mono-coupled');
    const S2mat = psCompliance(S);
    const Q2mat = psStiffness(S);
    for (const t of [-70, -20, 15, 50, 110]) {
      const S2 = psCompliance(rotateComplianceVoigt(S, rotationZ(deg(t))));
      const Q2 = psStiffness(rotateComplianceVoigt(S, rotationZ(deg(t))));
      const d = directionalModuli(S2mat, Q2mat, deg(-t));
      expectClose(1 / S2[0][0], d.E, 1e-11);
      expectClose(Q2[0][0], d.Cn, 1e-11);
    }
  });

  it('orthotropic rotated 90° swaps the in-plane axes', () => {
    const { S } = presetS('ortho-cfrp');
    const S2 = psCompliance(rotateComplianceVoigt(S, rotationZ(deg(90))));
    expectClose(S2[0][0], S[1][1]);
    expectClose(S2[1][1], S[0][0]);
    expect(Math.abs(S2[0][2])).toBeLessThan(1e-12 * S[0][0]);
  });

  it('rotated orthotropic material develops normal–shear coupling that vanishes at 0° and 90°', () => {
    const { S } = presetS('ortho-cfrp');
    const s16 = (t: number) => psCompliance(rotateComplianceVoigt(S, rotationZ(deg(t))))[0][2];
    expect(Math.abs(s16(0))).toBeLessThan(1e-15);
    expect(Math.abs(s16(90))).toBeLessThan(1e-15);
    expect(Math.abs(s16(30))).toBeGreaterThan(1e-7);
    expectClose(s16(-30), -s16(30), 1e-12);
  });
});

describe('section planes', () => {
  it('cubic (111) plane: in-plane response isotropic, but in-plane tension shears out of plane', () => {
    const { S } = presetS('cubic-cu');
    const S2at = (t: number) => psCompliance(rotateComplianceVoigt(S, specimenRotation('n111', deg(t))));
    const base = S2at(0);
    for (const t of [17, 45, 73, 120]) expectMatClose(S2at(t), base, 1e-12);
    expectClose(base[2][2], 2 * (base[0][0] - base[1][0]), 1e-12); // isotropic: S66 = 2(S11 − S12)
    const out = (t: number) => psOutStrain(rotateComplianceVoigt(S, specimenRotation('n111', deg(t))), [100, 0, 0]);
    const g = Math.hypot(out(0)[1], out(0)[2]);
    expect(g).toBeGreaterThan(1e-5);
    // 3-fold pattern: rotating by 120° returns the same out-of-plane response.
    expectMatClose([out(25)], [out(145)], 1e-11);
  });

  it('trigonal, plane ⟂ 3-fold axis: isotropic in plane, γ_yz = S₁₄ σ_xx', () => {
    const { S } = presetS('trig-quartz');
    const S2 = psCompliance(S);
    expectClose(S2[2][2], 2 * (S2[0][0] - S2[1][0]), 1e-12);
    expect(S2[0][2]).toBe(0);
    const [, gyz] = psOutStrain(S, [100, 0, 0]);
    expectClose(gyz, S[3][0] * 100);
    expect(Math.abs(gyz)).toBeGreaterThan(0);
  });
});
