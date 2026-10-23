import { describe, expect, it } from 'vitest';
import { type Mat, PRESETS, SYMMETRY_CLASSES, inverse, maxAbsDiff, rotateComplianceVoigt, submatrix, IN_PLANE, specimenRotationFrom } from '../mechanics';
import { deriveLab, initialState, initialStateFrom, reducer } from './lab';
import {
  type Entry,
  type Notation,
  type OrderId,
  type ShearConvention,
  UNITS,
  analyze,
  fromStandard,
  parseMatrixText,
  toLoadable,
  toStandard,
} from './ownMaterial';
import { decodeFragment, documentOf, encodeFragment, readDocument } from './share';

const S = (id: string) => {
  const p = PRESETS.find((x) => x.id === id)!;
  return SYMMETRY_CLASSES[p.classId].build(p.params);
};
const rel = (A: Mat, B: Mat) => maxAbsDiff(A, B) / Math.max(...B.flat().map(Math.abs));
const I3: Mat = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const gpa = (M: Mat) => M.map((r) => r.map((v) => v / 1000));
const load = (e: Entry, classId?: string, R: Mat = I3, thetaDeg = 0) => {
  const a = analyze(e);
  if (a.errors.length) throw new Error(a.errors.join(' '));
  const l = toLoadable(e, a, { classId: (classId ?? a.suggested) as never, R, thetaDeg, name: 'test', source: '' });
  return { a, state: { ...initialStateFrom(l.preset), thetaDeg: l.thetaDeg } };
};

describe('notation', () => {
  it('converts every order, shear convention and unit and back', () => {
    const Cstd = inverse(S('tri-albite'));
    for (const kind of ['stiffness', 'compliance'] as const)
      for (const order of ['voigt', 'shear-12-13-23'] as OrderId[])
        for (const shear of ['engineering', 'tensor', 'mandel'] as ShearConvention[])
          for (const unit of UNITS) {
            const n: Notation = { kind, order, shear, unit };
            const M = kind === 'stiffness' ? Cstd : S('tri-albite');
            expect(rel(toStandard(fromStandard(M, n), n), M), JSON.stringify(n)).toBeLessThan(1e-14);
            const M2 = submatrix(M, IN_PLANE, IN_PLANE);
            expect(rel(toStandard(fromStandard(M2, n), n), M2)).toBeLessThan(1e-14);
          }
  });

  it('applies the textbook factors: Mandel C₄₄ = 2C₄₄, tensor S₁₂₁₂ = S₆₆/4, and the 12-13-23 order', () => {
    const C = inverse(S('tri-albite'));
    const mandel = fromStandard(C, { kind: 'stiffness', order: 'voigt', shear: 'mandel', unit: 'MPa' });
    expect(mandel[3][3]).toBeCloseTo(2 * C[3][3], 6);
    expect(mandel[0][3]).toBeCloseTo(Math.SQRT2 * C[0][3], 6);
    const St = fromStandard(S('tri-albite'), { kind: 'compliance', order: 'voigt', shear: 'tensor', unit: 'MPa' });
    expect(St[5][5]).toBeCloseTo(S('tri-albite')[5][5] / 4, 18);
    expect(St[0][5]).toBeCloseTo(S('tri-albite')[0][5] / 2, 18);
    const alt = fromStandard(C, { kind: 'stiffness', order: 'shear-12-13-23', shear: 'engineering', unit: 'GPa' });
    expect(alt[3][3]).toBeCloseTo(C[5][5] / 1000, 9); // position 4 holds 12
    expect(alt[5][0]).toBeCloseTo(C[3][0] / 1000, 9); // position 6 holds 23
  });
});

describe('parsing pasted text', () => {
  const full = '1 2 3\n2 4 5\n3 5 6';
  it('reads full, upper, lower and flat layouts, with comments and Unicode minus', () => {
    const want = [
      [1, 2, 3],
      [2, 4, 5],
      [3, 5, 6],
    ];
    for (const text of [full, '1, 2, 3\n4; 5\n6', '1\n2 4\n3 5 6', '1 2 3 2 4 5 3 5 6', '1 2 3 4 5 6', `# header\n${full} // trailing`]) {
      const r = parseMatrixText(text, 3);
      if ('error' in r) throw new Error(`${text}: ${r.error}`);
      expect(r.M).toEqual(want);
    }
    const neg = parseMatrixText('1 −2 0\n−2 5 0\n0 0 3', 3);
    expect('M' in neg && neg.M[0][1]).toBe(-2);
  });

  it('explains what is wrong', () => {
    const bad = parseMatrixText('1 2 x', 3);
    expect('error' in bad && bad.error).toMatch(/“x”/);
    const short = parseMatrixText('1 2 3 4', 3);
    expect('error' in short && short.error).toMatch(/found 4 numbers/);
  });
});

