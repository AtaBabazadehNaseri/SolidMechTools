// "Bring your own material": units and notations of entered matrices, text
// parsing, the minimal checks on loading, and turning the entry into a
// material the Lab can run (a class with constants, plus an orientation).
// Specification: docs/own-material.md. Data format: docs/material-format.md.

import {
  type ClassFit,
  type Mat,
  type MaterialPreset,
  type MatrixKind,
  type Params,
  type PlaneClassId,
  type SpaceClassId,
  type SymmetryClassId,
  PLANE_ORDER,
  SPACE_ORDER,
  SYMMETRY_CLASSES,
  bestFit,
  embedPlane,
  inverse,
  matMul,
  paramsFromCompliance,
  planeClassFits,
  spaceClassFits,
  symmetricEigen,
  transpose,
  voigtToMandel,
} from '../mechanics';

// ---------------------------------------------------------------------------
// Units and notation

export type Unit = 'Pa' | 'kPa' | 'MPa' | 'GPa' | 'TPa' | 'psi' | 'ksi' | 'Msi';
export const UNITS: Unit[] = ['GPa', 'MPa', 'TPa', 'kPa', 'Pa', 'Msi', 'ksi', 'psi'];
/** MPa per unit. */
export const UNIT_MPA: Record<Unit, number> = {
  Pa: 1e-6,
  kPa: 1e-3,
  MPa: 1,
  GPa: 1e3,
  TPa: 1e6,
  psi: 6.894757293168e-3,
  ksi: 6.894757293168,
  Msi: 6894.757293168,
};

export type OrderId = 'voigt' | 'shear-12-13-23';
export const ORDER_LABEL: Record<OrderId, string> = { voigt: '11, 22, 33, 23, 13, 12 (Voigt)', 'shear-12-13-23': '11, 22, 33, 12, 13, 23' };
/** Position p of the entered matrix holds the Lab's Voigt slot ORDERS[id][p]. */
const ORDERS: Record<OrderId, number[]> = { voigt: [0, 1, 2, 3, 4, 5], 'shear-12-13-23': [0, 1, 2, 5, 4, 3] };
export const ORDER_COMPONENTS: Record<OrderId, string[]> = { voigt: ['11', '22', '33', '23', '13', '12'], 'shear-12-13-23': ['11', '22', '33', '12', '13', '23'] };

export type ShearConvention = 'engineering' | 'tensor' | 'mandel';
export const SHEAR_LABEL: Record<ShearConvention, string> = {
  engineering: 'engineering (γ = 2ε)',
  tensor: 'tensor components (Cᵢⱼₖₗ, Sᵢⱼₖₗ)',
  mandel: 'Mandel (√2 on shear)',
};

export interface Notation {
  kind: MatrixKind;
  order: OrderId;
  shear: ShearConvention;
  unit: Unit;
}

const isShearSlot = (n: number, i: number) => (n === 6 ? i >= 3 : i === 2);

/** Factor f with M_standard = f · M_entered for one entry, for the shear convention only. */
function shearFactor(n: number, kind: MatrixKind, shear: ShearConvention, i: number, j: number): number {
  const s = (isShearSlot(n, i) ? 1 : 0) + (isShearSlot(n, j) ? 1 : 0);
  if (shear === 'engineering' || s === 0) return 1;
  if (shear === 'mandel') return kind === 'stiffness' ? Math.SQRT1_2 ** s : Math.SQRT2 ** s;
  // Tensor components in Voigt positions: C_IJ = C_ijkl already; S_IJ = n_I n_J S_ijkl with n = 2 for shear.
  return kind === 'stiffness' ? 1 : 2 ** s;
}

/**
 * An entered matrix (6×6, or 3×3 in the order 11, 22, 12) in the Lab's
 * notation: Voigt order, engineering shear, MPa or MPa⁻¹. The kind is unchanged.
 */
export function toStandard(M: Mat, n: Notation): Mat {
  const size = M.length;
  const order = size === 6 ? ORDERS[n.order] : [0, 1, 2];
  const u = UNIT_MPA[n.unit];
  const out = M.map((row) => row.map(() => 0));
  for (let p = 0; p < size; p++)
    for (let q = 0; q < size; q++) {
      const i = order[p];
      const j = order[q];
      out[i][j] = M[p][q] * shearFactor(size, n.kind, n.shear, i, j) * (n.kind === 'stiffness' ? u : 1 / u);
    }
  return out;
}

