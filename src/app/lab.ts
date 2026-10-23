// Application state, actions, and the derived quantities shown in the UI.
// Every number displayed or drawn comes from `deriveLab` / `deriveMaterial`,
// which only call the mechanics engine.

import {
  type ApparentConstants,
  type PlaneConstants,
  type Control,
  type EffectiveSymmetry,
  type Interval,
  type KelvinMode,
  type KnobSnaps,
  type LoadCase,
  type Mat,
  type MaterialPreset,
  type OutOfPlane,
  type PatternCell,
  type PlaneMode,
  type PlaneResponse,
  type Principal2D,
  type Params,
  type SectionId,
  type SymmetryClassDef,
  type SymmetryClassId,
  IN_PLANE,
  OUT_OF_PLANE,
  PRESETS,
  SECTIONS,
  SYMMETRY_CLASSES,
  apparentConstants,
  planeConstants,
  apparentStiffness,
  coaxialDirections,
  compliancePattern,
  effectivePlaneSymmetry,
  effectiveSymmetry,
  inverse,
  kelvinModes2D,
  kelvinModuli,
  knobDirection,
  knobInterval,
  matMul,
  outOfPlane,
  planeCompliance,
  planeExtremes,
  planeStiffness,
  rotateComplianceVoigt,
  scale,
  snapTargets,
  solveMixed,
  specimenRotationFrom,
  strainEnergyDensity,
  strainPrincipal,
  stressPrincipal,
  universalAnisotropy,
  youngExtremes3D,
} from '../mechanics';

export type MatrixId = 'C' | 'S';
export interface Selection {
  matrix: MatrixId;
  i: number;
  j: number;
}

export interface Track {
  min: number;
  max: number;
  log: boolean;
}

export interface Snapshot {
  label: string;
  S2: Mat;
  C2: Mat;
  response: PlaneResponse;
  out: OutOfPlane;
  apparentModulus: number;
}

export interface Overlays {
  materialAxes: boolean;
  materialLines: boolean;
  principalStress: boolean;
  principalStrain: boolean;
  cut: boolean;
}

export interface LabState {
  /** The example the current constants started from (Reset returns to it). */
  presetId: string;
  /** True once any material constant has been changed away from the example. */
  custom: boolean;
  classId: SymmetryClassId;
  params: Params;
  tracks: Record<string, Track>;
  /** Section plane preset, or 'custom' to use `customR`. */
  section: SectionId | 'custom';
  /** Material → specimen rotation entered by the user (columns: axes 1, 2, 3 in x, y, z). */
  customR: Mat | null;
  /** A material entered by the user; `presetId` is 'user' while it is the starting point. */
  userPreset: MaterialPreset | null;
  thetaDeg: number;
  mode: PlaneMode;
  load: LoadCase;
  /** Reference stress (MPa) and strain used for default loads, slider ranges and arrow scale. */
  scales: { stress: number; strain: number };
  magnification: number;
  selected: Selection | null;
  pinned: Snapshot | null;
  overlays: Overlays;
  /** Direction of the cut's unit normal, degrees from x. */
  cutDeg: number;
  mohr: 'stress' | 'strain';
}

// ---------------------------------------------------------------------------
// Loading experiments. Values are in units of the reference stress / strain.

export interface Experiment {
  id: string;
  name: string;
  hint: string;
  control: [Control, Control, Control];
  value: [number, number, number];
}

const SSS: [Control, Control, Control] = ['stress', 'stress', 'stress'];

