import { useEffect, useMemo, useReducer, useState } from 'react';
import type { PlaneMode } from './mechanics';
import { type Overlays, type Selection, deriveLab, deriveMaterial, entryExperiment, initialState, reducer, snapshotOf } from './app/lab';
import { GUIDES, type PanelId } from './guides';
import { Specimen, SpecimenLegend } from './ui/Specimen';
import { MatrixGrid } from './ui/MatrixGrid';
import { EntryInfo } from './ui/EntryInfo';
import { MaterialPanel } from './ui/MaterialPanel';
import { LoadPanel, MagnificationControl } from './ui/LoadPanel';
import { MatrixLegend, PlaneConstantsStrip } from './ui/MatrixGrid';
import { Readouts } from './ui/Readouts';
import { PrincipalPanel } from './ui/PrincipalPanel';
import { DirectionalPanel } from './ui/DirectionalPanel';
import { Details } from './ui/Details';
import { GuideLibrary, GuideRail, type GuideRun } from './ui/GuideRail';

const MODES: Array<{ id: PlaneMode | '3d'; label: string }> = [
  { id: 'stress', label: '2D plane stress' },
  { id: 'strain', label: '2D plane strain' },
  { id: '3d', label: '3D (coming soon)' },
];

const OVERLAYS: Array<{ key: keyof Overlays; label: string; tip: string }> = [
  { key: 'materialAxes', label: 'Material axes', tip: 'Teal arrows: the material axes 1, 2, 3. They rotate with the material; the specimen axes x, y define the loading and the reported components.' },
  { key: 'materialLines', label: 'Material lines', tip: 'Lines along material axis 1, carried by the (magnified) deformation like the material itself.' },
  { key: 'principalStress', label: 'Principal stress', tip: 'Directions of the principal stresses; heads outward for tension, inward for compression.' },
  { key: 'principalStrain', label: 'Principal strain', tip: 'Directions of the principal strains (dashed); compare with the stress cross to see coaxiality.' },
  { key: 'cut', label: 'Cut plane', tip: 'A plane through the specimen and the traction t = σ·n acting on it. Drag the magenta handle on the ring.' },
];

const MODE_TIPS: Record<string, string> = {
  stress: 'Plane stress: σzz = τyz = τxz = 0 (a thin sheet). The out-of-plane strains are free and reported as responses.',
  strain: 'Plane strain: εzz = γyz = γxz = 0 (a long body held along z). The out-of-plane stresses are reactions.',
  '3d': 'The full 6×6 response of a cube.',
};

const ALL_PANELS: PanelId[] = ['matrices', 'loads', 'directional', 'principal', 'response'];

function omit<T>(o: Record<number, T>, k: number): Record<number, T> {
  return Object.fromEntries(Object.entries(o).filter(([key]) => Number(key) !== k));
}
const DONE_KEY = 'etl.completedGuides';

