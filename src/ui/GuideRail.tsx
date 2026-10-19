import { type KnobSnaps, type PlaneMode, PRESETS, SECTIONS, type SectionId } from '../mechanics';
import { type Action, EXPERIMENTS, type LabDerived, type LabState, loadCaseFor } from '../app/lab';
import type { Guide, GuideStep, Question } from '../guides';
import { currentPhase } from '../guides/runner';
import { Knob } from './Knob';
import { RichText } from './RichText';
import { Tex } from './Tex';

export interface GuideRun {
  guideId: string;
  step: number;
  /** Chosen prediction option per step. */
  answers: Record<number, number>;
  /** Chosen observation option per step. */
  observed: Record<number, number>;
  /** Steps whose task has been completed at least once. */
  solved: Record<number, boolean>;
  /** Lab state when the guide was started; step states are rebuilt from it. */
  start: LabState;
}

interface Props {
  guide: Guide;
  run: GuideRun;
  state: LabState;
  derived: LabDerived;
  dispatch: (a: Action) => void;
  onAnswer: (option: number) => void;
  onObserve: (option: number) => void;
  onStep: (k: number) => void;
  onRestartStep: () => void;
  onShowMe: () => void;
  onExit: () => void;
  onFinish: () => void;
  onContinueInLab: () => void;
}

function mergeSnaps(base: KnobSnaps, extra: KnobSnaps['ticks'] | undefined, value: number): KnobSnaps {
  if (!extra?.length) return base;
  const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1e-12);
  const here = extra.find((t) => same(t.value, value));
  return {
    ticks: [...base.ticks, ...extra.filter((t) => t !== here)],
    active: here ? here.label : base.active,
  };
}

/** Whether a step has been worked through: every phase it has is answered or done. */
export function stepComplete(step: GuideStep, run: GuideRun, k: number): boolean {
  return ['explain', 'done'].includes(currentPhase(step, run.answers[k] !== undefined, !!run.solved[k], run.observed[k] !== undefined));
}