export const EXPERIMENTS: Experiment[] = [
  { id: 'uniaxial', name: 'Uniaxial stress', hint: 'Traction σxx on the x faces; every other traction is zero.', control: SSS, value: [1, 0, 0] },
  { id: 'shear', name: 'Pure shear', hint: 'Shear traction τxy on all four faces; no normal tractions.', control: SSS, value: [0, 0, 1] },
  { id: 'lock-yy', name: 'Lateral constraint', hint: 'Traction σxx while the y faces are held so that εyy = 0: a reaction σyy appears.', control: ['stress', 'strain', 'stress'], value: [1, 0, 0] },
  { id: 'lock-xy', name: 'Shear constraint', hint: 'Traction σxx while the shear γxy is held at zero: a reaction τxy appears.', control: ['stress', 'stress', 'strain'], value: [1, 0, 0] },
  { id: 'uniaxial-strain', name: 'Uniaxial strain', hint: 'Displacement-controlled εxx with εyy = γxy = 0: the stresses are a column of C̄.', control: ['strain', 'strain', 'strain'], value: [1, 0, 0] },
];

export function loadCaseFor(exp: Experiment, scales: LabState['scales']): LoadCase {
  return {
    control: [...exp.control],
    value: exp.value.map((v, i) => v * (exp.control[i] === 'stress' ? scales.stress : scales.strain)) as LoadCase['value'],
  };
}

// ---------------------------------------------------------------------------

