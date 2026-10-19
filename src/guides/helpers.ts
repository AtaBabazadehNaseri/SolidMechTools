import { type SectionId, strainPrincipal, stressPrincipal } from '../mechanics';
import { EXPERIMENTS, type LabDerived, type LabState, type Overlays, initialState, loadCaseFor, tracksFor } from '../app/lab';

const NO_OVERLAYS: Overlays = { materialAxes: false, materialLines: false, principalStress: false, principalStrain: false, cut: false };

interface Fresh {
  mode?: LabState['mode'];
  overlays?: Partial<Overlays>;
  thetaDeg?: number;
  section?: SectionId;
  params?: Record<string, number>;
  /** Display magnification, when the effect to see is small compared with the axial stretch. */
  magnification?: number;
  /** Direction of the cut's normal, degrees. */
  cutDeg?: number;
}

/** A clean lab state from a preset, with the given overlays on and everything else off. */
export function fresh(presetId: string, prev: LabState, opts: Fresh = {}): LabState {
  const base = initialState(presetId, {
    mode: opts.mode ?? 'stress',
    overlays: { ...NO_OVERLAYS, ...opts.overlays },
    cutDeg: opts.cutDeg ?? prev.cutDeg,
    mohr: prev.mohr,
  });
  const params = { ...base.params, ...opts.params };
  return {
    ...base,
    thetaDeg: opts.thetaDeg ?? 0,
    section: opts.section ?? base.section,
    params,
    // Slider ranges follow the constants the step starts from, not the preset's.
    tracks: opts.params ? tracksFor(base.classId, params) : base.tracks,
    custom: opts.params !== undefined,
    magnification: opts.magnification ?? base.magnification,
  };
}

export const withParam = (s: LabState, key: string, value: number): LabState => ({
  ...s,
  custom: true,
  params: { ...s.params, [key]: value },
});

export const withExperiment = (s: LabState, id: string): LabState => ({
  ...s,
  load: loadCaseFor(EXPERIMENTS.find((e) => e.id === id)!, s.scales),
});

/** Same boundary conditions, zero load: nothing to see until the prediction is made. */
export const unloaded = (s: LabState): LabState => ({ ...s, load: { ...s.load, value: [0, 0, 0] } });

/** γxy / εxx of the current response: the extension–shear coupling actually seen. */
export function shearPerStretch(strain: number[]): number {
  return strain[2] / strain[0];
}

/** θ (degrees) is the given angle modulo 180°, to within `tol` degrees. */
export const isAligned = (deg: number, target: number, tol = 0.5) => Math.abs(((((deg - target) % 180) + 270) % 180) - 90) < tol;

/** Angle between the principal stress and principal strain axes, degrees in [0, 90]; null if either is equi-biaxial. */
export function principalGap(d: LabDerived): number | null {
  const ps = stressPrincipal(d.response.stress);
  const pe = strainPrincipal(d.response.strain);
  if (ps.degenerate || pe.degenerate) return null;
  let g = ((((ps.angle - pe.angle) * 180) / Math.PI) % 180 + 180) % 180;
  if (g > 90) g = 180 - g;
  return g;
}

/** The state is a Kelvin mode: σ = λ ε (in Mandel form) for some λ, i.e. stress exactly proportional to strain. */
export function kelvinModulusOf(d: LabDerived): number | null {
  const e = d.response.strain;
  const s = d.response.stress;
  const eM = [e[0], e[1], e[2] / Math.SQRT2];
  const sM = [s[0], s[1], Math.SQRT2 * s[2]];
  const ee = eM.reduce((a, v) => a + v * v, 0);
  if (ee === 0) return null;
  const lambda = sM.reduce((a, v, k) => a + v * eM[k], 0) / ee;
  const res = Math.hypot(...sM.map((v, k) => v - lambda * eM[k]));
  return res <= 1e-6 * Math.hypot(...sM) ? lambda : null;
}
