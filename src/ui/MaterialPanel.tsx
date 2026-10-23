import { useState } from 'react';
import { type EffectiveSymmetry, IN_PLANE, PRESETS, SECTIONS, SYMMETRY_CLASSES, SYMMETRY_ELEMENTS, type SectionId, type SymmetryClassId } from '../mechanics';
import { type Action, type LabDerived, type LabState, type MaterialDerived, presetOf } from '../app/lab';
import { documentOf, encodeFragment } from '../app/share';
import { Knob } from './Knob';
import { MaterialInput } from './MaterialInput';

interface Props {
  state: LabState;
  derived: LabDerived;
  material: MaterialDerived;
  dispatch: (a: Action) => void;
}

const CLASS_ORDER: SymmetryClassId[] = ['isotropic', 'cubic', 'hexagonal', 'tetragonal', 'trigonal', 'orthotropic', 'monoclinic', 'triclinic'];
const V6 = ['11', '22', '33', '23', '13', '12'];

export function symmetryName(s: EffectiveSymmetry): string {
  const ax = s.axis === null ? '' : ` about axis ${s.axis + 1}`;
  if (s.classId === 'hexagonal') return `transversely isotropic${ax}`;
  if (SYMMETRY_CLASSES[s.classId].dimension === 2) return `${SYMMETRY_CLASSES[s.classId].name.replace(' (2D', ' in plane (2D').toLowerCase()}`;
  return `${SYMMETRY_CLASSES[s.classId].name.toLowerCase()}${ax}`;
}

export function MaterialPanel({ state, derived, material, dispatch }: Props) {
  const preset = presetOf(state);
  const cls = derived.cls;
  const plane = cls.dimension === 2;
  const [entering, setEntering] = useState(false);
  const user = state.userPreset;
  const raised = material.symmetry.classId !== cls.id;
  const groups = {
    'in-plane': cls.params.filter((d) => derived.effects[d.key] === 'in-plane'),
    'out-of-plane': cls.params.filter((d) => derived.effects[d.key] === 'out-of-plane'),
    none: cls.params.filter((d) => derived.effects[d.key] === 'none'),
  };
  const modeName = state.mode === 'stress' ? 'plane stress' : 'plane strain';
  const knob = (key: string) => (
    <Knob
      key={key}
      def={cls.params.find((p) => p.key === key)!}
      value={state.params[key]}
      interval={derived.intervals[key]}
      track={state.tracks[key]}
      snaps={derived.snaps[key]}
      onChange={(value) => dispatch({ type: 'param', key, value })}
    />
  );

  return (
    <section className="panel material-panel">
      <h2>Material</h2>
      <div className="own-row">
        <button className="primary" onClick={() => setEntering(true)} title="Paste a C or S matrix, or enter constants, in 3D or as 2D data">
          Enter your own material…
        </button>
        <ShareLink state={state} />
      </div>
      {entering && (
        <MaterialInput
          onClose={() => setEntering(false)}
          onLoad={(l) => {
            dispatch({ type: 'loadMaterial', preset: l.preset, thetaDeg: l.thetaDeg });
            setEntering(false);
          }}
        />
      )}
      {plane ? (
        <div className="field">
          <span>Elastic symmetry class</span>
          <div className="plane-data">
            <b>{cls.name}</b>: in-plane data for {state.mode === 'stress' ? 'plane stress' : 'plane strain'}. Out-of-plane results need 3D
            constants and are not shown; the mode is fixed.
          </div>
        </div>
      ) : (
      <label className="field">
        <span>Elastic symmetry class</span>
        <select className="class-select" value={state.classId} onChange={(e) => dispatch({ type: 'symmetryClass', classId: e.target.value as SymmetryClassId })}>
          {CLASS_ORDER.map((c) => (
            <option key={c} value={c}>
              {SYMMETRY_CLASSES[c].name} · {SYMMETRY_CLASSES[c].independentConstants}
            </option>
          ))}
        </select>
      </label>
      )}
      <label className="field">
        <span>Material</span>
        <select
          className="preset-select"
          value={state.custom ? 'custom' : state.presetId}
          onChange={(e) => dispatch(e.target.value === 'custom' ? { type: 'custom' } : { type: 'preset', id: e.target.value })}
        >
          {user && user.classId === state.classId && <option value="user">{user.name === 'Your material' ? user.name : `Your material: ${user.name}`}</option>}
          {PRESETS.filter((p) => p.classId === state.classId).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.illustrative ? ' (illustrative)' : ''}
            </option>
          ))}
          <option value="custom">Custom{state.custom ? ` (from ${preset.name})` : ''}</option>
        </select>
      </label>
      <div className="class-line">
        <b>{cls.name}</b> <span className="count">{cls.independentConstants}</span> independent constants
      </div>
      {raised && <div className="raised">Current constants are effectively {symmetryName(material.symmetry)}.</div>}

      <details className="about">
        <summary>About {state.custom ? 'the starting material' : 'this material'}</summary>
        <p>{preset.blurb}</p>
        <p className="source">{preset.source}</p>
        {state.custom && <p className="hint">Constants have been changed; “Reset preset” returns to {preset.name}.</p>}
      </details>

      <SymmetryBox state={state} material={material} />

      {!plane && (
        <label className="field">
          <span>Section plane</span>
          <select value={state.section} onChange={(e) => dispatch({ type: 'section', section: e.target.value as SectionId | 'custom' })}>
            {Object.values(SECTIONS).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
            {state.customR && <option value="custom">Your orientation (as entered)</option>}
          </select>
        </label>
      )}

      <label className="field theta">
        <span>In-plane rotation θ (or drag the teal handle on the ring)</span>
        <input type="range" min={-180} max={180} step={1} value={state.thetaDeg} onChange={(e) => dispatch({ type: 'theta', deg: Number(e.target.value) })} />
        <span className="theta-value">{state.thetaDeg}°</span>
        <button className="mini" onClick={() => dispatch({ type: 'theta', deg: 0 })}>
          0
        </button>
      </label>

      <h3>Engineering constants (material axes)</h3>
      <details className="about">
        <summary>How the knobs work</summary>
        <p className="hint">
          Each knob holds the other constants fixed. The light band is the exact admissible range (positive-definite stiffness);
          ticks are snap points such as “= E₁” or “isotropic in the 1–2 plane”. The matrices are read-only consequences.
        </p>
      </details>
      {groups['in-plane'].map((d) => knob(d.key))}
      {!cls.params.some((d) => d.key === 'eta12_1' || d.key === 'eta12_2') && (
        <p className="hint coupling-note">
          No extension–shear coupling knob (η) for this class: by symmetry η₁₂,₁ = η₁₂,₂ = 0 in its own axes.{' '}
          {cls.id === 'isotropic'
            ? 'An isotropic material never couples stretch to shear, at any angle.'
            : 'Rotate the material (θ) to see the apparent coupling ηxy,x in the specimen axes, shown under the matrices.'}{' '}
          Monoclinic and triclinic materials have the coupling built in as a constant.
        </p>
      )}

      {groups['out-of-plane'].length > 0 && (
        <details>
          <summary>
            Out-of-plane effect only ({groups['out-of-plane'].length}): {state.mode === 'stress' ? 'εzz, γyz, γxz' : 'σzz, τyz, τxz'}
          </summary>
          {groups['out-of-plane'].map((d) => knob(d.key))}
        </details>
      )}
      {groups.none.length > 0 && (
        <details>
          <summary>
            No effect in {modeName} ({groups.none.length}): they only bound the admissible ranges
          </summary>
          {groups.none.map((d) => knob(d.key))}
        </details>
      )}
    </section>
  );
}