/** The reverse of toStandard: a standard matrix written in another notation. */
export function fromStandard(M: Mat, n: Notation): Mat {
  const size = M.length;
  const order = size === 6 ? ORDERS[n.order] : [0, 1, 2];
  const u = UNIT_MPA[n.unit];
  return order.map((i) => order.map((j) => (M[i][j] / shearFactor(size, n.kind, n.shear, i, j)) * (n.kind === 'stiffness' ? 1 / u : u)));
}

// ---------------------------------------------------------------------------
// Text

export type Parsed = { M: Mat } | { error: string };

/**
 * A square matrix from pasted text: a full matrix, or its upper or lower
 * triangle, row by row. Numbers may be separated by spaces, tabs, commas or
 * semicolons; '#' and '//' start comments; '−' (Unicode minus) is accepted.
 */
export function parseMatrixText(text: string, n: number): Parsed {
  const rows: number[][] = [];
  const lines = text.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].replace(/(#|\/\/).*$/, '').replace(/−/g, '-').trim();
    if (!line) continue;
    const row: number[] = [];
    for (const tok of line.split(/[\s,;]+/).filter(Boolean)) {
      const v = Number(tok);
      if (!Number.isFinite(v)) return { error: `“${tok}” on line ${li + 1} is not a number.` };
      row.push(v);
    }
    rows.push(row);
  }
  const lens = rows.map((r) => r.length);
  const M = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const fillUpper = (vals: number[]) => {
    let k = 0;
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) M[i][j] = M[j][i] = vals[k++];
  };
  if (rows.length === n && lens.every((l) => l === n)) return { M: rows.map((r) => [...r]) };
  if (rows.length === n && lens.every((l, i) => l === n - i)) {
    fillUpper(rows.flat());
    return { M };
  }
  if (rows.length === n && lens.every((l, i) => l === i + 1)) {
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) M[i][j] = M[j][i] = rows[i][j];
    return { M };
  }
  const all = rows.flat();
  if (all.length === n * n) return { M: Array.from({ length: n }, (_, i) => all.slice(i * n, i * n + n)) };
  if (all.length === (n * (n + 1)) / 2) {
    fillUpper(all);
    return { M };
  }
  if (all.length === 0) return { error: `Paste a ${n}×${n} matrix.` };
  return {
    error: `Expected a ${n}×${n} matrix (${n * n} numbers), or its upper or lower triangle (${(n * (n + 1)) / 2}); found ${all.length} number${all.length === 1 ? '' : 's'} on ${rows.length} line${rows.length === 1 ? '' : 's'}.`,
  };
}

// ---------------------------------------------------------------------------
// Checks

const COMPONENTS_3D = ['ε₁₁', 'ε₂₂', 'ε₃₃', 'γ₂₃', 'γ₁₃', 'γ₁₂'];
const COMPONENTS_2D = ['ε₁₁', 'ε₂₂', 'γ₁₂'];

/** A Mandel strain (or stress) mode in words: its dominant components with signs, e.g. "ε₁₁ − ε₂₂". */
export function describeMode(v: number[]): string {
  const names = v.length === 6 ? COMPONENTS_3D : COMPONENTS_2D;
  const big = Math.max(...v.map(Math.abs));
  const lead = v.findIndex((x) => Math.abs(x) === big);
  const sign = Math.sign(v[lead]) || 1;
  const terms = v.map((x, i) => ({ x: x * sign, i })).filter((t) => Math.abs(t.x) >= 0.3 * big);
  return terms.map((t, k) => (k === 0 ? (t.x < 0 ? '−' : '') : t.x < 0 ? ' − ' : ' + ') + names[t.i]).join('');
}

export interface Stability {
  ok: boolean;
  /** Smallest eigenvalue of the stiffness in Mandel form (MPa), and its strain mode. */
  minModulus: number;
  mode: string;
}

