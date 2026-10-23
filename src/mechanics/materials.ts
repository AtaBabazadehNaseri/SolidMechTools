// Material symmetry classes, parameterised by engineering constants.
//
// Every material is stored as a 6×6 Voigt compliance S in its own (material)
// axes 1, 2, 3. Units: moduli in MPa, so S is in MPa⁻¹.
//
// Engineering constants are compliance quantities: each one is read off a
// stress-controlled test. For a load σ_i acting alone (all other stresses zero):
//   modulus      M_i  = σ_i / ε_i               → S_ii = 1 / M_i
//   Poisson      ν_ij = −ε_j / ε_i  (i, j ≤ 3)  → S_ji = −ν_ij / E_i
//   coupling     η_{j,i} = ε_j / ε_i  (other)   → S_ji =  η_{j,i} / M_i
// Each independent off-diagonal pair is defined from the LOWER Voigt index
// as the loaded direction (ν12 not ν21, η_{12,1} not η_{1,12}).
//
// With this choice, moving one constant while holding the others fixed moves S
// along a straight line in 1/M (moduli) or in the constant itself (ratios).
// The positive-definite set is convex, so each knob's admissible range is a
// single open interval that can be computed exactly (see admissibility.ts).

import { type Mat, inverse, zeros } from './linalg';
import { rotateComplianceVoigt } from './tensor';

/** The 8 elastic symmetry classes of a 3D material. */
export type SpaceClassId =
  | 'isotropic'
  | 'cubic'
  | 'hexagonal'
  | 'tetragonal'
  | 'trigonal'
  | 'orthotropic'
  | 'monoclinic'
  | 'triclinic';

/** The 4 symmetry classes of in-plane (2D) elasticity data: isotropic, square (4-fold), rectangular, oblique. */
export type PlaneClassId = 'plane-isotropic' | 'plane-square' | 'plane-orthotropic' | 'plane-anisotropic';

export type SymmetryClassId = SpaceClassId | PlaneClassId;

export type Params = Record<string, number>;

export interface ParamDef {
  key: string;
  /** KaTeX symbol. */
  symbol: string;
  /** What the constant means physically, in material axes. */
  label: string;
  /** 'modulus': S entries are affine in 1/value. 'ratio': affine in value. */
  kind: 'modulus' | 'ratio';
  /** Read the constant back from a compliance of this class. */
  fromS: (S: Mat) => number;
}

export interface SymmetryClassDef {
  id: SymmetryClassId;
  name: string;
  /** 3: a material with all six stress components. 2: in-plane data only (see embedPlane). */
  dimension: 2 | 3;
  independentConstants: number;
  /** Axis convention for this class. */
  convention: string;
  params: ParamDef[];
  build: (p: Params) => Mat;
}

// ---------------------------------------------------------------------------
// The 21 generic constants (triclinic). Classes below reuse subsets of them,
// sometimes with a relabelled description when a constant is shared by
// symmetry-equivalent directions.

const SHEAR_NAME = ['', '', '', '23', '13', '12']; // Voigt 4,5,6 (0-based 3,4,5)
const STRAIN_TXT = ['ε₁', 'ε₂', 'ε₃', 'γ₂₃', 'γ₁₃', 'γ₁₂'];
const STRESS_TXT = ['σ₁', 'σ₂', 'σ₃', 'τ₂₃', 'τ₁₃', 'τ₁₂'];

function modulus(i: number): ParamDef {
  const isShear = i >= 3;
  const key = isShear ? `G${SHEAR_NAME[i]}` : `E${i + 1}`;
  return {
    key,
    symbol: isShear ? `G_{${SHEAR_NAME[i]}}` : `E_{${i + 1}}`,
    label: isShear
      ? `Shear modulus in the ${SHEAR_NAME[i][0]}–${SHEAR_NAME[i][1]} plane`
      : `Young's modulus along axis ${i + 1}`,
    kind: 'modulus',
    fromS: (S) => 1 / S[i][i],
  };
}