function SymmetryBox({ state, material }: { state: LabState; material: MaterialDerived }) {
  const cls = SYMMETRY_CLASSES[state.classId];
  // 2D data: only the in-plane block exists.
  const idx: number[] = cls.dimension === 2 ? [...IN_PLANE] : [0, 1, 2, 3, 4, 5];
  return (
    <details className="symmetry">
      <summary>Symmetry</summary>
      <ul className="elements">
        {SYMMETRY_ELEMENTS[cls.id].map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      <p className="convention">{cls.convention}</p>
      <div className="pattern-title">Compliance pattern in material axes</div>
      <table className="pattern">
        <thead>
          <tr>
            <th />
            {idx.map((k) => (
              <th key={k}>{V6[k]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {idx.map((i) => (
            <tr key={i}>
              <th>{V6[i]}</th>
              {idx.map((j) => material.pattern[i][j]).map((c, j) => (
                <td key={j} className={`pc-${c.kind}`}>
                  {c.kind === 'zero' ? '·' : c.kind === 'free' ? '●' : `${c.negative ? '−' : ''}${c.group}`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">● independent · zero · letters mark entries tied in magnitude (− = opposite sign). Relations such as S₆₆ = 2(S₁₁ − S₁₂) appear as ●.</p>
      <p className="hint">
        With the current constants the material is <b>{symmetryName(material.symmetry)}</b>, tested by invariance under each
        class’s generating rotations about the material axes.
      </p>
    </details>
  );
}

/** Copies a link that reopens the Lab with this material, its orientation, θ and mode (docs/material-format.md). */
function ShareLink({ state }: { state: LabState }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async () => {
    const url = `${location.origin}${location.pathname}#${encodeFragment(documentOf(state))}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied('Link copied');
    } catch {
      window.prompt('Copy this link:', url);
      setCopied(null);
    }
    window.setTimeout(() => setCopied(null), 2500);
  };
  return (
    <button className="mini" onClick={copy} title="Copy a link that opens the Lab with this material, its orientation, θ and mode">
      {copied ?? 'Share link'}
    </button>
  );
}