export function niceRound(x: number): number {
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

function trackFor(cls: SymmetryClassDef, params: Params, key: string): Track {
  const def = cls.params.find((d) => d.key === key)!;
  const v = params[key];
  if (def.kind === 'modulus') return { min: v / 10, max: v * 10, log: true };
  const { lo, hi } = knobInterval(cls, params, key);
  const a = Math.max(Number.isFinite(lo) ? lo : v - 2, -2.5);
  const b = Math.min(Number.isFinite(hi) ? hi : v + 2, 2.5);
  const pad = 0.15 * (b - a);
  return { min: Math.min(a - pad, v), max: Math.max(b + pad, v), log: false };
}

/** Slider ranges centred on the given constants (a decade either way for moduli). */
export function tracksFor(classId: SymmetryClassId, params: Params): Record<string, Track> {
  const cls = SYMMETRY_CLASSES[classId];
  return Object.fromEntries(cls.params.map((d) => [d.key, trackFor(cls, params, d.key)]));
}

/** The example (or the user's own material) the current constants started from. */
export function presetOf(s: Pick<LabState, 'presetId' | 'userPreset'>): MaterialPreset {
  if (s.presetId === 'user' && s.userPreset) return s.userPreset;
  return PRESETS.find((p) => p.id === s.presetId) ?? PRESETS[0];
}

/** Material → specimen rotation before the in-plane rotation θ. */
export function baseRotation(s: Pick<LabState, 'section' | 'customR'>): Mat {
  return s.section === 'custom' && s.customR ? s.customR : SECTIONS[s.section === 'custom' ? 'n3' : s.section].R;
}

/** 2D data: in-plane constants only, with the plane state fixed. */
export const isPlaneData = (s: Pick<LabState, 'classId'>) => SYMMETRY_CLASSES[s.classId].dimension === 2;

const DEFAULT_OVERLAYS: Overlays = { materialAxes: true, materialLines: true, principalStress: false, principalStrain: false, cut: false };

export function initialState(presetId: string, keep?: Partial<LabState>): LabState {
  return initialStateFrom(PRESETS.find((p) => p.id === presetId) ?? PRESETS[0], keep);
}

/** A fresh lab state for any material, including one entered by the user (id 'user'). */
export function initialStateFrom(preset: MaterialPreset, keep?: Partial<LabState>): LabState {
  const cls = SYMMETRY_CLASSES[preset.classId];
  // 2D data describes one plane state only.
  const mode = preset.plane ?? keep?.mode ?? 'stress';
  const customR = preset.section === 'custom' ? (preset.orientation ?? null) : (keep?.customR ?? null);
  const R0 = baseRotation({ section: preset.section, customR });
  const S2 = planeCompliance(rotateComplianceVoigt(cls.build(preset.params), specimenRotationFrom(R0, 0)), mode);
  const scales = { stress: niceRound(1e-3 / S2[0][0]), strain: 1e-3 };
  const load = loadCaseFor(EXPERIMENTS[0], scales);
  const { strain } = solveMixed(S2, load);
  return {
    presetId: preset.id,
    custom: false,
    classId: preset.classId,
    params: { ...preset.params },
    tracks: tracksFor(preset.classId, preset.params),
    section: preset.section,
    customR,
    userPreset: preset.id === 'user' ? preset : (keep?.userPreset ?? null),
    thetaDeg: 0,
    mode,
    load,
    scales,
    magnification: niceRound(0.08 / Math.max(...strain.map(Math.abs))),
    selected: null,
    pinned: null,
    overlays: keep?.overlays ?? DEFAULT_OVERLAYS,
    cutDeg: keep?.cutDeg ?? 60,
    mohr: keep?.mohr ?? 'stress',
  };
}

export type Action =
  | { type: 'preset'; id: string }
  | { type: 'symmetryClass'; classId: SymmetryClassId }
  | { type: 'custom' }
  /** Everything back to the preset (keeps mode and overlays). */
  | { type: 'reset' }
  /** Material constants only. */
  | { type: 'resetParams' }
  /** Boundary conditions only: uniaxial stress. */
  | { type: 'resetLoad' }
  | { type: 'param'; key: string; value: number }
  | { type: 'section'; section: SectionId | 'custom' }
  /** Start from a material entered by the user (it becomes the 'user' preset). */
  | { type: 'loadMaterial'; preset: MaterialPreset; thetaDeg?: number }
  | { type: 'theta'; deg: number }
  | { type: 'mode'; mode: PlaneMode }
  | { type: 'control'; i: number; control: Control }
  | { type: 'loadValue'; i: number; value: number }
  | { type: 'experiment'; id: string }
  | { type: 'loadCase'; load: LoadCase }
  | { type: 'magnification'; value: number }
  | { type: 'select'; selection: Selection | null }
  | { type: 'pin'; snapshot: Snapshot | null }
  | { type: 'overlay'; key: keyof Overlays; on: boolean }
  | { type: 'cut'; deg: number }
  | { type: 'mohr'; kind: 'stress' | 'strain' }
  /** Used by guides to set up a step. */
  | { type: 'replace'; state: LabState };

export function reducer(state: LabState, a: Action): LabState {
  // The user's material and orientation survive switching to an example and back.
  const keep = { mode: state.mode, overlays: state.overlays, cutDeg: state.cutDeg, mohr: state.mohr, userPreset: state.userPreset, customR: state.customR };
  switch (a.type) {
    case 'preset':
      return a.id === 'user' && state.userPreset ? initialStateFrom(state.userPreset, keep) : initialState(a.id, keep);
    case 'loadMaterial':
      return { ...initialStateFrom(a.preset, { ...keep, userPreset: a.preset }), thetaDeg: a.thetaDeg ?? 0 };
    case 'symmetryClass':
      // A new class starts from its first example.
      return a.classId === state.classId ? state : initialState(PRESETS.find((p) => p.classId === a.classId)!.id, keep);
    case 'custom':
      return { ...state, custom: true };
    case 'reset':
      return initialStateFrom(presetOf(state), keep);
    case 'resetParams':
      return { ...state, custom: false, params: { ...presetOf(state).params } };
    case 'resetLoad':
      return { ...state, load: loadCaseFor(EXPERIMENTS[0], state.scales) };
    case 'param':
      return { ...state, custom: true, params: { ...state.params, [a.key]: a.value } };
    case 'section':
      // 2D data has no other section; 'custom' needs an entered orientation.
      if (isPlaneData(state) || (a.section === 'custom' && !state.customR)) return state;
      return { ...state, section: a.section };
    case 'theta':
      return { ...state, thetaDeg: a.deg };
    case 'mode':
      // 2D data describes one plane state; the other one needs the out-of-plane constants.
      if (isPlaneData(state)) return state;
      return { ...state, mode: a.mode, pinned: null };
    case 'control': {
      // Switching a component's control starts from zero: traction-free or locked.
      const control = [...state.load.control] as LoadCase['control'];
      const value = [...state.load.value] as LoadCase['value'];
      control[a.i] = a.control;
      value[a.i] = 0;
      return { ...state, load: { control, value } };
    }
    case 'loadValue': {
      const value = [...state.load.value] as LoadCase['value'];
      value[a.i] = a.value;
      return { ...state, load: { ...state.load, value } };
    }
    case 'experiment':
      return { ...state, load: loadCaseFor(EXPERIMENTS.find((e) => e.id === a.id)!, state.scales) };
    case 'loadCase':
      return { ...state, load: a.load };
    case 'magnification':
      return { ...state, magnification: a.value };
    case 'select':
      return { ...state, selected: a.selection };
    case 'pin':
      return { ...state, pinned: a.snapshot };
    case 'overlay':
      return { ...state, overlays: { ...state.overlays, [a.key]: a.on } };
    case 'cut':
      return { ...state, cutDeg: a.deg };
    case 'mohr':
      return { ...state, mohr: a.kind };
    case 'replace':
      return a.state;
  }
}

/** The single test that isolates a matrix entry: its column is the response to a unit input. */
export function entryExperiment(sel: Selection, scales: LabState['scales']): LoadCase {
  const value: LoadCase['value'] = [0, 0, 0];
  if (sel.matrix === 'S') {
    value[sel.j] = scales.stress;
    return { control: ['stress', 'stress', 'stress'], value };
  }
  value[sel.j] = scales.strain;
  return { control: ['strain', 'strain', 'strain'], value };
}

/** Prescribe a Kelvin mode as the strain state, scaled so its largest principal strain is the reference strain. */
export function kelvinLoad(mode: KelvinMode, scales: LabState['scales']): LoadCase {
  const p = strainPrincipal(mode.strain);
  const k = scales.strain / Math.max(Math.abs(p.max), Math.abs(p.min));
  return { control: ['strain', 'strain', 'strain'], value: mode.strain.map((v) => v * k) as LoadCase['value'] };
}

// ---------------------------------------------------------------------------
// Material-only quantities (independent of section, rotation and loading).

export interface MaterialDerived {
  /** 2 for in-plane data: the 3D quantities below are then computed from a placeholder and must not be shown. */
  dimension: 2 | 3;
  S6mat: Mat;
  symmetry: EffectiveSymmetry;
  pattern: PatternCell[][];
  universal: number;
  young3D: { min: number; max: number };
  kelvin3D: number[];
}

export function deriveMaterial(classId: SymmetryClassId, params: Params): MaterialDerived {
  const cls = SYMMETRY_CLASSES[classId];
  const S6mat = cls.build(params);
  const y = youngExtremes3D(S6mat);
  return {
    dimension: cls.dimension,
    S6mat,
    symmetry: cls.dimension === 2 ? { classId: effectivePlaneSymmetry(S6mat), axis: null } : effectiveSymmetry(S6mat),
    pattern: compliancePattern(cls, params),
    universal: universalAnisotropy(S6mat),
    young3D: { min: y.min, max: y.max },
    kelvin3D: kelvinModuli(S6mat),
  };
}

export type KnobEffect = 'in-plane' | 'out-of-plane' | 'none';

export interface LabDerived {
  cls: SymmetryClassDef;
  /** Material → specimen rotation. */
  R: Mat;
  /** 3D compliance and stiffness in specimen axes (Voigt, MPa⁻¹ / MPa). */
  S6: Mat;
  C6: Mat;
  /** In-plane compliance and stiffness for the current mode, specimen axes. */
  S2: Mat;
  C2: Mat;
  response: PlaneResponse;
  out: OutOfPlane;
  energy: number;
  /** 3D engineering constants read in specimen axes. */
  constants: ApparentConstants;
  /** 2D engineering constants of the current mode in specimen axes (free 2D tests). */
  plane: PlaneConstants;
  principal: { stress: Principal2D; strain: Principal2D };
  kelvin2D: KelvinMode[];
  coaxial: { all: boolean; angles: number[] };
  planeExt: { Emin: number; Emax: number; Gmin: number; Gmax: number };
  intervals: Record<string, Interval>;
  effects: Record<string, KnobEffect>;
  snaps: Record<string, KnobSnaps>;
  /** dσxx/dεxx under the current controls, with its bounds 1/S̄11 and C̄11. */
  apparentModulus: { value: number; free: number; locked: number };
}

export function deriveLab(s: LabState): LabDerived {
  const cls = SYMMETRY_CLASSES[s.classId];
  const R = specimenRotationFrom(baseRotation(s), (s.thetaDeg * Math.PI) / 180);
  const S6 = rotateComplianceVoigt(cls.build(s.params), R);
  const C6 = inverse(S6);
  const S2 = planeCompliance(S6, s.mode);
  const C2 = planeStiffness(S6, s.mode);
  const response = solveMixed(S2, s.load);

  // Which knobs act on what: plane stress reads the compliance, plane strain the stiffness (dC = −C dS C).
  const effects: Record<string, KnobEffect> = {};
  const intervals: Record<string, Interval> = {};
  for (const d of cls.params) {
    intervals[d.key] = knobInterval(cls, s.params, d.key);
    const dS = rotateComplianceVoigt(knobDirection(cls, s.params, d.key).A, R);
    const A = s.mode === 'stress' ? dS : scale(matMul(matMul(C6, dS), C6), -1);
    const ref = Math.max(...A.flat().map(Math.abs));
    const touches = (rows: readonly number[]) => rows.some((i) => IN_PLANE.some((j) => Math.abs(A[i][j]) > 1e-9 * ref));
    effects[d.key] = touches(IN_PLANE) ? 'in-plane' : touches(OUT_OF_PLANE) ? 'out-of-plane' : 'none';
  }

  return {
    cls,
    R,
    S6,
    C6,
    S2,
    C2,
    response,
    out: outOfPlane(S6, s.mode, response),
    energy: strainEnergyDensity(response),
    constants: apparentConstants(S6),
    plane: planeConstants(S2),
    principal: { stress: stressPrincipal(response.stress), strain: strainPrincipal(response.strain) },
    kelvin2D: kelvinModes2D(C2),
    coaxial: coaxialDirections(S2),
    planeExt: planeExtremes(S2, C2),
    intervals,
    effects,
    snaps: snapTargets(cls, s.params),
    apparentModulus: {
      value: apparentStiffness(C2, s.load.control, 0),
      free: 1 / S2[0][0],
      locked: C2[0][0],
    },
  };
}

/** Name of the experiment the load case matches, if any. */
export function experimentName(s: LabState): string | null {
  const same = (e: Experiment) => {
    const l = loadCaseFor(e, s.scales);
    return l.control.every((c, i) => c === s.load.control[i]) && l.value.every((v, i) => Math.abs(v - s.load.value[i]) <= 1e-12 * Math.max(1, Math.abs(v)));
  };
  return EXPERIMENTS.find(same)?.name ?? null;
}

export function snapshotOf(s: LabState, d: LabDerived): Snapshot {
  const preset = presetOf(s);
  const material = s.custom ? `custom (from ${preset.name})` : preset.name;
  const mode = s.mode === 'stress' ? 'plane stress' : 'plane strain';
  return {
    label: [material, `θ = ${s.thetaDeg}°`, mode, experimentName(s) ?? 'custom loading'].join(' · '),
    S2: d.S2,
    C2: d.C2,
    response: d.response,
    out: d.out,
    apparentModulus: d.apparentModulus.value,
  };
}

// ---------------------------------------------------------------------------
// The constraint ladder: dσxx/dεxx for each way of treating εyy and γxy.

export interface LadderRung {
  yy: Control;
  xy: Control;
  stiffness: number;
}

export function constraintLadder(C2: Mat): LadderRung[] {
  const rungs: Array<[Control, Control]> = [
    ['stress', 'stress'],
    ['strain', 'stress'],
    ['stress', 'strain'],
    ['strain', 'strain'],
  ];
  return rungs.map(([yy, xy]) => ({ yy, xy, stiffness: apparentStiffness(C2, ['strain', yy, xy], 0) }));
}

// ---------------------------------------------------------------------------
// Rotation sweep: the current experiment repeated at every material angle.

export type SweepQuantity = 'exx' | 'eyy' | 'gxy' | 'sxx' | 'syy' | 'txy' | 'zz' | 'energy' | 'stiffness' | 'Ex' | 'nu' | 'eta';

export const SWEEP_QUANTITIES: Array<{ id: SweepQuantity; label: string; unit: string }> = [
  { id: 'exx', label: 'εxx', unit: '10⁻³' },
  { id: 'eyy', label: 'εyy', unit: '10⁻³' },
  { id: 'gxy', label: 'γxy', unit: '10⁻³' },
  { id: 'sxx', label: 'σxx', unit: 'MPa' },
  { id: 'syy', label: 'σyy', unit: 'MPa' },
  { id: 'txy', label: 'τxy', unit: 'MPa' },
  { id: 'zz', label: 'εzz (plane stress) / σzz (plane strain)', unit: '10⁻³ / MPa' },
  { id: 'energy', label: 'strain energy W', unit: 'kJ/m³' },
  { id: 'stiffness', label: 'apparent stiffness dσxx/dεxx', unit: 'GPa' },
  { id: 'Ex', label: 'Eₓ = 1/S̄₁₁: Young’s modulus along x (free test)', unit: 'GPa' },
  { id: 'eta', label: 'η xy,x: extension–shear coupling (free test)', unit: '' },
  { id: 'nu', label: 'ν xy: Poisson ratio (free test)', unit: '' },
];

/** Value of one quantity, in display units, for the state's material rotated to θ (degrees). */
export function sweepValue(s: LabState, q: SweepQuantity, thetaDeg: number): number {
  const cls = SYMMETRY_CLASSES[s.classId];
  const S6 = rotateComplianceVoigt(cls.build(s.params), specimenRotationFrom(baseRotation(s), (thetaDeg * Math.PI) / 180));
  const S2 = planeCompliance(S6, s.mode);
  const r = solveMixed(S2, s.load);
  switch (q) {
    case 'exx':
      return r.strain[0] * 1e3;
    case 'eyy':
      return r.strain[1] * 1e3;
    case 'gxy':
      return r.strain[2] * 1e3;
    case 'sxx':
      return r.stress[0];
    case 'syy':
      return r.stress[1];
    case 'txy':
      return r.stress[2];
    case 'zz': {
      const o = outOfPlane(S6, s.mode, r);
      return s.mode === 'stress' ? o.strain[0] * 1e3 : o.stress[0];
    }
    case 'energy':
      return strainEnergyDensity(r) * 1e3;
    case 'eta':
      return S2[2][0] / S2[0][0];
    case 'nu':
      return -S2[1][0] / S2[0][0];
    case 'Ex':
      return 1 / S2[0][0] / 1000;
    case 'stiffness':
      return apparentStiffness(inverse(S2), s.load.control, 0) / 1000;
  }
}

/** In-plane quantities repeat every 180°, so one sweep over [−90°, 90°] covers all orientations. */
export function rotationSweep(s: LabState, q: SweepQuantity, n = 181): Array<{ theta: number; value: number }> {
  return Array.from({ length: n }, (_, k) => {
    const theta = -90 + (180 * k) / (n - 1);
    return { theta, value: sweepValue(s, q, theta) };
  });
}

// ---------------------------------------------------------------------------
// Numerical checks: how well the arithmetic satisfies the equations it solves.
// They say nothing about whether linear elasticity is the right model.

export interface NumericalCheck {
  name: string;
  value: number;
  /** What counts as passing. */
  limit: number;
  detail: string;
}

export function numericalChecks(s: LabState, d: LabDerived): NumericalCheck[] {
  const rel = (A: Mat, B: Mat) => {
    const scaleRef = Math.max(...A.flat().map(Math.abs), ...B.flat().map(Math.abs), 1e-300);
    return Math.max(...A.flat().map((a, k) => Math.abs(a - B.flat()[k]))) / scaleRef;
  };
  const C2C = d.C2;
  const sym = rel(C2C, C2C[0].map((_, j) => C2C.map((row) => row[j])));
  const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const inv = rel(C2C.map((row) => [0, 1, 2].map((j) => row.reduce((acc, v, k) => acc + v * d.S2[k][j], 0))), I3);
  const sigma = d.response.stress;
  const Ceps = C2C.map((row) => row.reduce((acc, v, k) => acc + v * d.response.strain[k], 0));
  const sScale = Math.max(...sigma.map(Math.abs), 1e-300);
  const constitutive = Math.max(...Ceps.map((v, i) => Math.abs(v - sigma[i]))) / sScale;
  const prescribed = Math.max(
    ...[0, 1, 2].map((i) => {
      const got = s.load.control[i] === 'stress' ? sigma[i] : d.response.strain[i];
      const ref = s.load.control[i] === 'stress' ? s.scales.stress : s.scales.strain;
      return Math.abs(got - s.load.value[i]) / ref;
    }),
  );
  // Embed the in-plane state in 3D and check the out-of-plane condition of the mode.
  const eps6 = [d.response.strain[0], d.response.strain[1], d.out.strain[0], d.out.strain[1], d.out.strain[2], d.response.strain[2]];
  const sig6 = d.C6.map((row) => row.reduce((acc, v, k) => acc + v * eps6[k], 0));
  const outResidual =
    s.mode === 'stress'
      ? Math.max(Math.abs(sig6[2]), Math.abs(sig6[3]), Math.abs(sig6[4])) / sScale
      : Math.max(...[2, 3, 4].map((k, a) => Math.abs(sig6[k] - d.out.stress[a]))) / sScale;
  const plane = d.cls.dimension === 2;
  const minKelvin = plane ? Math.min(...d.kelvin2D.map((m) => m.modulus)) : Math.min(...kelvinModuli(d.S6));
  const checks: NumericalCheck[] = [
    {
      name: 'Positive definiteness',
      value: minKelvin / 1000,
      limit: 0,
      detail: plane ? 'Smallest Kelvin modulus of the 2D stiffness C̄ (GPa); must be > 0.' : 'Smallest Kelvin modulus of the 3D stiffness (GPa); must be > 0.',
    },
    { name: 'Symmetry of C̄', value: sym, limit: 1e-12, detail: 'max |C̄ − C̄ᵀ| / max |C̄|' },
    { name: 'C̄ S̄ = I', value: inv, limit: 1e-10, detail: 'max |C̄ S̄ − I|' },
    { name: 'σ = C̄ ε', value: constitutive, limit: 1e-10, detail: 'Constitutive residual of the solved state, relative to max |σ|.' },
    { name: 'Prescribed values met', value: prescribed, limit: 1e-12, detail: 'Largest mismatch of a prescribed stress or strain, relative to its reference value.' },
  ];
  // 2D data has no out-of-plane behaviour to check.
  if (!plane)
    checks.push({
      name: s.mode === 'stress' ? 'Out-of-plane stresses vanish' : 'Out-of-plane reactions consistent',
      value: outResidual,
      limit: 1e-10,
      detail: s.mode === 'stress' ? '3D C applied to the full strain gives σzz = τyz = τxz = 0.' : '3D C applied to the full strain reproduces the reported reactions.',
    });
  return checks;
}