describe('checks on loading', () => {
  const copperC = gpa(inverse(S('cubic-cu')));
  const notation: Notation = { kind: 'stiffness', order: 'voigt', shear: 'engineering', unit: 'GPa' };
  const matrix = (m: Mat, n: Partial<Notation> = {}, dimension: 2 | 3 = 3, plane: 'stress' | 'strain' = 'stress'): Entry => ({
    definition: 'matrix',
    dimension,
    plane,
    notation: { ...notation, ...n },
    matrix: m,
  });

  it('refuses a clearly asymmetric matrix, and averages one that differs by rounding', () => {
    const asym = copperC.map((r) => [...r]);
    asym[0][1] *= 1.1;
    expect(analyze(matrix(asym)).errors[0]).toMatch(/not symmetric/);
    const rounding = copperC.map((r) => [...r]);
    rounding[0][1] *= 1 + 1e-4;
    const a = analyze(matrix(rounding));
    expect(a.errors).toEqual([]);
    expect(a.notes[0]).toMatch(/averaged/);
  });

  it('refuses an unstable matrix and names the mode', () => {
    // isotropic with ν = 0.6 (λ, μ from E = 1, ν = 0.6): the bulk modulus is negative.
    const E = 1;
    const nu = 0.6;
    const lam = (E * nu) / ((1 + nu) * (1 - 2 * nu));
    const mu = E / (2 * (1 + nu));
    const C = [0, 1, 2, 3, 4, 5].map((i) => [0, 1, 2, 3, 4, 5].map((j) => (i < 3 && j < 3 ? lam + (i === j ? 2 * mu : 0) : i === j ? mu : 0)));
    const err = analyze(matrix(C)).errors[0];
    expect(err).toMatch(/Not stable/);
    expect(err).toMatch(/ε₁₁ \+ ε₂₂ \+ ε₃₃/);
  });

  it('accepts ν = 0.7 for an isotropic sheet (2D) but not for an isotropic solid (3D)', () => {
    const c = (dimension: 2 | 3, classId: string): Entry => ({ definition: 'constants', dimension, plane: 'stress', classId: classId as never, constants: { E1: 1, nu12: 0.7 }, unit: 'GPa' });
    expect(analyze(c(2, 'plane-isotropic')).errors).toEqual([]);
    expect(analyze(c(3, 'isotropic')).errors[0]).toMatch(/not stable/);
  });

  it('copper C_ij from a paper loads as cubic, with its constants and its specimen matrices', () => {
    const { a, state } = load(matrix(copperC));
    expect(a.suggested).toBe('cubic');
    const p = PRESETS.find((x) => x.id === 'cubic-cu')!.params;
    for (const k of Object.keys(p)) expect(state.params[k] / p[k]).toBeCloseTo(1, 12);
    expect(rel(deriveLab(state).S6, S('cubic-cu'))).toBeLessThan(1e-12);
  });

  it('a pasted CFRP matrix loads as hexagonal about its fibres, and the specimen sees the same material', () => {
    const { a, state } = load(matrix(gpa(inverse(S('ortho-cfrp')))));
    expect(a.suggested).toBe('hexagonal');
    expect(state.section).toBe('custom');
    expect(rel(deriveLab(state).S6, S('ortho-cfrp'))).toBeLessThan(1e-12);
    // and when kept exact, as triclinic
    const tri = load(matrix(gpa(inverse(S('ortho-cfrp')))), 'triclinic').state;
    expect(rel(deriveLab(tri).S6, S('ortho-cfrp'))).toBeLessThan(1e-12);
  });

  it('orientation: a material entered with its axes rotated is seen rotated in the specimen', () => {
    const R = specimenRotationFrom(I3, 0.4);
    const { state } = load(matrix(gpa(inverse(S('tri-albite')))), 'triclinic', R);
    expect(rel(deriveLab(state).S6, rotateComplianceVoigt(S('tri-albite'), R))).toBeLessThan(1e-12);
  });
});

describe('2D data', () => {
  const lamina = submatrix(S('ortho-cfrp'), IN_PLANE, IN_PLANE);
  const Q = inverse(lamina); // plane-stress reduced stiffness

  it('a plane-stress Q matrix reproduces the 3D ply in plane, at any angle, and locks the mode', () => {
    const e: Entry = { definition: 'matrix', dimension: 2, plane: 'stress', notation: { kind: 'stiffness', order: 'voigt', shear: 'engineering', unit: 'GPa' }, matrix: gpa(Q) };
    const { a, state } = load(e, undefined, I3, 30);
    expect(a.suggested).toBe('plane-orthotropic');
    expect(state.thetaDeg).toBe(30);
    const ply = deriveLab({ ...initialState('ortho-cfrp'), thetaDeg: 30 });
    expect(rel(deriveLab(state).C2, ply.C2)).toBeLessThan(1e-12);
    const tried = reducer(state, { type: 'mode', mode: 'strain' });
    expect(tried.mode).toBe('stress');
    expect(reducer(state, { type: 'section', section: 'n1' }).section).toBe(state.section);
  });

  it('a plane-strain C̄ stays exactly the entered C̄ in plane strain', () => {
    const steelPE = deriveLab({ ...initialState('iso-steel'), mode: 'strain' }).C2;
    const e: Entry = { definition: 'matrix', dimension: 2, plane: 'strain', notation: { kind: 'stiffness', order: 'voigt', shear: 'engineering', unit: 'MPa' }, matrix: steelPE };
    const { a, state } = load(e);
    expect(a.suggested).toBe('plane-isotropic');
    expect(state.mode).toBe('strain');
    expect(rel(deriveLab(state).C2, steelPE)).toBeLessThan(1e-12);
  });

  it('lamina constants E₁, E₂, ν₁₂, G₁₂ give the ply’s in-plane behaviour', () => {
    const e: Entry = { definition: 'constants', dimension: 2, plane: 'stress', classId: 'plane-orthotropic', constants: { E1: 181, E2: 10.3, nu12: 0.28, G12: 7.17 }, unit: 'GPa' };
    const { state } = load(e);
    expect(rel(deriveLab(state).S2, lamina)).toBeLessThan(1e-12);
  });
});

