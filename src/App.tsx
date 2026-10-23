import { Suspense, lazy, useEffect, useMemo, useReducer, useState } from 'react';
import type { PlaneMode } from './mechanics';
import { type LabState, type Overlays, type Selection, deriveLab, deriveMaterial, entryExperiment, initialState, reducer, snapshotOf } from './app/lab';
import { decodeFragment } from './app/share';
import { GUIDES, type PanelId } from './guides';
import { entryState } from './guides/runner';
import { Specimen, SpecimenLegend } from './ui/Specimen';
import { MatrixGrid } from './ui/MatrixGrid';
import { EntryInfo } from './ui/EntryInfo';
import { MaterialPanel } from './ui/MaterialPanel';
import { LoadPanel, MagnificationControl } from './ui/LoadPanel';
import { MatrixLegend, PlaneConstantsStrip } from './ui/MatrixGrid';
import { Readouts } from './ui/Readouts';
import { PrincipalPanel } from './ui/PrincipalPanel';
import { DirectionalPanel, RotationSweep } from './ui/DirectionalPanel';
import { Details } from './ui/Details';
import { GuideLibrary, GuideRail, type GuideRun } from './ui/GuideRail';
import { type ThemePreference, useTheme } from './ui/theme';
// three.js is only needed for the 3D mode, so it is loaded the first time 3D is opened.
const Lab3D = lazy(() => import('./ui/Lab3D').then((m) => ({ default: m.Lab3D })));

const THEMES: Array<{ id: ThemePreference; label: string; tip: string }> = [
  { id: 'system', label: 'Auto', tip: 'Follow the system setting' },
  { id: 'light', label: 'Light', tip: 'Always light' },
  { id: 'dark', label: 'Dark', tip: 'Always dark' },
];

const MODES: Array<{ id: PlaneMode | '3d'; label: string }> = [
  { id: 'stress', label: '2D plane stress' },
  { id: 'strain', label: '2D plane strain' },
  { id: '3d', label: '3D' },
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
  '3d': 'The full 3D response of a cube: all six stress components, each traction- or displacement-controlled.',
};

// The Lab shows everything; the rotation sweep sits inside the directional panel there.
const ALL_PANELS: PanelId[] = ['matrices', 'loads', 'directional', 'principal', 'kelvin', 'response', 'ladder'];

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

/** A material carried by the URL (a share link), or the default example. */
function startState(): { state: LabState; message: string | null } {
  const fallback = initialState('iso-steel');
  const read = typeof location === 'undefined' ? null : decodeFragment(location.hash);
  if (!read) return { state: fallback, message: null };
  if ('error' in read) return { state: fallback, message: `The link could not be opened: ${read.error}` };
  const state = { ...reducer(fallback, { type: 'loadMaterial', preset: read.loadable.preset, thetaDeg: read.loadable.thetaDeg }), mode: read.mode };
  return { state, message: read.notes.length ? read.notes.join(' ') : null };
}

