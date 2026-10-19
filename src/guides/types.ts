// Guided experiences: scripts that drive the same lab state as the sandbox.
// Kept free of React so guides can be verified by tests.
//
// A step runs through up to five phases, in this order:
//   1. context  – what is on screen and what is fixed; never instructions
//   2. predict  – only a genuine prediction: answerable from the context and
//                 not yet visible on screen (a reveal patch can hold it back)
//   3. try      – instructions, unlocked controls and an auto-checked task
//   4. observe  – "what did you see?", asked once the task is done
//   5. explain
// A step leads with either predict or observe; questions are worded for the
// phase they are asked in.

import type { SnapTarget } from '../mechanics';
import type { LabDerived, LabState, SweepQuantity } from '../app/lab';

/**
 * Panels a step may show, besides the specimen and the guide rail. 'kelvin' (the
 * stiffness eigenmodes) and 'ladder' (the constraint ladder) are parts of the
 * principal and response panels that a step can hold back.
 */
export type PanelId = 'matrices' | 'loads' | 'directional' | 'sweep' | 'principal' | 'kelvin' | 'response' | 'ladder';

/** Controls a step unlocks in the guide rail during its try phase. */
export type GuideControl =
  | { kind: 'param'; key: string }
  | { kind: 'theta' }
  | { kind: 'mode' }
  | { kind: 'experiments' }
  /** The cut plane's normal (slider and the magenta ring handle). */
  | { kind: 'cut' }
  | { kind: 'section' }
  | { kind: 'preset'; ids: string[] };

export interface Question {
  question: string;
  /** Exactly one option is correct. */
  options: Array<{ text: string; correct?: boolean; feedback?: string }>;
}

export interface Prediction extends Question {
  /** Applied once the learner has answered, e.g. switching the load on, so the answer is not visible beforehand. */
  reveal?: (s: LabState) => LabState;
}

export interface Task {
  goal: string;
  check: (s: LabState, d: LabDerived) => boolean;
  /** Puts the lab into a state that satisfies `check` ("Show me"). */
  solve: (s: LabState) => LabState;
}

export interface TryPhase {
  /** Paragraphs; `$…$` is TeX, `**…**` is bold. */
  instructions: string[];
  controls?: GuideControl[];
  /** Panels that appear only once the try phase opens, because they would give the prediction away. */
  show?: PanelId[];
  task?: Task;
  /** Live values shown with the controls, as [TeX symbol, formatted value]. */
  readouts?: (s: LabState, d: LabDerived) => Array<[string, string]>;
  /** Extra snap points for this step's knobs, e.g. a value that zeroes one matrix entry. */
  extraSnaps?: (s: LabState) => Record<string, SnapTarget[]>;
}

export interface GuideStep {
  title: string;
  context: string[];
  /** Applied on entering the step (see runner.ts). Without it the step continues from the previous one's completed state. */
  setup?: (s: LabState) => LabState;
  show: PanelId[];
  /** Quantity the rotation-sweep panel starts on, when `show` includes 'sweep'. */
  sweep?: SweepQuantity;
  predict?: Prediction;
  try?: TryPhase;
  observe?: Question;
  explain?: string[];
}

/** Difficulty only; deliberately not tied to an audience. */
export type Track = 'Level 1' | 'Level 2' | 'Level 3';

export interface Guide {
  id: string;
  track: Track;
  /** The hook question. */
  title: string;
  summary: string;
  steps: GuideStep[];
}
