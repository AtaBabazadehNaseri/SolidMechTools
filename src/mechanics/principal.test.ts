import { describe, expect, it } from 'vitest';
import { matVec } from './linalg';
import { PRESETS, SYMMETRY_CLASSES } from './materials';
import { directionalShearCoupling, planeCompliance, planeStiffness, solveMixed } from './plane';
import { kelvinModes2D, principal2D, strainOnLine, strainPrincipal, stressPrincipal, tractionOnCut } from './principal';
import { rotateComplianceVoigt, rotationZ } from './tensor';
import { expectClose, rng } from './testUtils';

const preset = (id: string) => {
  const p = PRESETS.find((q) => q.id === id)!;
  return SYMMETRY_CLASSES[p.classId].build(p.params);
};
const axisDiff = (a: number, b: number) => {
  let d = (a - b) % Math.PI;
  if (d > Math.PI / 2) d -= Math.PI;
  if (d <= -Math.PI / 2) d += Math.PI;
  return Math.abs(d);
};

describe('principal values and cuts', () => {
  it('uniaxial and pure shear states', () => {
    const u = principal2D(10, 0, 0);
    expect([u.max, u.min, u.angle]).toEqual([10, 0, 0]);
    const s = principal2D(0, 0, 5);
    expectClose(s.max, 5);
    expectClose(s.min, -5);
    expectClose(s.angle, Math.PI / 4);
    expect(principal2D(0, 10, 0).angle).toBeCloseTo(Math.PI / 2);
  });

  it('the cut normal to the major principal direction carries no shear and the largest normal traction', () => {
    const r = rng(2);
    for (let k = 0; k < 20; k++) {
      const st = [r() - 0.5, r() - 0.5, r() - 0.5].map((v) => 100 * v);
      const p = stressPrincipal(st);
      const t = tractionOnCut(st, p.angle);
      expectClose(t.normal, p.max, 1e-12, 1e-12);
      expect(Math.abs(t.shear)).toBeLessThan(1e-10);
      for (let a = 0; a < 36; a++) expect(tractionOnCut(st, (a * Math.PI) / 36).normal).toBeLessThanOrEqual(p.max + 1e-10);
    }
  });

  it('strain on a line along the principal strain direction has zero shear', () => {
    const e = [1e-3, -4e-4, 7e-4];
    const p = strainPrincipal(e);
    const l = strainOnLine(e, p.angle);
    expectClose(l.normal, p.max, 1e-12);
    expect(Math.abs(l.shear)).toBeLessThan(1e-15);
  });
});

describe('coaxiality of stress and strain', () => {
  it('isotropic: stress and strain principal axes always coincide', () => {
    const r = rng(4);
    const S2 = planeCompliance(preset('iso-2a'), 'stress');
    for (let k = 0; k < 20; k++) {
      const res = solveMixed(S2, { control: ['stress', 'stress', 'stress'], value: [r() - 0.5, r() - 0.5, r() - 0.5].map((v) => 100 * v) as [number, number, number] });
      expect(axisDiff(stressPrincipal(res.stress).angle, strainPrincipal(res.strain).angle)).toBeLessThan(1e-9);
    }
  });

  it('rotated orthotropic material under uniaxial stress: principal strain axes leave the load axis', () => {
    const S2 = planeCompliance(rotateComplianceVoigt(preset('ort-9b'), rotationZ(Math.PI / 6)), 'stress');
    const res = solveMixed(S2, { control: ['stress', 'stress', 'stress'], value: [100, 0, 0] });
    expect(stressPrincipal(res.stress).angle).toBe(0);
    expect(axisDiff(strainPrincipal(res.strain).angle, 0)).toBeGreaterThan(0.1);
  });

  it('uniaxial stress along a direction with zero extension–shear coupling gives coaxial strain', () => {
    const S2 = planeCompliance(rotateComplianceVoigt(preset('mon-13b'), rotationZ(0.2)), 'stress');
    // Find a root of the coupling by bisection.
    let a = 0;
    let b = Math.PI;
    const f = (p: number) => directionalShearCoupling(S2, p);
    for (let k = 0; k < 200 && Math.sign(f(a)) === Math.sign(f(b)); k++) b = a + (Math.PI * (k + 1)) / 200;
    for (let k = 0; k < 80; k++) {
      const m = 0.5 * (a + b);
      if (Math.sign(f(m)) === Math.sign(f(a))) a = m;
      else b = m;
    }
    const phi = 0.5 * (a + b);
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const st = [100 * c * c, 100 * s * s, 100 * c * s];
    const eps = matVec(S2, st);
    expect(axisDiff(strainPrincipal(eps).angle, phi)).toBeLessThan(1e-7);
  });
});

describe('Kelvin modes of the in-plane stiffness', () => {
  for (const mode of ['stress', 'strain'] as const) {
    it(`${mode}: σ = λ ε in Mandel form, coaxial, and Σλ = tr C̄_M`, () => {
      const C2 = planeStiffness(rotateComplianceVoigt(preset('trc-21a'), rotationZ(0.5)), mode);
      const modes = kelvinModes2D(C2);
      for (const m of modes) {
        const sig = matVec(C2, m.strain);
        // Mandel: σ_M = λ ε_M ⇔ σxx = λ εxx, σyy = λ εyy, τxy = λ γxy / 2
        expectClose(sig[0], m.modulus * m.strain[0], 1e-9, 1e-9 * m.modulus);
        expectClose(sig[1], m.modulus * m.strain[1], 1e-9, 1e-9 * m.modulus);
        expectClose(sig[2], (m.modulus * m.strain[2]) / 2, 1e-9, 1e-9 * m.modulus);
        expect(axisDiff(stressPrincipal(sig).angle, strainPrincipal(m.strain).angle)).toBeLessThan(1e-8);
        expect(m.modulus).toBeGreaterThan(0);
      }
      expectClose(modes.reduce((s, m) => s + m.modulus, 0), C2[0][0] + C2[1][1] + 2 * C2[2][2], 1e-12);
    });
  }

  it('isotropic plane stress: λ = E/(1−ν) (area change) and 2G twice', () => {
    const E = 1000;
    const nu = 0.25;
    const lam = kelvinModes2D(planeStiffness(SYMMETRY_CLASSES.isotropic.build({ E1: E, nu12: nu }), 'stress')).map((m) => m.modulus);
    const twoG = E / (1 + nu);
    expectClose(lam[0], twoG, 1e-12);
    expectClose(lam[1], twoG, 1e-12);
    expectClose(lam[2], E / (1 - nu), 1e-12);
  });
});
