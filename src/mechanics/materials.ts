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
// Presets. All values in MPa. Every preset is an illustrative material with
// rounded values: a teaching example, not material data. Where a set is loosely
// based on a published one, `basis` says which; it is shown only in the
// references section. Names are class code + number of independent constants
// + a letter, e.g. CUB-3A.

export interface MaterialPreset {
  id: string;
  /** Code such as CUB-3A, or the user's own name. */
  name: string;
  /** A generic description, e.g. 'strongly anisotropic cubic crystal'. Never a real material. */
  kind: string;
  classId: SymmetryClassId;
  params: Params;
  /** 'custom' uses `orientation`, e.g. for a material entered by the user. */
  section: SectionId | 'custom';
  /** Material → specimen rotation when section is 'custom': its columns are axes 1, 2, 3 written in x, y, z. */
  orientation?: Mat;
  /** 2D data only: the plane state it describes, which then cannot change. */
  plane?: 'stress' | 'strain';
  /** Where the values come from, as shown with the material. */
  source: string;
  /** What a set is loosely based on, with its reference: shown only in the references section. */
  basis?: string;
  /** What to try with it. */
  blurb: string;
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
    id: 'iso-2a',
    name: 'ISO-2A',
    kind: 'isotropic solid',
    classId: 'isotropic',
    params: { E1: 200_000, nu12: 0.3 },
    section: 'n3',
    source: 'Illustrative, rounded values: a teaching example, not material data.',
    basis: 'Values typical of structural steels, as found in any engineering handbook.',
    blurb: 'Contracts laterally when stretched. No direction is special, so no coupling appears at any orientation.',
  },
  {
    id: 'iso-2b',
    name: 'ISO-2B',
    kind: 'auxetic isotropic solid',
    classId: 'isotropic',
    params: { E1: 2_000, nu12: -0.7 },
    section: 'n3',
    source: 'Illustrative, rounded values: a teaching example, not material data.',
    basis: 'A Poisson ratio in the range reported for re-entrant foams (Lakes, Science 235, 1987); the modulus is arbitrary.',
    blurb: 'Gets wider when stretched. Isotropic admissibility is −1 < ν < ½.',
  },
  {
    id: 'cub-3a',
    name: 'CUB-3A',
    kind: 'strongly anisotropic cubic crystal',
    classId: 'cubic',
    params: fromStiffnessGPa('cubic', [
      [1, 1, 170], [2, 2, 170], [3, 3, 170],
      [1, 2, 120], [1, 3, 120], [2, 3, 120],
      [4, 4, 75], [5, 5, 75], [6, 6, 75],
    ]),
    section: 'n3',
    source: 'Illustrative, rounded values: a teaching example, not material data. C₁₁ = 170, C₁₂ = 120, C₄₄ = 75 GPa.',
    basis: 'Loosely based on room-temperature elastic constants of copper single crystals, as tabulated in Simmons & Wang, Single Crystal Elastic Constants and Calculated Aggregate Properties (MIT Press, 1971).',
    blurb: 'Zener ratio 3. Rotate it in the (001) plane, then switch the section to ⟂ [111], where it is isotropic in plane.',
  },
  {
    id: 'hex-5a',
    name: 'HEX-5A',
    kind: 'hexagonal crystal (transversely isotropic)',
    classId: 'hexagonal',
    params: fromStiffnessGPa('hexagonal', [
      [1, 1, 160], [2, 2, 160], [3, 3, 180],
      [1, 2, 90], [1, 3, 70], [2, 3, 70],
      [4, 4, 45], [5, 5, 45], [6, 6, (160 - 90) / 2],
    ]),
    section: 'n2',
    source: 'Illustrative, rounded values: a teaching example, not material data. C₁₁ = 160, C₁₂ = 90, C₁₃ = 70, C₃₃ = 180, C₄₄ = 45 GPa.',
    basis: 'Loosely based on the single-crystal constants of α-titanium reported by Fisher & Renken, Phys. Rev. 135 (1964).',
    blurb: 'Section contains the symmetry axis 3 (along x). Switch to the plane ⟂ axis 3 and the response becomes isotropic in plane.',
  },
  {
    id: 'tet-6a',
    name: 'TET-6A',
    kind: 'tetragonal crystal',
    classId: 'tetragonal',
    params: fromStiffnessGPa('tetragonal', [
      [1, 1, 270], [2, 2, 270], [3, 3, 480],
      [1, 2, 180], [1, 3, 150], [2, 3, 150],
      [4, 4, 125], [5, 5, 125], [6, 6, 190],
    ]),
    section: 'n3',
    source: 'Illustrative, rounded values: a teaching example, not material data. C₁₁ = 270, C₁₂ = 180, C₁₃ = 150, C₃₃ = 480, C₄₄ = 125, C₆₆ = 190 GPa.',
    basis: 'Loosely based on the constants of rutile (TiO₂) reported by Isaak et al., Phys. Chem. Minerals 26 (1998).',
    blurb: 'Four-fold in-plane symmetry with very stiff 45° directions. Snap G₁₂ to its isotropic value and it becomes hexagonal.',
  },
  {
    id: 'trg-6a',
    name: 'TRG-6A',
    kind: 'trigonal crystal',
    classId: 'trigonal',
    params: fromStiffnessGPa('trigonal', [
      [1, 1, 87], [2, 2, 87], [3, 3, 105],
      [1, 2, 7], [1, 3, 12], [2, 3, 12],
      [4, 4, 58], [5, 5, 58], [6, 6, (87 - 7) / 2],
      [1, 4, -18], [2, 4, 18], [5, 6, -18],
    ]),
    section: 'n3',
    source: 'Illustrative, rounded values: a teaching example, not material data. C₁₁ = 87, C₁₂ = 7, C₁₃ = 12, C₁₄ = −18, C₃₃ = 105, C₄₄ = 58 GPa.',
    basis: 'Loosely based on the constants of α-quartz reported by Ogi et al., J. Appl. Phys. 100 (2006).',
    blurb: 'In-plane response is isotropic, yet in-plane tension produces out-of-plane shear γyz. Watch the out-of-plane readouts, or open the 3D cube.',
  },
  {
    id: 'ort-9a',
    name: 'ORT-9A',
    kind: 'weakly anisotropic orthotropic solid',
    classId: 'orthotropic',
    params: {
      E1: 13_000, E2: 14_000, E3: 23_000,
      nu12: 0.4, nu13: 0.25, nu23: 0.25,
      G23: 6_000, G13: 5_500, G12: 4_500,
    },
    section: 'n2',
    source: 'Illustrative, rounded values: a teaching example, not material data.',
    basis: 'Loosely based on the orthotropic constants of cortical bone compiled by Taylor et al., J. Biomech. 35 (2002).',
    blurb: 'Section contains axis 3 (along x) and axis 1 (along y). The plane ⟂ axis 3 is nearly isotropic.',
  },
  {
    id: 'ort-9b',
    name: 'ORT-9B',
    kind: 'unidirectional fibre composite',
    classId: 'orthotropic',
    params: { E1: 180_000, E2: 10_000, E3: 10_000, nu12: 0.3, nu13: 0.3, nu23: 0.4, G23: 10_000 / (2 * 1.4), G13: 7_000, G12: 7_000 },
    section: 'n3',
    source: 'Illustrative, rounded values: a teaching example, not material data. E₁ = 180, E₂ = E₃ = 10, G₁₂ = G₁₃ = 7 GPa, ν₁₂ = ν₁₃ = 0.3, ν₂₃ = 0.4 (transversely isotropic about the fibres).',
    basis: 'Loosely based on the unidirectional carbon/epoxy ply data in Tsai & Hahn, Introduction to Composite Materials (1980).',
    blurb: 'Fibres along axis 1. Aligned, it does not shear under tension. Rotate it and extension–shear coupling appears in the specimen frame.',
  },
  {
    id: 'mon-13a',
    name: 'MON-13A',
    kind: 'monoclinic crystal',
    classId: 'monoclinic',
    params: fromStiffnessGPa(
      'monoclinic',
      [
        [1, 1, 230], [2, 2, 180], [3, 3, 240],
        [4, 4, 80], [5, 5, 70], [6, 6, 80],
        [1, 2, 80], [1, 3, 70], [2, 3, 60],
        [1, 5, 10], [2, 5, 6], [3, 5, 40], [4, 6, 7],
      ],
      MONOCLINIC_B_TO_3,
    ),
    section: 'n3',
    source: 'Illustrative, rounded values: a teaching example, not material data. Written with the 2-fold axis along axis 2 and re-expressed with it along axis 3.',
    basis: 'Loosely based on the constants of diopside reported by Sang et al., Am. Mineral. 96 (2011).',
    blurb: 'The specimen plane is the mirror plane, so extension–shear coupling is present in the material’s own axes.',
  },
  {
    id: 'mon-13b',
    name: 'MON-13B',
    kind: 'monoclinic solid with strong extension–shear coupling',
    classId: 'monoclinic',
    params: {
      E1: 50_000, E2: 20_000, E3: 15_000, nu12: 0.25, nu13: 0.2, nu23: 0.3,
      G23: 5_000, G13: 6_000, G12: 10_000,
      eta12_1: 0.8, eta12_2: -0.3, eta12_3: 0.1, mu13_23: 0.2,
    },
    section: 'n3',
    source: 'Illustrative, rounded values: a teaching example, not material data.',
    basis: 'Invented to show extension–shear coupling; not based on any material.',
    blurb: 'Shears visibly under pure tension. Drive η₁₂,₁ through zero (it snaps there) and watch the skew reverse.',
  },
  {
    id: 'trc-21a',
    name: 'TRC-21A',
    kind: 'triclinic crystal',
    classId: 'triclinic',
    params: fromStiffnessGPa('triclinic', [
      [1, 1, 70], [2, 2, 185], [3, 3, 180], [4, 4, 25], [5, 5, 27], [6, 6, 34],
      [1, 2, 34], [1, 3, 31], [2, 3, 6],
      [1, 4, 5], [1, 5, -2], [1, 6, -1],
      [2, 4, -4], [2, 5, -8], [2, 6, -6],
      [3, 4, -9], [3, 5, 7], [3, 6, -10],
      [4, 5, -2], [4, 6, -7], [5, 6, 0.5],
    ]),
    section: 'n3',
    source: 'Illustrative, rounded values: a teaching example, not material data.',
    basis: 'Loosely based on the constants of low albite reported by Brown, Abramson & Angel, Phys. Chem. Minerals 33 (2006).',
    blurb: 'Every coupling present: in-plane tension also produces out-of-plane shears γyz and γxz.',
  },
];