/** Coupling constant for Voigt pair (i, j), i < j, with i the loaded direction. */
function coupling(i: number, j: number): ParamDef {
  const iShear = i >= 3;
  const jShear = j >= 3;
  if (!iShear && !jShear) {
    return {
      key: `nu${i + 1}${j + 1}`,
      symbol: `\\nu_{${i + 1}${j + 1}}`,
      label: `Poisson coupling: lateral strain along ${j + 1} per axial strain under σ${i + 1}`,
      kind: 'ratio',
      fromS: (S) => -S[j][i] / S[i][i],
    };
  }
  const loaded = iShear ? SHEAR_NAME[i] : `${i + 1}`;
  const resp = SHEAR_NAME[j];
  const kindName = iShear ? 'Shear–shear' : 'Extension–shear';
  return {
    key: iShear ? `mu${resp}_${loaded}` : `eta${resp}_${loaded}`,
    symbol: iShear ? `\\mu_{${resp},${loaded}}` : `\\eta_{${resp},${loaded}}`,
    label: `${kindName} coupling: ${STRAIN_TXT[j]} per ${STRAIN_TXT[i]} under ${STRESS_TXT[i]}`,
    kind: 'ratio',
    fromS: (S) => S[j][i] / S[i][i],
  };
}

const G: Record<string, ParamDef> = {};
for (let i = 0; i < 6; i++) G[modulus(i).key] = modulus(i);
for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) G[coupling(i, j).key] = coupling(i, j);

function param(key: string, label?: string, symbol?: string): ParamDef {
  const base = G[key];
  if (!base) throw new Error(`unknown constant ${key}`);
  return { ...base, label: label ?? base.label, symbol: symbol ?? base.symbol };
}

/** Symmetric 6×6 from 1-based Voigt entries [i, j, value], as written in textbooks. */
function sym6(entries: Array<[number, number, number]>): Mat {
  const S = zeros(6);
  for (const [i, j, v] of entries) {
    S[i - 1][j - 1] = v;
    S[j - 1][i - 1] = v;
  }
  return S;
}

// ---------------------------------------------------------------------------

const isotropic: SymmetryClassDef = {
  id: 'isotropic',
  dimension: 3,
  name: 'Isotropic',
  independentConstants: 2,
  convention: 'No preferred direction.',
  params: [
    param('E1', "Young's modulus (any direction)", 'E'),
    param('nu12', "Poisson's ratio (any pair of directions)", '\\nu'),
  ],
  build: ({ E1: E, nu12: nu }) =>
    sym6([
      [1, 1, 1 / E], [2, 2, 1 / E], [3, 3, 1 / E],
      [1, 2, -nu / E], [1, 3, -nu / E], [2, 3, -nu / E],
      [4, 4, (2 * (1 + nu)) / E], [5, 5, (2 * (1 + nu)) / E], [6, 6, (2 * (1 + nu)) / E],
    ]),
};

const cubic: SymmetryClassDef = {
  id: 'cubic',
  dimension: 3,
  name: 'Cubic',
  independentConstants: 3,
  convention: 'Axes 1, 2, 3 along the cube edges ⟨100⟩.',
  params: [
    param('E1', "Young's modulus along a cube axis (E₁ = E₂ = E₃)", 'E_{100}'),
    param('nu12', 'Poisson coupling between cube axes (ν₁₂ = ν₁₃ = ν₂₃)', '\\nu_{100}'),
    param('G12', 'Shear modulus on cube faces (G₁₂ = G₁₃ = G₂₃)', 'G_{100}'),
  ],
  build: ({ E1: E, nu12: nu, G12: Gc }) =>
    sym6([
      [1, 1, 1 / E], [2, 2, 1 / E], [3, 3, 1 / E],
      [1, 2, -nu / E], [1, 3, -nu / E], [2, 3, -nu / E],
      [4, 4, 1 / Gc], [5, 5, 1 / Gc], [6, 6, 1 / Gc],
    ]),
};

