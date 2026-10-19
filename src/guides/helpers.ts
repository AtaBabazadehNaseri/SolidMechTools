import type { SectionId } from '../mechanics';
import { EXPERIMENTS, type LabState, type Overlays, initialState, loadCaseFor } from '../app/lab';

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
  return {
    ...base,
    thetaDeg: opts.thetaDeg ?? 0,
    section: opts.section ?? base.section,
    params: { ...base.params, ...opts.params },
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
