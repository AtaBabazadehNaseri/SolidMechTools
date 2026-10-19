// Guided experiences: scripts that drive the same lab state as the sandbox.
// Kept free of React so guides can be verified by tests.

import type { SnapTarget } from '../mechanics';
import type { LabDerived, LabState } from '../app/lab';

/** Panels a step may show, besides the specimen and the guide rail. */
export type PanelId = 'matrices' | 'loads' | 'directional' | 'principal' | 'response';

/** Controls a step unlocks in the guide rail. */
export type GuideControl =
  | { kind: 'param'; key: string }
  | { kind: 'theta' }
  | { kind: 'mode' }
  | { kind: 'experiments' }
  /** The cut plane's normal (slider and the magenta ring handle). */
  | { kind: 'cut' }
  | { kind: 'section' };

export interface Prediction {
  question: string;
  /** Exactly one option is correct. */
  options: Array<{ text: string; correct?: boolean; feedback?: string }>;
  /** Applied once the learner has answered, e.g. switching the load on, so the answer is not visible beforehand. */
  reveal?: (s: LabState) => LabState;
}

export interface Task {
  goal: string;
  check: (s: LabState, d: LabDerived) => boolean;
  /** Puts the lab into a state that satisfies `check` ("Show me"). */
  solve: (s: LabState) => LabState;
  hint?: string;
}

export interface GuideStep {
  title: string;
  /** Paragraphs; `$…$` is TeX, `**…**` is bold. */
  body: string[];
  /** Applied on entering the step. Without it the step continues from the previous state. */
  setup?: (s: LabState) => LabState;
  show: PanelId[];
  controls?: GuideControl[];
  /** Asked before the controls appear, so the learner commits to an expectation first. */
  predict?: Prediction;
  task?: Task;
  /** Shown once the prediction is answered and the task (if any) is done. */
  explain?: string[];
  /** Extra snap points for this step's knobs, e.g. a value that zeroes one matrix entry. */
  extraSnaps?: (s: LabState) => Record<string, SnapTarget[]>;
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