/** Positive definiteness of a standard compliance or stiffness (6×6 or 3×3), as Kelvin moduli. */
export function stability(M: Mat, kind: MatrixKind): Stability {
  const { values, vectors } = symmetricEigen(voigtToMandel(M, kind));
  // Compliance eigenvalues are 1/λ of the stiffness's; the smallest λ belongs to the largest compliance eigenvalue.
  if (kind === 'stiffness') return { ok: values[0] > 0, minModulus: values[0], mode: describeMode(vectors[0]) };
  const k = values[0] <= 0 ? 0 : values.length - 1;
  return { ok: values[0] > 0, minModulus: values[0] <= 0 ? values[0] : 1 / values[k], mode: describeMode(vectors[k]) };
}

export interface SymmetryCheck {
  /** max |M − Mᵀ| / max |M|. */
  asymmetry: number;
  /** The symmetric part, used when the asymmetry is only rounding. */
  M: Mat;
}

/** Asymmetry above this is refused; below it (and above round-off) the matrix is averaged with its transpose. */
export const ASYMMETRY_LIMIT = 1e-2;

export function symmetrize(M: Mat): SymmetryCheck {
  const big = Math.max(...M.flat().map(Math.abs), 1e-300);
  const asym = Math.max(...M.flatMap((row, i) => row.map((v, j) => Math.abs(v - M[j][i])))) / big;
  return { asymmetry: asym, M: M.map((row, i) => row.map((v, j) => 0.5 * (v + M[j][i]))) };
}

// ---------------------------------------------------------------------------
// Entries and their analysis

export type Dimension = 2 | 3;
export type Plane = 'stress' | 'strain';

export interface MatrixEntry {
  definition: 'matrix';
  dimension: Dimension;
  /** 2D only. */
  plane: Plane;
  notation: Notation;
  matrix: Mat;
}

export interface ConstantsEntry {
  definition: 'constants';
  dimension: Dimension;
  /** 2D only. */
  plane: Plane;
  classId: SymmetryClassId;
  /** Moduli in `unit`, ratios as they are. */
  constants: Params;
  unit: Unit;
}

export type Entry = MatrixEntry | ConstantsEntry;

export interface Analysis {
  /** Reasons the entry cannot be loaded. */
  errors: string[];
  /** Things the user should know, e.g. that a small asymmetry was averaged out. */
  notes: string[];
  /** Standard compliance in the entered material axes (6×6, or the 3×3 in-plane S̄). */
  S: Mat | null;
  /** Matrix entries: distance to each class, highest symmetry first, and the suggested class. */
  fits: Array<ClassFit<SymmetryClassId>>;
  suggested: SymmetryClassId | null;
}

const empty = (errors: string[], notes: string[] = []): Analysis => ({ errors, notes, S: null, fits: [], suggested: null });

export function analyze(e: Entry): Analysis {
  return e.definition === 'matrix' ? analyzeMatrix(e) : analyzeConstants(e);
}

function analyzeMatrix(e: MatrixEntry): Analysis {
  const n = e.dimension === 3 ? 6 : 3;
  if (e.matrix.length !== n || e.matrix.some((r) => r.length !== n)) return empty([`Expected a ${n}×${n} matrix.`]);
  const notes: string[] = [];
  const sym = symmetrize(e.matrix);
  if (sym.asymmetry > ASYMMETRY_LIMIT)
    return empty([
      `The matrix is not symmetric: entries mirrored across the diagonal differ by up to ${(100 * sym.asymmetry).toPrecision(2)} % of the largest entry. An elastic stiffness or compliance is always symmetric; check that the matrix is complete and in one convention.`,
    ]);
  if (sym.asymmetry > 1e-9) notes.push(`Entries mirrored across the diagonal differed by up to ${(100 * sym.asymmetry).toPrecision(2)} % of the largest entry (rounding); the matrix was averaged with its transpose.`);
  const std = toStandard(sym.M, e.notation);
  const st = stability(std, e.notation.kind);
  if (!st.ok)
    return empty(
      [
        `Not stable (not positive definite): the stiffness has a ${st.minModulus === 0 ? 'zero' : 'negative'} Kelvin modulus for the strain mode ${st.mode}, so deforming the material that way would ${st.minModulus === 0 ? 'cost no energy' : 'release energy'}. Check the units, the component order and the shear convention.`,
      ],
      notes,
    );
  const S = e.notation.kind === 'compliance' ? std : inverse(std);
  const fits: Array<ClassFit<SymmetryClassId>> = n === 6 ? spaceClassFits(std, e.notation.kind) : planeClassFits(std, e.notation.kind);
  const order: SymmetryClassId[] = n === 6 ? SPACE_ORDER : PLANE_ORDER;
  fits.sort((a, b) => order.indexOf(a.classId) - order.indexOf(b.classId));
  return { errors: [], notes, S, fits, suggested: bestFit(fits, order).classId };
}

