import type { LabState } from '../app/lab';
import type { Guide, GuideStep } from './types';

/**
 * The state a step is written for. Earlier steps are replayed as completed
 * (setup, revealed prediction, solved task), then this step's own setup is
 * applied, and its reveal too if its prediction is already answered.
 * Entering a step this way (Next, Back, jumping, Restart) never depends on what
 * the learner happened to do before.
 */
export function entryState(guide: Guide, k: number, start: LabState, answered: boolean): LabState {
  let s = start;
  for (let j = 0; j < k; j++) {
    const st = guide.steps[j];
    if (st.setup) s = st.setup(s);
    if (st.predict?.reveal) s = st.predict.reveal(s);
    if (st.try?.task) s = st.try.task.solve(s);
  }
  const step = guide.steps[k];
  if (step.setup) s = step.setup(s);
  if (answered && step.predict?.reveal) s = step.predict.reveal(s);
  return s;
}

export type Phase = 'predict' | 'try' | 'observe' | 'explain' | 'done';

/**
 * Which phase the learner has reached. `taskDone` means the try task is (or has
 * been) solved; a try phase without a task counts as done once it is shown.
 */
export function currentPhase(step: GuideStep, predicted: boolean, taskDone: boolean, observed: boolean): Phase {
  if (step.predict && !predicted) return 'predict';
  if (step.try?.task && !taskDone) return 'try';
  if (step.observe && !observed) return 'observe';
  return step.explain?.length ? 'explain' : 'done';
}