function Choices({ q, badge, chosen, onPick }: { q: Question; badge: string; chosen: number | undefined; onPick: (i: number) => void }) {
  const answered = chosen !== undefined;
  return (
    <div className={`question question-${badge.toLowerCase()}`}>
      <div className="question-q">
        <span className="badge">{badge}</span> <RichText text={q.question} />
      </div>
      {q.options.map((o, i) => {
        const mine = chosen === i;
        const cls = ['option', answered && o.correct ? 'correct' : '', mine && !o.correct ? 'wrong' : '', mine ? 'chosen' : ''].join(' ');
        return (
          <button key={i} className={cls} disabled={answered} onClick={() => onPick(i)}>
            <RichText text={o.text} />
            {mine && o.feedback && (
              <span className="feedback">
                <RichText text={o.feedback} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function GuideRail(p: Props) {
  const { guide, run, state, derived } = p;
  const step: GuideStep = guide.steps[run.step];
  const predicted = !step.predict || run.answers[run.step] !== undefined;
  const task = step.try?.task;
  const solvedNow = task ? task.check(state, derived) : true;
  const solved = solvedNow || !!run.solved[run.step];
  const phase = currentPhase(step, predicted, solved, run.observed[run.step] !== undefined);
  const tryOpen = !!step.try && predicted;
  const observeOpen = !!step.observe && predicted && solved;
  const finished = phase === 'explain' || phase === 'done';
  const last = run.step === guide.steps.length - 1;
  const extra = step.try?.extraSnaps?.(state);
  const nextLabel = finished ? (last ? 'Finish' : 'Next →') : phase === 'observe' ? (last ? 'Skip and finish' : 'Skip question →') : last ? 'Skip and finish' : 'Skip experiment →';

  return (
    <section className="panel guide-rail">
      <div className="guide-top">
        <span className={`track track-${guide.track.replace(' ', '-').toLowerCase()}`}>{guide.track}</span>
        <button className="mini" onClick={p.onExit} title="Back to the list of guides">
          All guides
        </button>
      </div>
      <h2 className="guide-title">{guide.title}</h2>
      <div className="step-dots" aria-label="Steps">
        {guide.steps.map((s, k) => (
          <button
            key={k}
            className={['dot', k === run.step ? 'on' : '', stepComplete(s, run, k) && (k < run.step || s.predict || s.try?.task || s.observe) ? 'done' : ''].join(' ')}
            onClick={() => p.onStep(k)}
            title={`${k + 1}. ${s.title}`}
          />
        ))}
      </div>

      <h3>
        {run.step + 1}. {step.title}
      </h3>
      {step.context.map((t, i) => (
        <p key={i}>
          <RichText text={t} />
        </p>
      ))}

      {step.predict && <Choices q={step.predict} badge="Predict" chosen={run.answers[run.step]} onPick={p.onAnswer} />}

      {tryOpen && step.try && (
        <div className="try">
          {step.try.instructions.map((t, i) => (
            <p key={i}>
              {i === 0 && <span className="badge">Try</span>} <RichText text={t} />
            </p>
          ))}
          {step.try.controls && (
            <div className="guide-controls">
              {step.try.controls.map((c, i) => {
                if (c.kind === 'param') {
                  const def = derived.cls.params.find((d) => d.key === c.key);
                  if (!def) return null;
                  return (
                    <Knob
                      key={i}
                      def={def}
                      value={state.params[c.key]}
                      interval={derived.intervals[c.key]}
                      track={state.tracks[c.key]}
                      snaps={mergeSnaps(derived.snaps[c.key], extra?.[c.key], state.params[c.key])}
                      onChange={(value) => p.dispatch({ type: 'param', key: c.key, value })}
                    />
                  );
                }
                if (c.kind === 'theta')
                  return (
                    <label key={i} className="field theta">
                      <span>Rotate the material θ (or drag the teal handle on the ring)</span>
                      <input type="range" min={-180} max={180} step={1} value={state.thetaDeg} onChange={(e) => p.dispatch({ type: 'theta', deg: Number(e.target.value) })} />
                      <span className="theta-value">{state.thetaDeg}°</span>
                    </label>
                  );
                if (c.kind === 'cut')
                  return (
                    <label key={i} className="field theta">
                      <span>Turn the cut: direction of its normal n (or drag the magenta handle on the ring)</span>
                      <input type="range" min={-180} max={180} step={1} value={state.cutDeg} onChange={(e) => p.dispatch({ type: 'cut', deg: Number(e.target.value) })} />
                      <span className="theta-value">{state.cutDeg}°</span>
                    </label>
                  );
                if (c.kind === 'section')
                  return (
                    <label key={i} className="field">
                      <span>Section plane</span>
                      <select value={state.section} onChange={(e) => p.dispatch({ type: 'section', section: e.target.value as SectionId })}>
                        {Object.values(SECTIONS).map((sec) => (
                          <option key={sec.id} value={sec.id}>
                            {sec.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                if (c.kind === 'mode')
                  return (
                    <div key={i} className="seg">
                      {(['stress', 'strain'] as PlaneMode[]).map((m) => (
                        <button key={m} className={state.mode === m ? 'on' : ''} onClick={() => p.dispatch({ type: 'mode', mode: m })}>
                          {m === 'stress' ? 'Plane stress' : 'Plane strain'}
                        </button>
                      ))}
                    </div>
                  );
                if (c.kind === 'preset')
                  return (
                    <div key={i} className="experiments">
                      {c.ids.map((id) => (
                        <button key={id} className={state.presetId === id && !state.custom ? 'chip on' : 'chip'} onClick={() => p.dispatch({ type: 'preset', id })}>
                          {PRESETS.find((x) => x.id === id)!.name}
                        </button>
                      ))}
                    </div>
                  );
                return (
                  <div key={i} className="experiments">
                    {EXPERIMENTS.map((e) => (
                      <button key={e.id} className="chip" title={e.hint} onClick={() => p.dispatch({ type: 'loadCase', load: loadCaseFor(e, state.scales) })}>
                        {e.name}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {step.try.readouts && (
            <div className="guide-readouts">
              {step.try.readouts(state, derived).map(([t, v]) => (
                <span key={t} className="pc-item">
                  <Tex>{t}</Tex> <span className="pc-v">{v}</span>
                </span>
              ))}
            </div>
          )}

          {task && (
            <div className={solvedNow ? 'task done' : 'task'}>
              <span className="badge">{solvedNow ? '✓ Done' : 'Task'}</span> <RichText text={task.goal} />
              {!solvedNow && (
                <button className="mini show-me" onClick={p.onShowMe}>
                  Show me
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {observeOpen && step.observe && <Choices q={step.observe} badge="Observe" chosen={run.observed[run.step]} onPick={p.onObserve} />}

      {finished && step.explain && (
        <div className="explain">
          {step.explain.map((t, i) => (
            <p key={i}>
              <RichText text={t} />
            </p>
          ))}
        </div>
      )}

      <div className="guide-nav">
        <button disabled={run.step === 0} onClick={() => p.onStep(run.step - 1)}>
          Back
        </button>
        <button className="mini" onClick={p.onRestartStep} title="Set this step up again">
          Restart step
        </button>
        <button className={finished ? 'primary' : ''} disabled={!predicted} title={predicted ? undefined : 'Answer the prediction first'} onClick={last ? p.onFinish : () => p.onStep(run.step + 1)}>
          {nextLabel}
        </button>
      </div>
      <button className="link" onClick={p.onContinueInLab}>
        Continue in the Lab from here →
      </button>
    </section>
  );
}

export function GuideLibrary({ guides, completed, onStart }: { guides: Guide[]; completed: Set<string>; onStart: (id: string) => void }) {
  return (
    <section className="guide-library">
      <h2>Guided experiences</h2>
      <p className="hint">
        Each step sets the scene, asks you to predict where a prediction is possible, lets you try it on the specimen, and then asks
        what you saw. The Lab stays available at any point, from the exact state you reach.
      </p>
      <div className="guide-cards">
        {guides.map((g) => (
          <article key={g.id} className="panel guide-card">
            <div className="guide-top">
              <span className={`track track-${g.track.replace(' ', '-').toLowerCase()}`}>{g.track}</span>
              {completed.has(g.id) && <span className="completed">✓ completed</span>}
            </div>
            <h3>{g.title}</h3>
            <p>{g.summary}</p>
            <div className="guide-card-foot">
              <span className="muted">{g.steps.length} steps</span>
              <button className="primary" onClick={() => onStart(g.id)}>
                {completed.has(g.id) ? 'Start again' : 'Start'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