function analyzeConstants(e: ConstantsEntry): Analysis {
  const cls = SYMMETRY_CLASSES[e.classId];
  if (cls.dimension !== e.dimension) return empty(['The symmetry class does not match the dimension.']);
  const errors: string[] = [];
  const p: Params = {};
  for (const d of cls.params) {
    const v = e.constants[d.key];
    if (v === undefined || !Number.isFinite(v)) errors.push(`Enter a value for ${d.key}.`);
    else if (d.kind === 'modulus' && v <= 0) errors.push(`${d.key} must be positive.`);
    else p[d.key] = d.kind === 'modulus' ? v * UNIT_MPA[e.unit] : v;
  }
  if (errors.length) return empty(errors);
  const S6 = cls.build(p);
  const S = e.dimension === 3 ? S6 : [0, 1, 5].map((i) => [0, 1, 5].map((j) => S6[i][j]));
  const st = stability(S, 'compliance');
  if (!st.ok)
    return empty([
      `These constants are not stable (not positive definite): the material would release energy if deformed in the mode ${st.mode}. Each knob in the Lab shows the admissible range of its constant; for an isotropic solid it is −1 < ν < ½.`,
    ]);
  return { errors: [], notes: [], S, fits: [], suggested: e.classId };
}

// ---------------------------------------------------------------------------
// Loading

export interface Loadable {
  preset: MaterialPreset;
  /** 2D data: the angle of axis 1 from x becomes the initial θ. */
  thetaDeg: number;
}

/**
 * The material the Lab will run: constants of the chosen class, and the
 * orientation. Choosing a class other than the exact one replaces the matrix
 * by its nearest member of that class; a class whose distinguished axis is
 * relabelled gets the matching orientation, so the specimen sees the same
 * material.
 */
export function toLoadable(e: Entry, a: Analysis, opts: { classId: SymmetryClassId; R: Mat; thetaDeg: number; name: string; source: string }): Loadable {
  const cls = SYMMETRY_CLASSES[opts.classId];
  let params: Params;
  let R = opts.R;
  if (e.definition === 'constants') {
    params = Object.fromEntries(cls.params.map((d) => [d.key, d.kind === 'modulus' ? e.constants[d.key] * UNIT_MPA[e.unit] : e.constants[d.key]]));
  } else {
    const fit = a.fits.find((f) => f.classId === opts.classId)!;
    const kind = e.notation.kind;
    if (e.dimension === 3) {
      const S = kind === 'compliance' ? fit.nearest : inverse(fit.nearest);
      params = paramsFromCompliance(cls, S);
      R = matMul(opts.R, transpose(fit.relabel));
    } else {
      const S2 = kind === 'compliance' ? fit.nearest : inverse(fit.nearest);
      params = paramsFromCompliance(cls, embedPlane(S2));
    }
  }
  const identity = R.every((row, i) => row.every((v, j) => Math.abs(v - (i === j ? 1 : 0)) < 1e-12));
  return {
    preset: {
      id: 'user',
      name: opts.name.trim() || 'Your material',
      kind: e.dimension === 2 ? 'your 2D data' : 'your material',
      classId: opts.classId,
      params,
      section: e.dimension === 2 || identity ? 'n3' : 'custom',
      orientation: e.dimension === 2 || identity ? undefined : R,
      plane: e.dimension === 2 ? e.plane : undefined,
      source: opts.source.trim() || 'Entered by you.',
      blurb:
        e.dimension === 2
          ? `In-plane (${e.plane === 'stress' ? 'plane stress' : 'plane strain'}) data: everything out of the plane needs 3D constants and is not shown.`
          : 'Entered by you. The knobs are its constants in the class axes; the matrices follow from them.',
    },
    thetaDeg: e.dimension === 2 ? opts.thetaDeg : 0,
  };
}

/** 3D class ids, and in-plane ones, in the order the input form lists them. */
export const ENTRY_CLASSES: Record<Dimension, SymmetryClassId[]> = { 3: SPACE_ORDER as SpaceClassId[], 2: PLANE_ORDER as PlaneClassId[] };
