import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type Mat,
  type MatrixKind,
  type PlaneClassId,
  type SectionId,
  type SymmetryClassId,
  IN_PLANE,
  PRESETS,
  ROUNDING_TOLERANCE,
  SECTIONS,
  SYMMETRY_CLASSES,
  axesFromVectors,
  axesOf,
  inverse,
  nearestRotation,
  submatrix,
} from '../mechanics';
import {
  type Dimension,
  type Entry,
  type Loadable,
  type OrderId,
  type Plane,
  type ShearConvention,
  type Unit,
  ENTRY_CLASSES,
  ORDER_LABEL,
  SHEAR_LABEL,
  UNITS,
  UNIT_MPA,
  analyze,
  fromStandard,
  parseMatrixText,
  stability,
  toLoadable,
} from '../app/ownMaterial';
import { fmt } from '../app/format';
import { Tex } from './Tex';

interface Props {
  onLoad: (l: Loadable) => void;
  onClose: () => void;
}

type OrientationMode = 'identity' | Exclude<SectionId, 'n3'> | 'vectors' | 'cosines';

const ORIENTATION_LABEL: Record<OrientationMode, string> = {
  identity: 'Axes 1, 2, 3 along x, y, z',
  n1: `Preset: ${SECTIONS.n1.label}`,
  n2: `Preset: ${SECTIONS.n2.label}`,
  n111: `Preset: ${SECTIONS.n111.label}`,
  vectors: 'Axis 1 and a vector in the 1–2 plane',
  cosines: 'Direction cosines of axes 1, 2, 3',
};

/** In-plane examples for the 2D classes (MPa): the presets' in-plane constants. */
const PLANE_EXAMPLES: Record<PlaneClassId, Record<string, number>> = {
  'plane-isotropic': { E1: 200_000, nu12: 0.3 },
  'plane-square': { E1: 70_690, nu12: 0.4138, G12: 75_000 },
  'plane-orthotropic': { E1: 180_000, E2: 10_000, nu12: 0.3, G12: 7_000 },
  'plane-anisotropic': { E1: 50_000, E2: 20_000, nu12: 0.25, G12: 10_000, eta12_1: 0.8, eta12_2: -0.3 },
};

const num = (v: number) => (Math.abs(v) < 1e-12 ? '0' : String(Number(v.toPrecision(6))));
const parseNum = (t: string) => Number(t.trim().replace(/−/g, '-'));
const pct = (d: number) => (d < 1e-12 ? 'exact' : `${fmt(100 * d, 2)} %`);
const unitLabel = (kind: MatrixKind, u: Unit) => (kind === 'stiffness' ? u : `1/${u}`);

function exampleMatrix(dim: Dimension, plane: Plane, kind: MatrixKind, order: OrderId, shear: ShearConvention, unit: Unit): string {
  const p = PRESETS.find((x) => x.id === (dim === 3 ? 'cub-3a' : 'ort-9b'))!;
  const S6 = SYMMETRY_CLASSES[p.classId].build(p.params);
  let S: Mat;
  if (dim === 3) S = S6;
  else {
    const Sps = submatrix(S6, IN_PLANE, IN_PLANE);
    S = plane === 'stress' ? Sps : inverse(submatrix(inverse(S6), IN_PLANE, IN_PLANE));
  }
  const M = kind === 'compliance' ? S : inverse(S);
  return fromStandard(M, { kind, order, shear, unit })
    .map((row) => row.map(num).join('\t'))
    .join('\n');
}