const hexagonal: SymmetryClassDef = {
  id: 'hexagonal',
  dimension: 3,
  name: 'Hexagonal (transversely isotropic)',
  independentConstants: 5,
  convention: 'Axis 3 is the hexagonal c-axis; the 1–2 plane is isotropic (G₁₂ = E₁ / 2(1+ν₁₂)).',
  params: [
    param('E1', "Young's modulus in the basal plane (E₁ = E₂)", 'E_{1}'),
    param('nu12', 'Poisson coupling within the basal plane'),
    param('E3', "Young's modulus along the c-axis"),
    param('nu13', 'Poisson coupling: strain along c per basal-plane axial strain (ν₁₃ = ν₂₃)'),
    param('G13', 'Shear modulus in planes containing the c-axis (G₁₃ = G₂₃)'),
  ],
  build: ({ E1, nu12, E3, nu13, G13 }) =>
    sym6([
      [1, 1, 1 / E1], [2, 2, 1 / E1], [3, 3, 1 / E3],
      [1, 2, -nu12 / E1], [1, 3, -nu13 / E1], [2, 3, -nu13 / E1],
      [4, 4, 1 / G13], [5, 5, 1 / G13], [6, 6, (2 * (1 + nu12)) / E1],
    ]),
};

const tetragonal: SymmetryClassDef = {
  id: 'tetragonal',
  dimension: 3,
  name: 'Tetragonal',
  independentConstants: 6,
  convention: 'Axis 3 is the 4-fold axis; axes 1, 2 lie along ⟨100⟩ (classes 4mm, 4̄2m, 422, 4/mmm).',
  params: [
    param('E1', "Young's modulus along axis 1 (E₁ = E₂)"),
    param('nu12', 'Poisson coupling between axes 1 and 2'),
    param('E3', "Young's modulus along the 4-fold axis"),
    param('nu13', 'Poisson coupling: strain along 3 per axial strain along 1 (ν₁₃ = ν₂₃)'),
    param('G13', 'Shear modulus in planes containing axis 3 (G₁₃ = G₂₃)'),
    param('G12', 'Shear modulus in the 1–2 plane'),
  ],
  build: ({ E1, nu12, E3, nu13, G13, G12 }) =>
    sym6([
      [1, 1, 1 / E1], [2, 2, 1 / E1], [3, 3, 1 / E3],
      [1, 2, -nu12 / E1], [1, 3, -nu13 / E1], [2, 3, -nu13 / E1],
      [4, 4, 1 / G13], [5, 5, 1 / G13], [6, 6, 1 / G12],
    ]),
};

const trigonal: SymmetryClassDef = {
  id: 'trigonal',
  dimension: 3,
  name: 'Trigonal',
  independentConstants: 6,
  convention:
    'Axis 3 is the 3-fold axis, axis 1 a 2-fold axis (classes 32, 3m, 3̄m). S₂₄ = −S₁₄, S₅₆ = 2S₁₄, S₆₆ = 2(S₁₁ − S₁₂).',
  params: [
    param('E1', "Young's modulus along axis 1 (E₁ = E₂)"),
    param('nu12', 'Poisson coupling between axes 1 and 2'),
    param('E3', "Young's modulus along the 3-fold axis"),
    param('nu13', 'Poisson coupling: strain along 3 per axial strain along 1 (ν₁₃ = ν₂₃)'),
    param('G13', 'Shear modulus in planes containing axis 3 (G₁₃ = G₂₃)'),
    param('eta23_1', 'Extension–shear coupling: out-of-plane γ₂₃ per ε₁ under σ₁'),
  ],
  build: ({ E1, nu12, E3, nu13, G13, eta23_1 }) => {
    const S14 = eta23_1 / E1;
    return sym6([
      [1, 1, 1 / E1], [2, 2, 1 / E1], [3, 3, 1 / E3],
      [1, 2, -nu12 / E1], [1, 3, -nu13 / E1], [2, 3, -nu13 / E1],
      [4, 4, 1 / G13], [5, 5, 1 / G13], [6, 6, (2 * (1 + nu12)) / E1],
      [1, 4, S14], [2, 4, -S14], [5, 6, 2 * S14],
    ]);
  },
};