describe('the material format and share links', () => {
  it('round-trips a 3D material, its orientation, θ and mode through a link', () => {
    const s = { ...initialState('cubic-cu'), section: 'n111' as const, thetaDeg: 17, mode: 'strain' as const };
    const r = decodeFragment('#' + encodeFragment(documentOf(s)));
    if (!r || 'error' in r) throw new Error(r ? r.error : 'no document');
    const back = { ...reducer(s, { type: 'loadMaterial', preset: r.loadable.preset, thetaDeg: r.loadable.thetaDeg }), mode: r.mode };
    expect(back.thetaDeg).toBe(17);
    expect(back.mode).toBe('strain');
    expect(rel(deriveLab(back).S6, deriveLab(s).S6)).toBeLessThan(1e-12);
  });

  it('round-trips 2D data', () => {
    const e: Entry = { definition: 'constants', dimension: 2, plane: 'strain', classId: 'plane-orthotropic', constants: { E1: 181, E2: 10.3, nu12: 0.28, G12: 7.17 }, unit: 'GPa' };
    const { state } = load(e, undefined, I3, 25);
    const r = decodeFragment(encodeFragment(documentOf(state)));
    if (!r || 'error' in r) throw new Error(r ? r.error : 'no document');
    expect(r.mode).toBe('strain');
    expect(r.loadable.thetaDeg).toBeCloseTo(25, 12);
    expect(r.loadable.preset.classId).toBe('plane-orthotropic');
  });

  it('reads the matrix example of docs/material-format.md as cubic copper', () => {
    const doc = {
      format: 'solidmechtools.elastic-material',
      version: 1,
      name: 'Copper single crystal',
      units: 'GPa',
      material: {
        dimension: 3,
        definition: 'matrix',
        kind: 'stiffness',
        order: ['11', '22', '33', '23', '13', '12'],
        shear: 'engineering',
        matrix: [
          [168.4, 121.4, 121.4, 0, 0, 0],
          [121.4, 168.4, 121.4, 0, 0, 0],
          [121.4, 121.4, 168.4, 0, 0, 0],
          [0, 0, 0, 75.4, 0, 0],
          [0, 0, 0, 0, 75.4, 0],
          [0, 0, 0, 0, 0, 75.4],
        ],
      },
    };
    const r = readDocument(doc);
    if ('error' in r) throw new Error(r.error);
    expect(r.loadable.preset.classId).toBe('cubic');
    expect(r.loadable.preset.name).toBe('Copper single crystal');
  });

  it('reads the constants example with rounded direction cosines', () => {
    const r = readDocument({
      format: 'solidmechtools.elastic-material',
      version: 1,
      units: 'GPa',
      material: {
        dimension: 3,
        definition: 'constants',
        symmetry: 'orthotropic',
        constants: { E1: 181, E2: 10.3, E3: 10.3, nu12: 0.28, nu13: 0.28, nu23: 0.4, G23: 3.679, G13: 7.17, G12: 7.17 },
      },
      orientation: { axis1: [0.866, 0.5, 0], axis2: [-0.5, 0.866, 0], axis3: [0, 0, 1] },
    });
    if ('error' in r) throw new Error(r.error);
    expect(r.loadable.preset.section).toBe('custom');
  });

  it('refuses malformed documents with a reason', () => {
    const base = { format: 'solidmechtools.elastic-material', version: 1, units: 'GPa' };
    const err = (doc: unknown) => {
      const r = readDocument(doc);
      return 'error' in r ? r.error : '';
    };
    expect(err({ ...base, format: 'other' })).toMatch(/Unknown format/);
    expect(err({ ...base, version: 2 })).toMatch(/newer/);
    expect(err({ ...base, material: { dimension: 3, definition: 'constants', symmetry: 'cubic', constants: { E1: 66, nu12: 0.42 } } })).toMatch(/Missing constants.*G12/);
    expect(err({ ...base, material: { dimension: 3, definition: 'constants', symmetry: 'isotropic', constants: { E1: 1, nu12: 0.3, G12: 1 } } })).toMatch(/does not have: G12/);
    expect(err({ ...base, material: { dimension: 3, definition: 'constants', symmetry: 'isotropic', constants: { E1: 1, nu12: 0.7 } } })).toMatch(/not stable/);
    expect(decodeFragment('#material=%%%')).toEqual({ error: expect.stringMatching(/damaged/) });
    expect(decodeFragment('#other')).toBeNull();
  });
});