export function MaterialInput({ onLoad, onClose }: Props) {
  const [dim, setDim] = useState<Dimension>(3);
  const [form, setForm] = useState<'matrix' | 'constants'>('matrix');
  const [kind, setKind] = useState<MatrixKind>('stiffness');
  const [unit, setUnit] = useState<Unit>('GPa');
  const [order, setOrder] = useState<OrderId>('voigt');
  const [shear, setShear] = useState<ShearConvention>('engineering');
  const [plane, setPlane] = useState<Plane>('stress');
  const [text, setText] = useState('');
  const [classes, setClasses] = useState<Record<Dimension, SymmetryClassId>>({ 3: 'orthotropic', 2: 'plane-orthotropic' });
  const [values, setValues] = useState<Record<string, string>>({});
  const [oriMode, setOriMode] = useState<OrientationMode>('identity');
  const [a1, setA1] = useState(['1', '0', '0']);
  const [a12, setA12] = useState(['0', '1', '0']);
  const [dc, setDc] = useState([
    ['1', '0', '0'],
    ['0', '1', '0'],
    ['0', '0', '1'],
  ]);
  const [angle, setAngle] = useState('0');
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [chosen, setChosen] = useState<SymmetryClassId | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const classId = classes[dim];
  const cls = SYMMETRY_CLASSES[classId];
  const vkey = (k: string) => `${classId}.${k}`;

  const fillConstants = () => {
    const example = dim === 3 ? PRESETS.find((p) => p.classId === classId)!.params : PLANE_EXAMPLES[classId as PlaneClassId];
    setValues((v) => ({
      ...v,
      ...Object.fromEntries(cls.params.map((d) => [vkey(d.key), num(d.kind === 'modulus' ? example[d.key] / UNIT_MPA[unit] : example[d.key])])),
    }));
  };

  // The entry as typed so far: an Entry, or what is still missing.
  const entry = useMemo((): Entry | { error: string } => {
    if (form === 'matrix') {
      const parsed = parseMatrixText(text, dim === 3 ? 6 : 3);
      if ('error' in parsed) return parsed;
      return { definition: 'matrix', dimension: dim, plane, notation: { kind, order, shear, unit }, matrix: parsed.M };
    }
    const constants = Object.fromEntries(cls.params.map((d) => [d.key, parseNum(values[vkey(d.key)] ?? '')]));
    const missing = cls.params.filter((d) => !Number.isFinite(constants[d.key]) || (values[vkey(d.key)] ?? '').trim() === '');
    if (missing.length) return { error: `Enter ${missing.length === cls.params.length ? 'the constants' : `a value for ${missing.map((d) => d.key).join(', ')}`}, or fill them with an example.` };
    return { definition: 'constants', dimension: dim, plane, classId, constants, unit };
  }, [form, text, dim, plane, kind, order, shear, unit, values, classId, cls]);

  const analysis = useMemo(() => ('error' in entry ? null : analyze(entry)), [entry]);

  const orientation = useMemo((): { R: Mat; thetaDeg: number } | { error: string } => {
    const I: Mat = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    if (dim === 2) {
      const t = parseNum(angle);
      return Number.isFinite(t) ? { R: I, thetaDeg: t } : { error: 'The angle of axis 1 must be a number.' };
    }
    if (oriMode === 'identity') return { R: I, thetaDeg: 0 };
    if (oriMode === 'vectors') {
      const v1 = a1.map(parseNum) as [number, number, number];
      const v2 = a12.map(parseNum) as [number, number, number];
      if ([...v1, ...v2].some((v) => !Number.isFinite(v))) return { error: 'Each vector needs three numbers.' };
      const o = axesFromVectors(v1, v2);
      return 'error' in o ? o : { R: o.R, thetaDeg: 0 };
    }
    if (oriMode === 'cosines') {
      // Rows typed are axes; the rotation's columns are axes.
      const rows = dc.map((r) => r.map(parseNum));
      const o = nearestRotation([0, 1, 2].map((i) => rows.map((r) => r[i])));
      return 'error' in o ? o : { R: o.R, thetaDeg: 0 };
    }
    return { R: SECTIONS[oriMode].R, thetaDeg: 0 };
  }, [dim, angle, oriMode, a1, a12, dc]);

  const suggested = analysis?.suggested ?? null;
  const pick = chosen && analysis?.fits.some((f) => f.classId === chosen) ? chosen : suggested;
  const pickedFit = analysis?.fits.find((f) => f.classId === pick);
  const relabelled = pickedFit && pickedFit.relabel.some((row, i) => row.some((v, j) => Math.abs(v - (i === j ? 1 : 0)) > 1e-12));
  const errors = [...('error' in entry ? [entry.error] : []), ...(analysis?.errors ?? []), ...('error' in orientation ? [orientation.error] : [])];
  const ready = errors.length === 0 && analysis && pick && 'R' in orientation;

  const load = () => {
    if (!ready || 'error' in entry || !('R' in orientation)) return;
    onLoad(toLoadable(entry, analysis!, { classId: pick!, R: orientation.R, thetaDeg: orientation.thetaDeg, name, source }));
  };

  const stab = analysis?.S ? stability(analysis.S, 'compliance') : null;
  const seg = <T extends string | number>(value: T, set: (v: T) => void, opts: Array<[T, string]>) => (
    <div className="seg">
      {opts.map(([v, label]) => (
        <button key={String(v)} className={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => set(v)}>
          {label}
        </button>
      ))}
    </div>
  );
  const vec = (v: string[], set: (v: string[]) => void, label: string) => (
    <div className="vec-row">
      <span>{label}</span>
      {['x', 'y', 'z'].map((c, i) => (
        <input key={c} aria-label={`${label} ${c}`} value={v[i]} onChange={(e) => set(v.map((x, k) => (k === i ? e.target.value : x)))} />
      ))}
    </div>
  );

  // Rendered at the document root: inside the sticky material column the dialog would sit under later panels.
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel modal own-material" role="dialog" aria-modal="true" aria-label="Enter your own material">
        <div className="modal-head">
          <h2>Enter your own material</h2>
          <button className="mini" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="om-row">
          {seg(dim, (d) => (setDim(d), setChosen(null)), [
            [3, '3D material'],
            [2, '2D (in-plane) data'],
          ])}
          {seg(form, (f) => (setForm(f), setChosen(null)), [
            ['matrix', 'Matrix'],
            ['constants', 'Constants'],
          ])}
        </div>
        {dim === 2 && (
          <div className="om-row">
            <span className="om-label">The data describes</span>
            {seg(plane, setPlane, [
              ['stress', 'plane stress'],
              ['strain', 'plane strain'],
            ])}
            <p className="hint">
              2D data fixes only the in-plane behaviour. The Lab keeps this plane state, and greys out everything that needs the
              out-of-plane constants.
            </p>
          </div>
        )}

        {form === 'matrix' ? (
          <>
            <div className="om-grid">
              <div className="field">
                <span>Matrix</span>
                {seg(kind, setKind, [
                  ['stiffness', dim === 3 ? 'Stiffness C' : 'Stiffness C̄'],
                  ['compliance', dim === 3 ? 'Compliance S' : 'Compliance S̄'],
                ])}
              </div>
              <label className="field">
                <span>Units</span>
                <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {unitLabel(kind, u)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field">
                <span>Component order</span>
                {dim === 3 ? (
                  <select value={order} onChange={(e) => setOrder(e.target.value as OrderId)}>
                    {(Object.keys(ORDER_LABEL) as OrderId[]).map((o) => (
                      <option key={o} value={o}>
                        {ORDER_LABEL[o]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="om-fixed">11, 22, 12</span>
                )}
              </div>
              <label className="field">
                <span>Shear convention</span>
                <select value={shear} onChange={(e) => setShear(e.target.value as ShearConvention)}>
                  {(Object.keys(SHEAR_LABEL) as ShearConvention[]).map((s) => (
                    <option key={s} value={s}>
                      {SHEAR_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <textarea
              className="om-text"
              rows={dim === 3 ? 7 : 4}
              spellCheck={false}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Paste the ${dim === 3 ? '6×6' : '3×3'} matrix here, or its upper or lower triangle.`}
              aria-label="Matrix"
            />
            <div className="om-row">
              <button className="mini" onClick={() => setText(exampleMatrix(dim, plane, kind, order, shear, unit))}>
                Fill with an example ({dim === 3 ? 'the cubic crystal CUB-3A' : 'the fibre-composite lamina of ORT-9B'}, in the notation above)
              </button>
              <span className="hint">Numbers separated by spaces, tabs, commas or semicolons; lines starting with # are skipped.</span>
            </div>
            {kind === 'stiffness' && shear === 'tensor' && <p className="hint">For a stiffness, tensor components and engineering Voigt entries are the same numbers.</p>}
          </>
        ) : (
          <>
            <div className="om-grid">
              <label className="field">
                <span>Symmetry class</span>
                <select value={classId} onChange={(e) => setClasses((c) => ({ ...c, [dim]: e.target.value as SymmetryClassId }))}>
                  {ENTRY_CLASSES[dim].map((c) => (
                    <option key={c} value={c}>
                      {SYMMETRY_CLASSES[c].name} · {SYMMETRY_CLASSES[c].independentConstants}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Moduli in</span>
                <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="hint">{cls.convention} Poisson ratios: ν₁₂ = −ε₂/ε₁ under σ₁ alone (the loaded direction comes first).</p>
            <div className="om-constants">
              {cls.params.map((d) => (
                <label key={d.key} className="om-const" title={d.label}>
                  <Tex>{d.symbol}</Tex>
                  <input value={values[vkey(d.key)] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [vkey(d.key)]: e.target.value }))} aria-label={d.key} />
                  <span className="unit">{d.kind === 'modulus' ? unit : ''}</span>
                </label>
              ))}
            </div>
            <MinorPoisson keys={cls.params.map((d) => d.key)} value={(k) => parseNum(values[vkey(k)] ?? '')} />
            <button className="mini" onClick={fillConstants}>
              Fill with an example
            </button>
          </>
        )}

        <h3>Orientation</h3>
        {dim === 3 ? (
          <>
            <select value={oriMode} onChange={(e) => setOriMode(e.target.value as OrientationMode)} aria-label="Orientation">
              {(Object.keys(ORIENTATION_LABEL) as OrientationMode[]).map((m) => (
                <option key={m} value={m}>
                  {ORIENTATION_LABEL[m]}
                </option>
              ))}
            </select>
            {oriMode === 'vectors' && (
              <div className="om-vectors">
                {vec(a1, setA1, 'Axis 1')}
                {vec(a12, setA12, 'In the 1–2 plane')}
              </div>
            )}
            {oriMode === 'cosines' && (
              <div className="om-vectors">
                {dc.map((row, k) => vec(row, (r) => setDc(dc.map((x, i) => (i === k ? r : x))), `Axis ${k + 1}`))}
              </div>
            )}
            {'R' in orientation && oriMode !== 'identity' && (
              <p className="hint">
                {axesOf(orientation.R)
                  .map((a, k) => `axis ${k + 1} = (${a.map((v) => fmt(v, 3, 1e-9)).join(', ')})`)
                  .join(' · ')}
              </p>
            )}
            <p className="hint">Components in x, y, z, where x and y span the specimen plane. The θ slider rotates the material further about z.</p>
          </>
        ) : (
          <label className="field theta">
            <span>Axis 1 at an angle from x (degrees)</span>
            <input value={angle} onChange={(e) => setAngle(e.target.value)} aria-label="Angle of axis 1 from x" />
          </label>
        )}

        <div className="om-grid">
          <label className="field">
            <span>Name (optional)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your material" />
          </label>
          <label className="field">
            <span>Source (optional)</span>
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Reference, temperature, assumptions" />
          </label>
        </div>

        <div className="om-check" aria-live="polite">
          {errors.map((e) => (
            <p key={e} className="om-error">
              {e}
            </p>
          ))}
          {analysis?.notes.map((n) => (
            <p key={n} className="hint">
              {n}
            </p>
          ))}
          {errors.length === 0 && stab && (
            <p className="om-ok">
              ✓ Symmetric and stable: the smallest Kelvin modulus is {fmt(stab.minModulus / 1000, 4)} GPa (mode {stab.mode}).
            </p>
          )}
          {errors.length === 0 && analysis && analysis.fits.length > 0 && (
            <>
              <div className="om-fits-title">Symmetry, tested in your axes (distance to the nearest matrix of each class):</div>
              <div className="om-fits">
                {analysis.fits.map((f) => (
                  <label key={f.classId} className={f.classId === pick ? 'om-fit on' : 'om-fit'}>
                    <input type="radio" name="fit" checked={f.classId === pick} onChange={() => setChosen(f.classId)} />
                    {SYMMETRY_CLASSES[f.classId].name}
                    <span className="muted">{pct(f.distance)}</span>
                    {f.classId === suggested && <span className="om-tag">suggested</span>}
                  </label>
                ))}
              </div>
              {pickedFit && pickedFit.distance > 1e-12 && (
                <p className={pickedFit.distance > ROUNDING_TOLERANCE ? 'om-warn' : 'hint'}>
                  Loading as {SYMMETRY_CLASSES[pick!].name.toLowerCase()} replaces your matrix by its nearest member of that class (the
                  average over the class’s symmetry operations), {fmt(100 * pickedFit.distance, 2)} % away.
                  {pickedFit.distance > ROUNDING_TOLERANCE ? ' That is more than rounding: choose a lower class to keep your data.' : ''}
                </p>
              )}
              {relabelled && (
                <p className="hint">
                  Its distinguished axis is not your axis 3. The constants are named in the class convention (that axis becomes axis 3),
                  and the orientation is adjusted so that the specimen sees exactly the same material.
                </p>
              )}
            </>
          )}
        </div>

        <div className="modal-foot">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!ready} onClick={load}>
            Load into the Lab
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

/** Reciprocal (minor) Poisson ratios ν_ji = ν_ij E_j / E_i, shown so the convention can be checked against a datasheet. */
function MinorPoisson({ keys, value }: { keys: string[]; value: (k: string) => number }) {
  const items: string[] = [];
  for (const [i, j] of [
    [1, 2],
    [1, 3],
    [2, 3],
  ]) {
    const nu = `nu${i}${j}`;
    if (!keys.includes(nu) || !keys.includes(`E${i}`)) continue;
    const Ej = keys.includes(`E${j}`) ? value(`E${j}`) : value(`E${i}`);
    const v = (value(nu) * Ej) / value(`E${i}`);
    if (Number.isFinite(v) && Ej !== value(`E${i}`)) items.push(`ν${'₀₁₂₃'[j]}${'₀₁₂₃'[i]} = ${fmt(v, 4)}`);
  }
  return items.length ? <p className="hint">Minor Poisson ratios that follow: {items.join(', ')}. Datasheets sometimes quote these instead.</p> : null;
}
