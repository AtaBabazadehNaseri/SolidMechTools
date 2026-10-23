import type { Control } from '../mechanics';
import { type Action, EXPERIMENTS, EXPERIMENTS3, type LabState, loadCase3For, loadCaseFor, niceRound } from '../app/lab';
import { COMP, COMP6, STRAIN6_TEX, STRAIN_TEX, STRESS6_TEX, STRESS_TEX, fmt } from '../app/format';
import { NumberField } from './NumberField';
import { Tex } from './Tex';

interface Props {
  state: LabState;
  dispatch: (a: Action) => void;
  /** In a guide, read-only until the step's prediction is answered. */
  locked?: boolean;
}

const sameLoad = (a: { control: readonly Control[]; value: readonly number[] }, b: { control: readonly Control[]; value: readonly number[] }) =>
  a.control.every((c, i) => c === b.control[i]) && a.value.every((v, i) => Math.abs(v - b.value[i]) <= 1e-12 * Math.max(1, Math.abs(v)));

const CONTROL_NAME: Record<Control, string> = { stress: 'Traction', strain: 'Displacement' };

interface RowsProps {
  labels: readonly string[];
  stressTex: readonly string[];
  strainTex: readonly string[];
  load: { control: readonly Control[]; value: readonly number[] };
  scales: LabState['scales'];
  onControl: (i: number, control: Control) => void;
  onValue: (i: number, value: number) => void;
}

/** One row per component: traction or displacement control, and the prescribed value. */
function LoadRows({ labels, stressTex, strainTex, load, scales, onControl, onValue }: RowsProps) {
  return (
    <>
        {labels.map((_, i) => {
          const isStress = load.control[i] === 'stress';
          const span = 3 * (isStress ? scales.stress : scales.strain);
          return (
            <div className="load-row" key={i}>
              <span className="comp">{labels[i]}</span>
              <div className="seg" role="radiogroup" aria-label={`control of the ${labels[i]} component`}>
                {(['stress', 'strain'] as Control[]).map((c) => (
                  <button
                    key={c}
                    className={load.control[i] === c ? 'on' : ''}
                    aria-pressed={load.control[i] === c}
                    onClick={() => onControl(i, c)}
                    title={c === 'stress' ? 'Prescribe the traction (stress) on the faces; the strain follows' : 'Prescribe the displacement (strain); the traction follows as a reaction'}
                  >
                    <span>{CONTROL_NAME[c]}</span>
                    <span className="seg-sub">
                      <Tex>{c === 'stress' ? stressTex[i] : strainTex[i]}</Tex> {c === 'stress' ? 'applied' : 'held'}
                    </span>
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={-span}
                max={span}
                step={span / 300}
                value={Math.min(Math.max(load.value[i], -span), span)}
                onChange={(e) => onValue(i, Number(e.target.value))}
                aria-label={`prescribed ${isStress ? 'stress' : 'strain'} ${labels[i]}`}
              />
              <NumberField
                value={isStress ? load.value[i] : load.value[i] * 1e3}
                unit={isStress ? 'MPa' : '×10⁻³'}
                label={`prescribed ${isStress ? 'stress' : 'strain'} ${labels[i]}`}
                onCommit={(v) => onValue(i, isStress ? v : v * 1e-3)}
              />
              <button className="mini" onClick={() => onValue(i, 0)} title="Set to zero">
                0
              </button>
            </div>
          );
        })}
    </>
  );
}

export function LoadPanel({ state, dispatch, locked = false }: Props) {
  const { load, scales } = state;

  return (
    <section className="panel load-panel">
      <fieldset className="plain" disabled={locked}>
      <div className="load-head">
        <h2>Boundary conditions</h2>
        <div className="experiments">
          {EXPERIMENTS.map((e) => {
            const on = sameLoad(load, loadCaseFor(e, scales));
            return (
              <button key={e.id} className={on ? 'chip on' : 'chip'} aria-pressed={on} title={e.hint} onClick={() => dispatch({ type: 'experiment', id: e.id })}>
                {e.name}
              </button>
            );
          })}
        </div>
      </div>

      <LoadRows
        labels={COMP}
        stressTex={STRESS_TEX}
        strainTex={STRAIN_TEX}
        load={load}
        scales={scales}
        onControl={(i, control) => dispatch({ type: 'control', i, control })}
        onValue={(i, value) => dispatch({ type: 'loadValue', i, value })}
      />
      <p className="hint">
        Idealized uniform boundary conditions on a homogeneous specimen: uniform face tractions produce a uniform stress equal to
        them, and prescribed face displacements produce a uniform strain. Real grips constrain only the ends.
      </p>
      </fieldset>
    </section>
  );
}

/** Boundary conditions of the 3D cube: all six components, each traction- or displacement-controlled. */
export function LoadPanel3D({ state, dispatch }: Props) {
  const { load3, scales } = state;
  return (
    <section className="panel load-panel">
      <div className="load-head">
        <h2>Boundary conditions (cube)</h2>
        <div className="experiments">
          {EXPERIMENTS3.map((e) => {
            const on = sameLoad(load3, loadCase3For(e, scales));
            return (
              <button key={e.id} className={on ? 'chip on' : 'chip'} aria-pressed={on} title={e.hint} onClick={() => dispatch({ type: 'loadCase3', load: loadCase3For(e, scales) })}>
                {e.name}
              </button>
            );
          })}
        </div>
      </div>
      <LoadRows
        labels={COMP6}
        stressTex={STRESS6_TEX}
        strainTex={STRAIN6_TEX}
        load={load3}
        scales={scales}
        onControl={(i, control) => dispatch({ type: 'control3', i, control })}
        onValue={(i, value) => dispatch({ type: 'loadValue3', i, value })}
      />
      <p className="hint">
        Each of the six components is either traction-controlled (its stress prescribed, 0 = traction-free) or displacement-controlled
        (its strain prescribed, 0 = held). Uniform conditions on a homogeneous cube, as in the 2D lab.
      </p>
    </section>
  );
}

/** Display magnification, kept beside the drawing it scales. */
export function MagnificationControl({ state, dispatch, maxStrain }: { state: LabState; dispatch: (a: Action) => void; maxStrain: number }) {
  return (
    <div className="mag-control">
      <span className="mag-label">Display magnification</span>
      <input
        type="range"
        min={0}
        max={5}
        step={0.01}
        value={Math.log10(state.magnification)}
        onChange={(e) => dispatch({ type: 'magnification', value: 10 ** Number(e.target.value) })}
        aria-label="display magnification"
      />
      <span className="load-value">×{fmt(state.magnification, 3)}</span>
      <button className="mini" onClick={() => dispatch({ type: 'magnification', value: niceRound(0.08 / Math.max(maxStrain, 1e-300)) })} title="Fit to the current strain">
        fit
      </button>
    </div>
  );
}