const orthotropic: SymmetryClassDef = {
  id: 'orthotropic',
  dimension: 3,
  name: 'Orthotropic',
  independentConstants: 9,
  convention: 'Axes 1, 2, 3 normal to the three mirror planes.',
  params: ['E1', 'E2', 'E3', 'nu12', 'nu13', 'nu23', 'G23', 'G13', 'G12'].map((k) => param(k)),
  build: ({ E1, E2, E3, nu12, nu13, nu23, G23, G13, G12 }) =>
    sym6([
      [1, 1, 1 / E1], [2, 2, 1 / E2], [3, 3, 1 / E3],
      [1, 2, -nu12 / E1], [1, 3, -nu13 / E1], [2, 3, -nu23 / E2],
      [4, 4, 1 / G23], [5, 5, 1 / G13], [6, 6, 1 / G12],
    ]),
};

const monoclinic: SymmetryClassDef = {
  id: 'monoclinic',
  dimension: 3,
  name: 'Monoclinic',
  independentConstants: 13,
  convention:
    'Axis 3 is the 2-fold axis (mirror plane = 1–2 plane). This places the extension–shear couplings S₁₆, S₂₆ in the 1–2 plane.',
  params: [
    ...['E1', 'E2', 'E3', 'nu12', 'nu13', 'nu23', 'G23', 'G13', 'G12'].map((k) => param(k)),
    param('eta12_1'),
    param('eta12_2'),
    param('eta12_3'),
    param('mu13_23'),
  ],
  build: ({ E1, E2, E3, nu12, nu13, nu23, G23, G13, G12, eta12_1, eta12_2, eta12_3, mu13_23 }) =>
    sym6([
      [1, 1, 1 / E1], [2, 2, 1 / E2], [3, 3, 1 / E3],
      [1, 2, -nu12 / E1], [1, 3, -nu13 / E1], [2, 3, -nu23 / E2],
      [4, 4, 1 / G23], [5, 5, 1 / G13], [6, 6, 1 / G12],
      [1, 6, eta12_1 / E1], [2, 6, eta12_2 / E2], [3, 6, eta12_3 / E3],
      [4, 5, mu13_23 / G23],
    ]),
};

const TRICLINIC_KEYS: string[] = [];
for (let i = 0; i < 6; i++) TRICLINIC_KEYS.push(modulus(i).key);
for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) TRICLINIC_KEYS.push(coupling(i, j).key);

const triclinic: SymmetryClassDef = {
  id: 'triclinic',
  dimension: 3,
  name: 'Triclinic',
  independentConstants: 21,
  convention: 'No symmetry beyond the inversion centre; all 21 constants independent.',
  params: TRICLINIC_KEYS.map((k) => param(k)),
  build: (p) => {
    const S = zeros(6);
    for (let i = 0; i < 6; i++) S[i][i] = 1 / p[modulus(i).key];
    for (let i = 0; i < 6; i++)
      for (let j = i + 1; j < 6; j++) {
        const c = p[coupling(i, j).key];
        const sign = i < 3 && j < 3 ? -1 : 1; // Poisson ratios carry a minus sign
        S[i][j] = S[j][i] = (sign * c) / p[modulus(i).key];
      }
    return S;
  },
};

// ---------------------------------------------------------------------------
// In-plane (2D) data. A 3×3 compliance fixes only the in-plane response, so it
// is carried as a 6×6 whose out-of-plane block is a decoupled placeholder.

/**
 * Embed an in-plane compliance S̄ (order 11, 22, 12) in a 6×6. The placeholder
 * out-of-plane block (S33 = S̄11, S44 = S55 = S̄66, no coupling to the plane)
 * makes both plane reductions return S̄ exactly and reduces positive
 * definiteness to that of S̄. It is affine in the same constants as S̄, so the
 * knob intervals stay exact. Nothing computed from the placeholder is shown.
 */
