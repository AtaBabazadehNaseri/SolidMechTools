import { useState } from 'react';
import { type Action, type LabDerived, type LabState, type MaterialDerived, entryExperiment3 } from '../app/lab';
import { MaterialPanel } from './MaterialPanel';
import { MatrixGrid, MatrixLegend, SolidConstantsStrip } from './MatrixGrid';
import { EntryInfo3D } from './EntryInfo3D';
import { Specimen3D } from './Specimen3D';
import { LoadPanel3D, MagnificationControl } from './LoadPanel';
import { Surface3D } from './Surface3D';
import { Readouts3D } from './Readouts3D';
import { Principal3DPanel } from './Principal3DPanel';
import { Kelvin3DPanel } from './Kelvin3DPanel';

interface Props {
  state: LabState;
  derived: LabDerived;
  material: MaterialDerived;
  dispatch: (a: Action) => void;
}

/** The 3D mode: the cube specimen with all six components, the full C and S, and E(n). */
export function Lab3D({ state, derived, material, dispatch }: Props) {
  const { response } = derived.solid;
  const ref = (v: number[]) => Math.max(...v.map(Math.abs), 1e-300);
  const nonzero = (v: number, r: number) => Math.abs(v) > 1e-12 * r;
  const select = (selection: NonNullable<LabState['selected']>) => dispatch({ type: 'select', selection });
  const [section, setSection] = useState(true);

  return (
    <main className="layout lab3d">
      <aside className="col-material">
        <MaterialPanel state={state} derived={derived} material={material} dispatch={dispatch} />
      </aside>

      <section className="panel band">
        <div className="band-left">
          <div className="band-matrices">
            <MatrixGrid
              id="C"
              mode={state.mode}
              M={derived.C6}
              pinned={null}
              activeCols={response.strain.map((v) => nonzero(v, ref(response.strain)))}
              selected={state.selected}
              onSelect={select}
            />
            <MatrixGrid
              id="S"
              mode={state.mode}
              M={derived.S6}
              pinned={null}
              activeCols={response.stress.map((v) => nonzero(v, ref(response.stress)))}
              selected={state.selected}
              onSelect={select}
            />
          </div>
          <SolidConstantsStrip S6={derived.S6} />
        </div>
        <div className="band-info">
          <EntryInfo3D
            selection={state.selected}
            S6={derived.S6}
            C6={derived.C6}
            onRun={() => state.selected && dispatch({ type: 'loadCase3', load: entryExperiment3(state.selected, state.scales) })}
          />
          <MatrixLegend />
        </div>
      </section>

      <div className="col-center">
        <section className="panel specimen-panel">
          <div className="section-row">
            <label className="toggle toggle-section" title="The x–y mid-plane of the cube: the plane the 2D lab cuts">
              <input type="checkbox" checked={section} onChange={(e) => setSection(e.target.checked)} />
              2D section (x–y plane)
            </label>
            <button className="link" onClick={() => dispatch({ type: 'space', space: '2d' })}>
              Open this section in 2D →
            </button>
          </div>
          <Specimen3D
            section={section}
            stress={response.stress}
            strain={response.strain}
            control={state.load3.control}
            R={derived.R}
            magnification={state.magnification}
            stressRef={state.scales.stress}
          />
          <MagnificationControl state={state} dispatch={dispatch} maxStrain={ref(response.strain)} />
          {section && (
            <p className="hint">
              The 2D lab works on this mid-plane. Plane stress leaves the faces normal to z free (σzz = τyz = τxz = 0); plane strain
              holds them (εzz = γyz = γxz = 0), which is the cube’s “Plane strain” test.
            </p>
          )}
        </section>
        <LoadPanel3D state={state} dispatch={dispatch} />
      </div>

      <div className="col-right">
        <Surface3D S6={derived.S6} R={derived.R} />
        <Readouts3D state={state} derived={derived} />
        <Principal3DPanel derived={derived} />
        <Kelvin3DPanel state={state} derived={derived} dispatch={dispatch} />
      </div>
    </main>
  );
}