export default function App() {
  const [start] = useState(startState);
  const [state, dispatch] = useReducer(reducer, start.state);
  const [linkMessage, setLinkMessage] = useState(start.message);
  const [theme, setTheme] = useTheme();
  const derived = useMemo(() => deriveLab(state), [state]);
  const material = useMemo(() => deriveMaterial(state.classId, state.params), [state.classId, state.params]);
  const { response, S2, C2 } = derived;
  // 2D data: one plane state, no out-of-plane behaviour.
  const planeData = derived.cls.dimension === 2;

  const [view, setView] = useState<'lab' | 'guides'>('lab');
  const [run, setRun] = useState<GuideRun | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(loadCompleted);

  const guide = run ? GUIDES.find((g) => g.id === run.guideId)! : null;
  const step = guide && run ? guide.steps[run.step] : null;
  const inGuide = view === 'guides' && step !== null;

  // Remember a task as done once it has been solved, even if the learner keeps playing. Only after the
  // prediction: before it, the state is often deliberately unloaded and may satisfy a check trivially.
  useEffect(() => {
    const predictedHere = run && (!step?.predict || run.answers[run.step] !== undefined);
    if (run && predictedHere && step?.try?.task && !run.solved[run.step] && step.try.task.check(state, derived))
      setRun({ ...run, solved: { ...run.solved, [run.step]: true } });
  }, [run, step, state, derived]);

  // Every way into a step (Next, Back, the step dots, Restart) rebuilds the state that step is written for.
  const goTo = (k: number, from = run) => {
    if (!guide || !from) return;
    dispatch({ type: 'replace', state: entryState(guide, k, from.start, from.answers[k] !== undefined) });
    setRun({ ...from, step: k });
  };
  const startGuide = (id: string) => {
    const g = GUIDES.find((x) => x.id === id)!;
    // Guides run on the 2D lab.
    const start = { ...state, space: '2d' as const };
    const fresh: GuideRun = { guideId: id, step: 0, answers: {}, observed: {}, solved: {}, start };
    dispatch({ type: 'replace', state: entryState(g, 0, start, false) });
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

  // Nothing on screen may change, or give the answer away, before a step's prediction is answered.
  const predicted = !inGuide || !step!.predict || run!.answers[run!.step] !== undefined;
  const show = new Set<PanelId>(inGuide ? [...step!.show, ...(predicted ? (step!.try?.show ?? []) : [])] : ALL_PANELS);
  // In a guide the directional plot is often the point of the step, so it sits beside the specimen.
  const directionalRight = inGuide && show.has('directional');
  const sweepPanel = inGuide && show.has('sweep');
  const hasRight = show.has('principal') || show.has('kelvin') || show.has('response') || directionalRight || sweepPanel;
  const unlocked = (kind: 'theta' | 'cut') => !inGuide || (predicted && !!step!.try?.controls?.some((c) => c.kind === kind));
  const thetaUnlocked = unlocked('theta');
  const cutUnlocked = unlocked('cut');

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
          <div className="seg small-seg theme-switch" role="radiogroup" aria-label="Theme">
            {THEMES.map((th) => (
              <button key={th.id} className={theme === th.id ? 'on' : ''} aria-pressed={theme === th.id} title={th.tip} onClick={() => setTheme(th.id)}>
                {th.label}
              </button>
            ))}
          </div>
        </div>
        {view === 'lab' && (
          <>
            <div className="seg mode-switch" role="radiogroup" aria-label="Analysis mode">
              {MODES.map((m) => {
                const current = state.space === '3d' ? '3d' : state.mode;
                const blocked = planeData && m.id !== state.mode;
                return (
                <button
                  key={m.id}
                  className={current === m.id ? 'on' : ''}
                  disabled={blocked}
                  aria-pressed={current === m.id}
                  onClick={() => {
                    if (m.id === '3d') return dispatch({ type: 'space', space: '3d' });
                    dispatch({ type: 'space', space: '2d' });
                    dispatch({ type: 'mode', mode: m.id });
                  }}
                  title={
                    blocked
                      ? m.id === '3d'
                        ? 'This material was entered as 2D data, which has no 3D behaviour; enter it in 3D to use the cube.'
                        : 'This material was entered as 2D data for the other plane state; this one needs its out-of-plane constants.'
                      : MODE_TIPS[m.id]
                  }
                >
                  {m.label}
                </button>
                );
              })}
            </div>
            <div className="top-actions">
              <button className="link" onClick={() => setView('guides')}>
                Not sure what to do? Try a guided experience →
              </button>
              {state.space === '3d' ? null : state.pinned ? (
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
      {linkMessage && (
        <p className="link-message" role="status">
          {linkMessage}{' '}
          <button className="mini" onClick={() => setLinkMessage(null)}>
            Dismiss
          </button>
        </p>
      )}
      <p className="small-screen-note">This lab is built for a laptop or desktop screen. It works here, but it is much easier to use on a larger display.</p>

      {view === 'guides' && !inGuide ? (
        <GuideLibrary guides={GUIDES} completed={completed} onStart={startGuide} />
      ) : !inGuide && state.space === '3d' ? (
        <Suspense fallback={<p className="hint">Loading the 3D view…</p>}>
          <Lab3D state={state} derived={derived} material={material} dispatch={dispatch} />
        </Suspense>
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
                onObserve={(option) => setRun({ ...run!, observed: { ...run!.observed, [run!.step]: option } })}
                onStep={(k) => goTo(k)}
                onRestartStep={() => {
                  setRun({ ...run!, answers: omit(run!.answers, run!.step), observed: omit(run!.observed, run!.step), solved: omit(run!.solved, run!.step) });
                  dispatch({ type: 'replace', state: entryState(guide!, run!.step, run!.start, false) });
                }}
                onShowMe={() => step!.try?.task && dispatch({ type: 'replace', state: step!.try.task.solve(state) })}
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
                  planeData={planeData}
                />
                <MatrixGrid
                  id="S"
                  mode={state.mode}
                  M={S2}
                  pinned={state.pinned?.S2 ?? null}
                  activeCols={response.stress.map((v) => nonzero(v, sRef))}
                  selected={state.selected}
                  onSelect={select}
                  planeData={planeData}
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
                  planeData={planeData}
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
                outStress={planeData ? null : derived.out.stress}
                pinnedStrain={state.pinned?.response.strain ?? null}
                magnification={state.magnification}
                R={derived.R}
                // An isotropic material has no preferred direction to draw lines along.
                overlays={{ ...state.overlays, materialLines: state.overlays.materialLines && state.classId !== 'isotropic' && state.classId !== 'plane-isotropic' }}
                principal={derived.principal}
                thetaDeg={state.thetaDeg}
                onTheta={(deg) => thetaUnlocked && dispatch({ type: 'theta', deg })}
                cutDeg={state.cutDeg}
                onCut={(deg) => cutUnlocked && dispatch({ type: 'cut', deg })}
                stressRef={state.scales.stress}
                lineAxes={
                  state.classId === 'cubic' || state.classId === 'tetragonal' || state.classId === 'plane-square'
                    ? [0, 1, 2].filter((k) => Math.hypot(derived.R[0][k], derived.R[1][k]) > 0.9)
                    : [0]
                }
              />
              <MagnificationControl state={state} dispatch={dispatch} maxStrain={Math.max(...response.strain.map(Math.abs))} />
            </section>
            {show.has('loads') && <LoadPanel state={state} dispatch={dispatch} locked={!predicted} />}
            {show.has('directional') && !directionalRight && <DirectionalPanel state={state} derived={derived} material={material} dispatch={dispatch} />}
          </div>

          {hasRight && (
            <div className="col-right">
              {sweepPanel && (
                <RotationSweep
                  key={`${run!.guideId}-${run!.step}`}
                  state={state}
                  onTheta={thetaUnlocked ? (deg) => dispatch({ type: 'theta', deg }) : undefined}
                  initial={step!.sweep}
                  panel
                />
              )}
              {directionalRight && <DirectionalPanel state={state} derived={derived} material={material} dispatch={dispatch} sweep={false} />}
              {show.has('response') && <Readouts state={state} derived={derived} dispatch={dispatch} ladder={show.has('ladder')} />}
              {(show.has('principal') || show.has('kelvin')) && (
                <PrincipalPanel state={state} derived={derived} dispatch={dispatch} axes={show.has('principal')} kelvin={show.has('kelvin')} locked={!predicted} />
              )}
            </div>
          )}
        </main>
      )}

      {view === 'lab' && <Details state={state} derived={derived} material={material} mode={state.mode} />}
    </div>
  );
}
