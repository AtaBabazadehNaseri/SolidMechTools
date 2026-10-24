import { useMemo } from 'react';
import { type Action, type LabDerived, type LabState, type MaterialDerived, type Overlays, type View3, cut3Of, entryExperiment3 } from '../app/lab';
import { fmt } from '../app/format';
import { MaterialPanel } from './MaterialPanel';
import { BandHead, MatrixGrid, MatrixLegend, SolidConstantsStrip } from './MatrixGrid';
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
  matricesOpen: boolean;
  onToggleMatrices: () => void;
}

const VIEW: Array<{ key: keyof View3; label: string; tip: string }> = [
  { key: 'perspective', label: 'Perspective', tip: 'Perspective projection; off gives a parallel (orthographic) projection, in which parallel edges stay parallel. Applies to both 3D views.' },
  { key: 'section', label: '2D section (x–y plane)', tip: 'The x–y mid-plane of the cube: the plane the 2D lab cuts' },
];

// The same overlays as the 2D specimen, with the same colours and state.
const OVERLAYS: Array<{ key: keyof Overlays; label: string; tip: string }> = [
  { key: 'materialAxes', label: 'Material axes', tip: 'Teal arrows: the material axes 1, 2, 3, carried by the (magnified) deformation. Also drawn in the surface view.' },
  { key: 'materialLines', label: 'Material lines', tip: 'Straight lines along material axis 1 (all three cube axes for a cubic material) through the cube, carried by the deformation.' },
  { key: 'principalStress', label: 'Principal stress', tip: 'The three principal stress directions, with lengths in proportion to the values; heads outward for tension, inward for compression.' },
  { key: 'principalStrain', label: 'Principal strain', tip: 'The three principal strain directions (dashed); compare with the stress axes to see coaxiality.' },
  { key: 'cut', label: 'Cut plane', tip: 'A plane through the centre of the cube, its normal n and the traction t = σ·n on it; also a point on the Mohr circles.' },
];

/** Material axes along which lines are drawn: none for an isotropic material, all equivalent axes for cubic and tetragonal. */
function lineAxesFor(classId: LabState['classId']): number[] {
  if (classId === 'isotropic') return [];
  if (classId === 'cubic') return [0, 1, 2];
  if (classId === 'tetragonal') return [0, 1];
  return [0];
}

/** The 3D mode: the cube specimen with all six components, the full C and S, and E(n). */
export function Lab3D({ state, derived, material, dispatch, matricesOpen, onToggleMatrices }: Props) {
  const { response, principalStress, principalStrain } = derived.solid;
  const ref = (v: number[]) => Math.max(...v.map(Math.abs), 1e-300);
  const nonzero = (v: number, r: number) => Math.abs(v) > 1e-12 * r;
  const select = (selection: NonNullable<LabState['selected']>) => dispatch({ type: 'select', selection });
  const lineAxes = useMemo(() => lineAxesFor(state.classId), [state.classId]);
  const cut = useMemo(
    () => (state.overlays.cut ? cut3Of(response.stress, response.strain, state.cut3Deg) : null),
    [state.overlays.cut, response.stress, response.strain, state.cut3Deg],
  );
  const [az, el] = state.cut3Deg;
  const sTol = 1e-9 * ref(response.stress);

  return (
    <main className="layout lab3d">
      <aside className="col-material">
        <MaterialPanel state={state} derived={derived} material={material} dispatch={dispatch} />
      </aside>

      {/* On top: the cube and, beside it when three columns fit, the directional surface (above it when not). */}
      <div className="cube-area">
        <section className="panel specimen-panel">
          <div className="overlay-bar">
            {OVERLAYS.map((o) => (
              <label key={o.key} className={`toggle toggle-${o.key}`} title={o.tip}>
                <input type="checkbox" checked={state.overlays[o.key]} onChange={(e) => dispatch({ type: 'overlay', key: o.key, on: e.target.checked })} />
                {o.label}
              </label>
            ))}
          </div>
          <div className="section-row">
            {VIEW.map((o) => (
              <label key={o.key} className={`toggle toggle-${o.key}`} title={o.tip}>
                <input type="checkbox" checked={state.view3[o.key]} onChange={(e) => dispatch({ type: 'view3', key: o.key, on: e.target.checked })} />
                {o.label}
              </label>
            ))}
            <button className="link" onClick={() => dispatch({ type: 'space', space: '2d' })}>
              Open this section in 2D →
            </button>
          </div>
          {cut && (
            <div className="cut3-controls">
              <span>Normal azimuth</span>
              <input type="range" min={-180} max={180} step={1} value={az} onChange={(e) => dispatch({ type: 'cut3', deg: [Number(e.target.value), el] })} aria-label="Azimuth of the cut normal from x" />
              <span className="theta-value">{az}°</span>
              <span>Normal elevation</span>
              <input type="range" min={-90} max={90} step={1} value={el} onChange={(e) => dispatch({ type: 'cut3', deg: [az, Number(e.target.value)] })} aria-label="Elevation of the cut normal towards z" />
              <span className="theta-value">{el}°</span>
              <span className="cut3-read">
                n = ({cut.n.map((x) => fmt(x, 3, 1e-9)).join(', ')}) · t = σ·n = ({cut.traction.map((x) => fmt(x, 4, sTol)).join(', ')}) MPa · σn ={' '}
                {fmt(cut.normal, 4, sTol)}, |τ| = {fmt(cut.shear, 4, sTol)} MPa
              </span>
            </div>
          )}
          <Specimen3D
            section={state.view3.section}
            perspective={state.view3.perspective}
            overlays={state.overlays}
            lineAxes={lineAxes}
            principalStress={principalStress}
            principalStrain={principalStrain}
            cut={cut}
            stress={response.stress}
            strain={response.strain}
            control={state.load3.control}
            R={derived.R}
            magnification={state.magnification}
            stressRef={state.scales.stress}
          />
          <MagnificationControl state={state} dispatch={dispatch} maxStrain={ref(response.strain)} />
          {state.view3.section && (
            <p className="hint">
              The 2D lab works on this mid-plane. Plane stress leaves the faces normal to z free (σzz = τyz = τxz = 0); plane strain
              holds them (εzz = γyz = γxz = 0), which is the cube’s “Plane strain” test.
            </p>
          )}
        </section>
      </div>
      <div className="surface-area">
        <Surface3D S6={derived.S6} R={derived.R} perspective={state.view3.perspective} materialAxes={state.overlays.materialAxes} />
      </div>

      <div className="col-center">
        <LoadPanel3D state={state} dispatch={dispatch} />
        {/* The cube's response sits under its boundary conditions. */}
        <Readouts3D state={state} derived={derived} />
      </div>

      <div className="col-right">
        <Principal3DPanel derived={derived} cut={cut} />
        <Kelvin3DPanel state={state} derived={derived} dispatch={dispatch} />
      </div>

      {/* The 6×6 matrices close the page; they can be folded away. */}
      <section className={matricesOpen ? 'panel band' : 'panel band folded'}>
        <BandHead open={matricesOpen} onToggle={onToggleMatrices} label="Stiffness C and compliance S (6×6)" />
        {matricesOpen && (
          <>
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
          </>
        )}
      </section>
    </main>
  );
}
