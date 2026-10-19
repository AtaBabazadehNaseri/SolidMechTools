import { type KnobSnaps, type PlaneMode, SECTIONS, type SectionId } from '../mechanics';
import { type Action, EXPERIMENTS, type LabDerived, type LabState, loadCaseFor } from '../app/lab';
import type { Guide, GuideStep } from '../guides';
import { Knob } from './Knob';
import { RichText } from './RichText';

export interface GuideRun {
  guideId: string;
  step: number;
  /** Chosen option per step. */
  answers: Record<number, number>;
  /** Steps whose task has been completed at least once. */
  solved: Record<number, boolean>;
}

interface Props {
  guide: Guide;
  run: GuideRun;
  state: LabState;
  derived: LabDerived;
  dispatch: (a: Action) => void;
  onAnswer: (option: number) => void;
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

export function GuideRail(p: Props) {
  const { guide, run, state, derived } = p;
  const step: GuideStep = guide.steps[run.step];
  const answered = step.predict ? run.answers[run.step] !== undefined : true;
  const solvedNow = step.task ? step.task.check(state, derived) : true;
  const solved = solvedNow || !!run.solved[run.step];
  const last = run.step === guide.steps.length - 1;
  const extra = step.extraSnaps?.(state);

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
            className={['dot', k === run.step ? 'on' : '', run.solved[k] || (k < run.step && !guide.steps[k].task) ? 'done' : ''].join(' ')}
            onClick={() => p.onStep(k)}
            title={`${k + 1}. ${s.title}`}
          />
        ))}
      </div>

      <h3>
        {run.step + 1}. {step.title}
      </h3>
      {step.body.map((t, i) => (
        <p key={i}>
          <RichText text={t} />
        </p>
      ))}

      {step.predict && (
        <div className="predict">
          <div className="predict-q">
            <span className="badge">Predict</span> <RichText text={step.predict.question} />
          </div>
          {step.predict.options.map((o, i) => {
            const chosen = run.answers[run.step] === i;
            const cls = ['option', answered && o.correct ? 'correct' : '', chosen && !o.correct ? 'wrong' : '', chosen ? 'chosen' : ''].join(' ');
            return (
              <button key={i} className={cls} disabled={answered} onClick={() => p.onAnswer(i)}>
                <RichText text={o.text} />
                {chosen && o.feedback && (
                  <span className="feedback">
                    <RichText text={o.feedback} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {answered && step.controls && (
        <div className="guide-controls">
          {step.controls.map((c, i) => {
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

      {answered && step.task && (
        <div className={solvedNow ? 'task done' : 'task'}>
          <span className="badge">{solvedNow ? '✓ Done' : 'Try'}</span> <RichText text={step.task.goal} />
          {!solvedNow && (
            <button className="mini show-me" onClick={p.onShowMe}>
              Show me
            </button>
          )}
        </div>
      )}

      {answered && solved && step.explain && (
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
        {last ? (
          <button className={solved ? 'primary' : ''} disabled={!answered} onClick={p.onFinish}>
            {solved ? 'Finish' : 'Skip and finish'}
          </button>
        ) : (
          <button className={solved ? 'primary' : ''} disabled={!answered} onClick={() => p.onStep(run.step + 1)}>
            {solved ? 'Next →' : 'Skip experiment →'}
          </button>
        )}
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
        Each guide asks you to predict, then to try it on the specimen. The Lab stays available at any point, from the exact state
        you reach.
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