export function embedPlane(S2: Mat): Mat {
  const S = zeros(6);
  const at = [0, 1, 5];
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) S[at[a]][at[b]] = S2[a][b];
  S[2][2] = S2[0][0];
  S[3][3] = S2[2][2];
  S[4][4] = S2[2][2];
  return S;
}

function planeClass(
  id: PlaneClassId,
  name: string,
  convention: string,
  params: ParamDef[],
  inPlane: (p: Params) => Mat,
): SymmetryClassDef {
  return { id, name, dimension: 2, independentConstants: params.length, convention, params, build: (p) => embedPlane(inPlane(p)) };
}

const planeIsotropic = planeClass(
  'plane-isotropic',
  'Isotropic (2D)',
  'In-plane data only. No preferred in-plane direction.',
  [param('E1', "Young's modulus (any in-plane direction)", 'E'), param('nu12', "Poisson's ratio (any in-plane pair)", '\\nu')],
  ({ E1: E, nu12: nu }) => [
    [1 / E, -nu / E, 0],
    [-nu / E, 1 / E, 0],
    [0, 0, (2 * (1 + nu)) / E],
  ],
);

const planeSquare = planeClass(
  'plane-square',
  'Square (2D, 4-fold)',
  'In-plane data only. Axes 1 and 2 are equivalent (a 4-fold axis normal to the plane).',
  [param('E1', "Young's modulus along axis 1 (E₁ = E₂)"), param('nu12'), param('G12')],
  ({ E1: E, nu12: nu, G12: G12v }) => [
    [1 / E, -nu / E, 0],
    [-nu / E, 1 / E, 0],
    [0, 0, 1 / G12v],
  ],
);

const planeOrthotropic = planeClass(
  'plane-orthotropic',
  'Orthotropic (2D)',
  'In-plane data only. Axes 1 and 2 are normal to the two in-plane mirror lines.',
  ['E1', 'E2', 'nu12', 'G12'].map((k) => param(k)),
  ({ E1, E2, nu12, G12: G12v }) => [
    [1 / E1, -nu12 / E1, 0],
    [-nu12 / E1, 1 / E2, 0],
    [0, 0, 1 / G12v],
  ],
);

const planeAnisotropic = planeClass(
  'plane-anisotropic',
  'Anisotropic (2D)',
  'In-plane data only. No in-plane symmetry: all six in-plane constants are independent.',
  ['E1', 'E2', 'nu12', 'G12', 'eta12_1', 'eta12_2'].map((k) => param(k)),
  ({ E1, E2, nu12, G12: G12v, eta12_1, eta12_2 }) => [
    [1 / E1, -nu12 / E1, eta12_1 / E1],
    [-nu12 / E1, 1 / E2, eta12_2 / E2],
    [eta12_1 / E1, eta12_2 / E2, 1 / G12v],
  ],
);

export const SYMMETRY_CLASSES: Record<SymmetryClassId, SymmetryClassDef> = {
  isotropic,
  cubic,
  hexagonal,
  tetragonal,
  trigonal,
  orthotropic,
  monoclinic,
  triclinic,
  'plane-isotropic': planeIsotropic,
  'plane-square': planeSquare,
  'plane-orthotropic': planeOrthotropic,
  'plane-anisotropic': planeAnisotropic,
};

export const SPACE_CLASSES: SpaceClassId[] = ['isotropic', 'cubic', 'hexagonal', 'tetragonal', 'trigonal', 'orthotropic', 'monoclinic', 'triclinic'];
export const PLANE_CLASSES: PlaneClassId[] = ['plane-isotropic', 'plane-square', 'plane-orthotropic', 'plane-anisotropic'];

/** Constants of `cls` read back from a compliance that has that symmetry. */
export function paramsFromCompliance(cls: SymmetryClassDef, S: Mat): Params {
  return Object.fromEntries(cls.params.map((d) => [d.key, d.fromS(S)]));
}

/** Symmetric 6×6 stiffness from 1-based Voigt entries, e.g. published C_ij data. */
export function stiffnessFromEntries(entries: Array<[number, number, number]>): Mat {
  return sym6(entries);
}