// Per-viewer convenience only; the app works without storage.
function loadCompleted(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}
function saveCompleted(s: Set<string>) {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...s]));
  } catch {
    /* storage unavailable */
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, 'iso-steel', (id: string) => initialState(id));
  const derived = useMemo(() => deriveLab(state), [state]);
  const material = useMemo(() => deriveMaterial(state.classId, state.params), [state.classId, state.params]);
  const { response, S2, C2 } = derived;

  const [view, setView] = useState<'lab' | 'guides'>('lab');
  const [run, setRun] = useState<GuideRun | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(loadCompleted);

  const guide = run ? GUIDES.find((g) => g.id === run.guideId)! : null;
  const step = guide && run ? guide.steps[run.step] : null;
  const inGuide = view === 'guides' && step !== null;

  // Remember a task as done once it has been solved, even if the learner keeps playing.
  useEffect(() => {
    if (run && step?.task && !run.solved[run.step] && step.task.check(state, derived))
      setRun({ ...run, solved: { ...run.solved, [run.step]: true } });
  }, [run, step, state, derived]);

  const goTo = (k: number, from = run) => {
    if (!guide || !from) return;
    const target = guide.steps[k];
    if (target.setup) dispatch({ type: 'replace', state: target.setup(state) });
    setRun({ ...from, step: k });
  };
  const startGuide = (id: string) => {
    const g = GUIDES.find((x) => x.id === id)!;
    const fresh: GuideRun = { guideId: id, step: 0, answers: {}, solved: {} };
    if (g.steps[0].setup) dispatch({ type: 'replace', state: g.steps[0].setup(state) });
    setRun(fresh);
    setView('guides');
  };
  const finishGuide = () => {
    if (!guide) return;
    const next = new Set(completed).add(guide.id);
    setCompleted(next);
    saveCompleted(next);
    setRun(null);
  };

  const show = new Set<PanelId>(inGuide ? step!.show : ALL_PANELS);
  // In a guide the directional plot is often the point of the step, so it sits beside the specimen.
  const directionalRight = inGuide && show.has('directional');
  const hasRight = show.has('principal') || show.has('response') || directionalRight;
  // A step's controls, including dragging the ring, unlock only after its prediction is answered.
  const answered = !inGuide || !step!.predict || run!.answers[run!.step] !== undefined;
  const thetaUnlocked = !inGuide || (answered && !!step!.controls?.some((c) => c.kind === 'theta'));
  const cutUnlocked = !inGuide || (answered && !!step!.controls?.some((c) => c.kind === 'cut'));

  const nonzero = (v: number, ref: number) => Math.abs(v) > 1e-12 * Math.max(ref, 1e-300);
  const sRef = Math.max(...response.stress.map(Math.abs));
  const eRef = Math.max(...response.strain.map(Math.abs));
  const select = (selection: Selection) => dispatch({ type: 'select', selection });

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Elasticity Tensor Lab</h1>
          <div className="seg view-switch" role="tablist" aria-label="View">
            <button className={view === 'lab' ? 'on' : ''} onClick={() => setView('lab')}>
              Lab
            </button>
            <button className={view === 'guides' ? 'on' : ''} onClick={() => setView('guides')}>
              Guides
            </button>
          </div>
        </div>
        {view === 'lab' && (
          <>
            <div className="seg mode-switch" role="radiogroup" aria-label="Analysis mode">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  className={state.mode === m.id ? 'on' : ''}
                  disabled={m.id === '3d'}
                  aria-pressed={state.mode === m.id}
                  onClick={() => m.id !== '3d' && dispatch({ type: 'mode', mode: m.id })}
                  title={MODE_TIPS[m.id]}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="top-actions">
              <button className="link" onClick={() => setView('guides')}>
                Not sure what to do? Try a guided experience →
              </button>
              {state.pinned ? (
                <>
                  <span className="pinned-label" title="The dashed ghost and the “was”/pinned values refer to this state">
                    Pinned: {state.pinned.label}
                  </span>
                  <button onClick={() => dispatch({ type: 'pin', snapshot: null })}>Clear comparison</button>
                </>
              ) : (
                <button onClick={() => dispatch({ type: 'pin', snapshot: snapshotOf(state, derived) })} title="Keep the current state as a dashed ghost and a comparison column">
                  Pin for comparison
                </button>
              )}
              <details className="menu">
                <summary>Reset ▾</summary>
                <div className="menu-items">
                  <button onClick={() => dispatch({ type: 'resetParams' })} title="Back to the example's constants; orientation and loading stay">
                    Material constants
                  </button>
                  <button onClick={() => dispatch({ type: 'resetLoad' })} title="Back to uniaxial stress">
                    Boundary conditions
                  </button>
                  <button onClick={() => dispatch({ type: 'theta', deg: 0 })}>Orientation (θ = 0)</button>
                  <button onClick={() => dispatch({ type: 'reset' })} title="Material, section, orientation, loading and magnification">
                    Everything
                  </button>
                </div>
              </details>
            </div>
          </>
        )}
      </header>
      <p className="small-screen-note">This lab is built for a laptop or desktop screen. It works here, but it is much easier to use on a larger display.</p>

      {view === 'guides' && !inGuide ? (
        <GuideLibrary guides={GUIDES} completed={completed} onStart={startGuide} />
      ) : (
        <main className={['layout', inGuide ? 'guide-layout' : '', hasRight ? '' : 'no-right', show.has('matrices') ? '' : 'no-band'].join(' ')}>
          <aside className="col-material">
            {inGuide ? (
              <GuideRail
                guide={guide!}
                run={run!}
                state={state}
                derived={derived}
                dispatch={dispatch}
                onAnswer={(option) => {
                  setRun({ ...run!, answers: { ...run!.answers, [run!.step]: option } });
                  const reveal = step!.predict?.reveal;
                  if (reveal) dispatch({ type: 'replace', state: reveal(state) });
                }}
                onStep={(k) => goTo(k)}
                onRestartStep={() => {
                  setRun({ ...run!, answers: omit(run!.answers, run!.step), solved: omit(run!.solved, run!.step) });
                  if (step!.setup) dispatch({ type: 'replace', state: step!.setup(state) });
                }}
                onShowMe={() => step!.task && dispatch({ type: 'replace', state: step!.task.solve(state) })}
                onExit={() => setRun(null)}
                onFinish={finishGuide}
                onContinueInLab={() => setView('lab')}
              />
            ) : (
              <MaterialPanel state={state} derived={derived} material={material} dispatch={dispatch} />
            )}
          </aside>

          {show.has('matrices') && (
            <section className="panel band">
              <div className="band-left">
              <div className="band-matrices">
                <MatrixGrid
                  id="C"
                  mode={state.mode}
                  M={C2}
                  pinned={state.pinned?.C2 ?? null}
                  activeCols={response.strain.map((v) => nonzero(v, eRef))}
                  selected={state.selected}
                  onSelect={select}
                />
                <MatrixGrid
                  id="S"
                  mode={state.mode}
                  M={S2}
                  pinned={state.pinned?.S2 ?? null}
                  activeCols={response.stress.map((v) => nonzero(v, sRef))}
                  selected={state.selected}
                  onSelect={select}
                />
              </div>
              <PlaneConstantsStrip c={derived.plane} mode={state.mode} />
              </div>
              <div className="band-info">
                <EntryInfo
                  selection={state.selected}
                  mode={state.mode}
                  S2={S2}
                  C2={C2}
                  onRun={() => state.selected && dispatch({ type: 'loadCase', load: entryExperiment(state.selected, state.scales) })}
                />
                <MatrixLegend />
              </div>
            </section>
          )}

          <div className="col-center">
            <section className="panel specimen-panel">
              {!inGuide && (
                <div className="overlay-bar">
                  {OVERLAYS.map((o) => (
                    <label key={o.key} className={`toggle toggle-${o.key}`} title={o.tip}>
                      <input type="checkbox" checked={state.overlays[o.key]} onChange={(e) => dispatch({ type: 'overlay', key: o.key, on: e.target.checked })} />
                      {o.label}
                    </label>
                  ))}
                </div>
              )}
              <SpecimenLegend cut={state.overlays.cut} />
              <Specimen
                strain={response.strain}
                stress={response.stress}
                control={state.load.control}
                mode={state.mode}
                outStress={derived.out.stress}
                pinnedStrain={state.pinned?.response.strain ?? null}
                magnification={state.magnification}
                R={derived.R}
                // An isotropic material has no preferred direction to draw lines along.
                overlays={{ ...state.overlays, materialLines: state.overlays.materialLines && state.classId !== 'isotropic' }}
                principal={derived.principal}
                thetaDeg={state.thetaDeg}
                onTheta={(deg) => thetaUnlocked && dispatch({ type: 'theta', deg })}
                cutDeg={state.cutDeg}
                onCut={(deg) => cutUnlocked && dispatch({ type: 'cut', deg })}
                stressRef={state.scales.stress}
              />
              <MagnificationControl state={state} dispatch={dispatch} maxStrain={Math.max(...response.strain.map(Math.abs))} />
            </section>
            {show.has('loads') && <LoadPanel state={state} dispatch={dispatch} />}
            {show.has('directional') && !directionalRight && <DirectionalPanel state={state} derived={derived} material={material} dispatch={dispatch} />}
          </div>

          {hasRight && (
            <div className="col-right">
              {directionalRight && <DirectionalPanel state={state} derived={derived} material={material} dispatch={dispatch} />}
              {show.has('response') && <Readouts state={state} derived={derived} dispatch={dispatch} />}
              {show.has('principal') && <PrincipalPanel state={state} derived={derived} dispatch={dispatch} />}
            </div>
          )}
        </main>
      )}

      {view === 'lab' && <Details state={state} derived={derived} material={material} mode={state.mode} />}
    </div>
  );
}
