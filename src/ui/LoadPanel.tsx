import type { Control } from '../mechanics';
import { type Action, EXPERIMENTS, type LabState, loadCaseFor, niceRound } from '../app/lab';
import { COMP, STRAIN_TEX, STRESS_TEX, fmt } from '../app/format';
import { NumberField } from './NumberField';
import { Tex } from './Tex';

interface Props {
  state: LabState;
  dispatch: (a: Action) => void;
  /** In a guide, read-only until the step's prediction is answered. */
  locked?: boolean;
}

const sameLoad = (a: LabState['load'], b: LabState['load']) =>
  a.control.every((c, i) => c === b.control[i]) && a.value.every((v, i) => Math.abs(v - b.value[i]) <= 1e-12 * Math.max(1, Math.abs(v)));

const CONTROL_NAME: Record<Control, string> = { stress: 'Traction', strain: 'Displacement' };

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

      {[0, 1, 2].map((i) => {
        const isStress = load.control[i] === 'stress';
        const span = 3 * (isStress ? scales.stress : scales.strain);
        return (
          <div className="load-row" key={i}>
            <span className="comp">{COMP[i]}</span>
            <div className="seg" role="radiogroup" aria-label={`control of the ${COMP[i]} component`}>
              {(['stress', 'strain'] as Control[]).map((c) => (
                <button
                  key={c}
                  className={load.control[i] === c ? 'on' : ''}
                  aria-pressed={load.control[i] === c}
                  onClick={() => dispatch({ type: 'control', i, control: c })}
                  title={c === 'stress' ? 'Prescribe the traction (stress) on the faces; the strain follows' : 'Prescribe the displacement (strain); the traction follows as a reaction'}
                >
                  <span>{CONTROL_NAME[c]}</span>
                  <span className="seg-sub">
                    <Tex>{c === 'stress' ? STRESS_TEX[i] : STRAIN_TEX[i]}</Tex> {c === 'stress' ? 'applied' : 'held'}
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
              onChange={(e) => dispatch({ type: 'loadValue', i, value: Number(e.target.value) })}
              aria-label={`prescribed ${isStress ? 'stress' : 'strain'} ${COMP[i]}`}
            />
            <NumberField
              value={isStress ? load.value[i] : load.value[i] * 1e3}
              unit={isStress ? 'MPa' : '×10⁻³'}
              label={`prescribed ${isStress ? 'stress' : 'strain'} ${COMP[i]}`}
              onCommit={(v) => dispatch({ type: 'loadValue', i, value: isStress ? v : v * 1e-3 })}
            />
            <button className="mini" onClick={() => dispatch({ type: 'loadValue', i, value: 0 })} title="Set to zero">
              0
            </button>
          </div>
        );
      })}
      <p className="hint">
        Idealized uniform boundary conditions on a homogeneous specimen: uniform face tractions produce a uniform stress equal to
        them, and prescribed face displacements produce a uniform strain. Real grips constrain only the ends.
      </p>
      </fieldset>
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