// ---------------------------------------------------------------------------
// Section planes: which material plane the 2D specimen cuts.
// R maps material components to specimen components (v_specimen = R v_material);
// its rows are the specimen axes x, y, z written in material coordinates.

export type SectionId = 'n3' | 'n1' | 'n2' | 'n111';

export interface SectionDef {
  id: SectionId;
  label: string;
  R: Mat;
}

const s2 = Math.SQRT2;
const s3 = Math.sqrt(3);
const s6 = Math.sqrt(6);

export const SECTIONS: Record<SectionId, SectionDef> = {
  n3: { id: 'n3', label: 'Plane ⟂ axis 3  (x = 1, y = 2)', R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
  n1: { id: 'n1', label: 'Plane ⟂ axis 1  (x = 2, y = 3)', R: [[0, 1, 0], [0, 0, 1], [1, 0, 0]] },
  n2: { id: 'n2', label: 'Plane ⟂ axis 2  (x = 3, y = 1)', R: [[0, 0, 1], [1, 0, 0], [0, 1, 0]] },
  n111: {
    id: 'n111',
    label: 'Plane ⟂ [111]  (x = [1 −1 0], y = [1 1 −2])',
    R: [
      [1 / s2, -1 / s2, 0],
      [1 / s6, 1 / s6, -2 / s6],
      [1 / s3, 1 / s3, 1 / s3],
    ],
  },
};

// ---------------------------------------------------------------------------
// Presets. All values in MPa. "Illustrative" presets are designed to expose a
// behaviour; the others carry published data, cited in `source`.

export interface MaterialPreset {
  id: string;
  name: string;
  classId: SymmetryClassId;
  params: Params;
  /** 'custom' uses `orientation`, e.g. for a material entered by the user. */
  section: SectionId | 'custom';
  /** Material → specimen rotation when section is 'custom': its columns are axes 1, 2, 3 written in x, y, z. */
  orientation?: Mat;
  /** 2D data only: the plane state it describes, which then cannot change. */
  plane?: 'stress' | 'strain';
  source: string;
  /** What to try with it. */
  blurb: string;
  illustrative?: boolean;
}

/**
 * Class constants from published C_ij (GPa, 1-based Voigt entries). `R`
 * re-expresses data given in another axis setting in this class's convention
 * (v_class = R v_data).
 */
function fromStiffnessGPa(classId: SymmetryClassId, entries: Array<[number, number, number]>, R?: Mat): Params {
  const C = stiffnessFromEntries(entries.map(([i, j, v]) => [i, j, v * 1000]));
  const S = R ? rotateComplianceVoigt(inverse(C), R) : inverse(C);
  return paramsFromCompliance(SYMMETRY_CLASSES[classId], S);
}

/** Monoclinic data in the mineralogical setting (2-fold axis ∥ x₂) → this class (2-fold ∥ 3): 1 ← z, 2 ← x, 3 ← y. */
export const MONOCLINIC_B_TO_3: Mat = [
  [0, 0, 1],
  [1, 0, 0],
  [0, 1, 0],
];

export const PRESETS: MaterialPreset[] = [
  {
    id: 'iso-steel',
    name: 'Structural steel',
    classId: 'isotropic',
    params: { E1: 200_000, nu12: 0.3 },
    section: 'n3',
    source: 'Typical handbook values: E = 200 GPa, ν = 0.30.',
    blurb: 'Contracts laterally when stretched. No direction is special, so no coupling appears at any orientation.',
  },
  {
    id: 'iso-auxetic',
    name: 'Auxetic solid',
    classId: 'isotropic',
    params: { E1: 2_000, nu12: -0.7 },
    section: 'n3',
    source: 'Illustrative. ν = −0.7 as reported for re-entrant foams (Lakes, Science 1987); the modulus is arbitrary.',
    blurb: 'Gets wider when stretched. Isotropic admissibility is −1 < ν < ½.',
    illustrative: true,
  },
  {
    id: 'cubic-cu',
    name: 'Copper single crystal',
    classId: 'cubic',
    params: fromStiffnessGPa('cubic', [
      [1, 1, 168.4], [2, 2, 168.4], [3, 3, 168.4],
      [1, 2, 121.4], [1, 3, 121.4], [2, 3, 121.4],
      [4, 4, 75.4], [5, 5, 75.4], [6, 6, 75.4],
    ]),
    section: 'n3',
    source: 'Room temperature: C₁₁ = 168.4, C₁₂ = 121.4, C₄₄ = 75.4 GPa (standard handbook values).',
    blurb: 'Zener ratio ≈ 3.2. Rotate it in the (001) plane, then switch the section to ⟂ [111], where it is isotropic in plane.',
  },
  {
    id: 'hex-ti',
    name: 'α-Titanium single crystal',
    classId: 'hexagonal',
    params: fromStiffnessGPa('hexagonal', [
      [1, 1, 162.4], [2, 2, 162.4], [3, 3, 180.7],
      [1, 2, 92.0], [1, 3, 69.0], [2, 3, 69.0],
      [4, 4, 46.7], [5, 5, 46.7], [6, 6, (162.4 - 92.0) / 2],
    ]),
    section: 'n2',
    source: 'Fisher & Renken (1964): C₁₁ = 162.4, C₁₂ = 92.0, C₁₃ = 69.0, C₃₃ = 180.7, C₄₄ = 46.7 GPa.',
    blurb: 'Section contains the c-axis (along x). Switch to the basal plane (⟂ axis 3) and the response becomes isotropic in plane.',
  },
  {
    id: 'tetra-rutile',
    name: 'Rutile (TiO₂)',
    classId: 'tetragonal',
    params: fromStiffnessGPa('tetragonal', [
      [1, 1, 268], [2, 2, 268], [3, 3, 484],
      [1, 2, 175], [1, 3, 147], [2, 3, 147],
      [4, 4, 123.8], [5, 5, 123.8], [6, 6, 190.2],
    ]),
    section: 'n3',
    source: 'Cynn et al., Phys. Chem. Minerals (1998): C₁₁ = 268, C₁₂ = 175, C₁₃ = 147, C₃₃ = 484, C₄₄ = 123.8, C₆₆ = 190.2 GPa.',
    blurb: 'Four-fold in-plane symmetry with very stiff 45° directions. Snap G₁₂ to its isotropic value and it becomes hexagonal.',
  },
  {
    id: 'trig-quartz',
    name: 'α-Quartz',
    classId: 'trigonal',
    params: fromStiffnessGPa('trigonal', [
      [1, 1, 86.76], [2, 2, 86.76], [3, 3, 105.5],
      [1, 2, 6.868], [1, 3, 11.85], [2, 3, 11.85],
      [4, 4, 58.14], [5, 5, 58.14], [6, 6, (86.76 - 6.868) / 2],
      [1, 4, -18.02], [2, 4, 18.02], [5, 6, -18.02],
    ]),
    section: 'n3',
    source:
      'Ogi et al., J. Appl. Phys. 100 (2006), 30 °C: C₁₁ = 86.76, C₁₂ = 6.868, C₁₃ = 11.85, C₁₄ = −18.02, C₃₃ = 105.5, C₄₄ = 58.14 GPa. The sign of C₁₄ depends on the axis setting.',
    blurb: 'In-plane response is isotropic, yet in-plane tension produces out-of-plane shear γyz. The 2D drawing cannot show it, so watch the out-of-plane readouts.',
  },
  {
    id: 'ortho-bone',
    name: 'Human cortical bone (femur)',
    classId: 'orthotropic',
    params: {
      E1: 13_400, E2: 14_100, E3: 22_900,
      nu12: 0.42, nu13: 0.23, nu23: 0.23,
      G23: 6_200, G13: 5_800, G12: 4_600,
    },
    section: 'n2',
    source:
      'Taylor et al. (2002), as supplied: 1 = radial, 2 = tangential, 3 = femoral axis. Read here as ν₁₂ = 0.42 and ν₁₃ = ν₂₃ = 0.23 with the lower index loaded.',
    blurb: 'Section contains the femoral axis (x) and the radial direction (y). The transverse plane (⟂ axis 3) is nearly isotropic.',
  },
  {
    id: 'ortho-cfrp',
    name: 'Carbon/epoxy T300/5208',
    classId: 'orthotropic',
    params: { E1: 181_000, E2: 10_300, E3: 10_300, nu12: 0.28, nu13: 0.28, nu23: 0.4, G23: 10_300 / (2 * 1.4), G13: 7_170, G12: 7_170 },
    section: 'n3',
    source:
      'In plane: Tsai & Hahn (1980), E₁ = 181, E₂ = 10.3, G₁₂ = 7.17 GPa, ν₁₂ = 0.28. Out of plane assumed transversely isotropic about the fibres, with ν₂₃ = 0.4.',
    blurb: 'Fibres along axis 1. Aligned, it does not shear under tension. Rotate it and extension–shear coupling appears in the specimen frame.',
  },
  {
    id: 'mono-diopside',
    name: 'Diopside (CaMgSi₂O₆)',
    classId: 'monoclinic',
    params: fromStiffnessGPa(
      'monoclinic',
      [
        [1, 1, 229.0], [2, 2, 179.0], [3, 3, 242.5],
        [4, 4, 78.9], [5, 5, 68.1], [6, 6, 78.2],
        [1, 2, 78.0], [1, 3, 69.8], [2, 3, 58.0],
        [1, 5, 9.9], [2, 5, 6.1], [3, 5, 40.9], [4, 6, 6.6],
      ],
      MONOCLINIC_B_TO_3,
    ),
    section: 'n3',
    source:
      'Am. Mineral. 96 (2011), doi:10.2138/am.2011.3674, sample 1 (values approximate). Published with the 2-fold axis ∥ b ∥ x₂; re-expressed here with 1 ∥ c, 2 ∥ a*, 3 ∥ b.',
    blurb: 'The specimen plane is the mirror plane (a*–c), so extension–shear coupling is present in the material’s own axes.',
  },
  {
    id: 'mono-coupled',
    name: 'Strong extension–shear coupling',
    classId: 'monoclinic',
    params: {
      E1: 50_000, E2: 20_000, E3: 15_000, nu12: 0.25, nu13: 0.2, nu23: 0.3,
      G23: 5_000, G13: 6_000, G12: 10_000,
      eta12_1: 0.8, eta12_2: -0.3, eta12_3: 0.1, mu13_23: 0.2,
    },
    section: 'n3',
    source: 'Illustrative.',
    blurb: 'Shears visibly under pure tension. Drive η₁₂,₁ through zero (it snaps there) and watch the skew reverse.',
    illustrative: true,
  },
  {
    id: 'tri-albite',
    name: 'Low albite (NaAlSi₃O₈)',
    classId: 'triclinic',
    params: fromStiffnessGPa('triclinic', [
      [1, 1, 69.9], [2, 2, 183.5], [3, 3, 179.5], [4, 4, 24.9], [5, 5, 26.8], [6, 6, 33.5],
      [1, 2, 34.0], [1, 3, 30.8], [2, 3, 5.5],
      [1, 4, 5.1], [1, 5, -2.4], [1, 6, -0.9],
      [2, 4, -3.9], [2, 5, -7.7], [2, 6, -5.8],
      [3, 4, -8.7], [3, 5, 7.1], [3, 6, -9.8],
      [4, 5, -2.4], [4, 6, -7.2], [5, 6, 0.5],
    ]),
    section: 'n3',
    source: 'Brown, Abramson & Angel, Phys. Chem. Minerals 33 (2006) 256–265. Axes: 1 ∥ a*, 2 ∥ b, 3 completes the right-handed set.',
    blurb: 'Every coupling present: in-plane tension also produces out-of-plane shears γyz and γxz.',
  },
];

