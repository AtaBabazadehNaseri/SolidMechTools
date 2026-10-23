import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  type DirectionalQuantity,
  type Mat,
  compressibilityAlong,
  directionalExtremes,
  poissonAlong,
  rangePerpendicular,
  shearModulusAlong,
  youngAlong,
} from '../mechanics';
import { fmt, toGPa, toPerTPa } from '../app/format';
import { type Viewer, clearGroup, createViewer, cssColor } from './three/viewer';

interface Props {
  /** 3D compliance in specimen axes. */
  S6: Mat;
  /** Material → specimen rotation (columns: axes 1, 2, 3). */
  R: Mat;
}

interface QuantityDef {
  label: string;
  title: string;
  /** Heading words (uppercased by the panel style) and the symbol, kept apart so ν and β are not uppercased. */
  name: string;
  symbol: string;
  unit: string;
  show: (v: number) => number;
  /** A pair quantity: min and max over the second direction m ⟂ n. */
  pair: boolean;
  note: string;
}

const Q: Record<DirectionalQuantity, QuantityDef> = {
  E: {
    label: 'E',
    title: 'Young’s modulus E(n)',
    name: 'Young’s modulus',
    symbol: 'E(n)',
    unit: 'GPa',
    show: toGPa,
    pair: false,
    note: 'Uniaxial stress along n, every other stress zero: 1/E = (n⊗n) : S : (n⊗n). A sphere means E is the same in every direction, which is necessary but not sufficient for isotropy. The amber ring is the x–y slice, which is the 2D lab’s polar plot of E(φ) in plane stress.',
  },
  beta: {
    label: 'β',
    title: 'Linear compressibility β(n)',
    name: 'Linear compressibility',
    symbol: 'β(n)',
    unit: 'TPa⁻¹',
    show: toPerTPa,
    pair: false,
    note: 'Strain along n under hydrostatic pressure: β = (n⊗n) : S : I. Over any three orthogonal directions it sums to the volume compressibility 1/K. Negative β (orange) would mean the material extends along n when squeezed from all sides.',
  },
  G: {
    label: 'G',
    title: 'Shear modulus G(n, m)',
    name: 'Shear modulus',
    symbol: 'G(n, m)',
    unit: 'GPa',
    show: toGPa,
    pair: true,
    note: 'Shear stress on the plane with normal n, in a direction m within it. For each n the solid surface is the smallest G over m and the translucent one the largest.',
  },
  nu: {
    label: 'ν',
    title: 'Poisson’s ratio ν(n, m)',
    name: 'Poisson’s ratio',
    symbol: 'ν(n, m)',
    unit: '',
    show: (v) => v,
    pair: true,
    note: 'Lateral strain along m per axial strain along n, under uniaxial stress along n. For each n the solid surface is the smallest ν over m and the translucent one the largest; orange marks negative values (drawn at |ν|): directions in which the material is auxetic.',
  },
};

/** A unit direction to three decimals, largest component positive (n and −n are the same direction here). */
const vec = (n: number[]) => {
  const k = n.reduce((m, x, i) => (Math.abs(x) > Math.abs(n[m]) ? i : m), 0);
  const v = n[k] < 0 ? n.map((x) => -x) : n;
  return `(${v.map((x) => (Math.abs(x) < 5e-4 ? '0' : x.toFixed(3).replace('-', '−'))).join(', ')})`;
};

/** Values of a quantity at n: one number, or the min and max over m ⟂ n. */
function valuesAt(S: Mat, q: DirectionalQuantity, n: number[]): { lo: number; hi: number } {
  if (q === 'E') {
    const v = youngAlong(S, n);
    return { lo: v, hi: v };
  }
  if (q === 'beta') {
    const v = compressibilityAlong(S, n);
    return { lo: v, hi: v };
  }
  const r = rangePerpendicular(q === 'G' ? (a, b) => shearModulusAlong(S, a, b) : (a, b) => poissonAlong(S, a, b), n, 24);
  return { lo: r.min, hi: r.max };
}

/**
 * Directional properties over every direction n, as surfaces of radius
 * |value|/max|value|, coloured on one hue from smallest (light) to largest
 * (dark), with negative values in orange. Drawn in specimen axes, so they turn
 * with the material.
 */
export function Surface3D({ S6, R }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const group = useRef<THREE.Group | null>(null);
  const pickMesh = useRef<THREE.Mesh | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState<DirectionalQuantity>('E');
  const [hover, setHover] = useState<{ n: number[]; lo: number; hi: number } | null>(null);
  const ext = useMemo(() => directionalExtremes(S6, q), [S6, q]);
  const latest = useRef({ S6, R, ext, q });
  latest.current = { S6, R, ext, q };

  const draw = () => {
    const v = viewer.current;
    const g = group.current;
    if (!v || !g) return;
    const { S6: S, R: Rm, ext: e, q: qq } = latest.current;
    clearGroup(g);
    const def = Q[qq];
    const scale = Math.max(Math.abs(e.max.value), Math.abs(e.min.value));
    const lo = cssColor('--surface-lo');
    const hi = cssColor('--surface-hi');
    const neg = cssColor('--reaction');
    const posMax = Math.max(e.max.value, 1e-300);
    const negMin = Math.min(e.min.value, -1e-300);
    const paint = (c: THREE.Color, val: number) =>
      val >= 0
        ? c.copy(lo).lerp(hi, e.min.value >= 0 ? (val - e.min.value) / Math.max(posMax - e.min.value, 1e-12 * posMax) : val / posMax)
        : c.copy(lo).lerp(neg, 0.35 + 0.65 * (val / negMin));

    const segs = def.pair ? [72, 48] : [120, 80];
    // Evaluate every vertex direction once; both surfaces of a pair quantity share the result.
    const sphere = new THREE.SphereGeometry(1, segs[0], segs[1]);
    const unitPos = sphere.attributes.position;
    const los = new Float64Array(unitPos.count);
    const his = new Float64Array(unitPos.count);
    for (let i = 0; i < unitPos.count; i++) {
      const n = new THREE.Vector3(unitPos.getX(i), unitPos.getY(i), unitPos.getZ(i)).normalize();
      const r = valuesAt(S, qq, [n.x, n.y, n.z]);
      los[i] = r.lo;
      his[i] = r.hi;
    }
    const build = (which: 'lo' | 'hi', opacity: number) => {
      const geo = sphere.clone();
      const pos = geo.attributes.position;
      const colours = new Float32Array(pos.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const n = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
        const val = (which === 'lo' ? los : his)[i];
        n.multiplyScalar(Math.abs(val) / scale);
        pos.setXYZ(i, n.x, n.y, n.z);
        paint(c, val);
        colours.set([c.r, c.g, c.b], 3 * i);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: opacity < 1, opacity, depthWrite: opacity === 1, side: THREE.DoubleSide });
      return new THREE.Mesh(geo, mat);
    };
    const inner = build('lo', 1);
    sphere.dispose();
    g.add(inner);
    pickMesh.current = inner;
    if (def.pair) g.add(build('hi', 0.28));

    // E: the x–y slice is the 2D polar plot of E(φ) in plane stress.
    if (qq === 'E') {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 240; k++) {
        const phi = (2 * Math.PI * k) / 240;
        const n = [Math.cos(phi), Math.sin(phi), 0];
        const r = (youngAlong(S, n) / scale) * 1.004;
        pts.push(new THREE.Vector3(r * n[0], r * n[1], 0));
      }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: cssColor('--warn') })));
    }

    // Material axes, and the global extremes.
    for (let a = 0; a < 3; a++) {
      const d = new THREE.Vector3(Rm[0][a], Rm[1][a], Rm[2][a]);
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([d.clone().multiplyScalar(-1.2), d.clone().multiplyScalar(1.2)]), new THREE.LineBasicMaterial({ color: cssColor('--material') })));
      const l = v.label(String(a + 1), 'three-label material');
      l.position.copy(d.multiplyScalar(1.3));
      g.add(l);
    }
    for (const [x, name] of [
      [e.max, 'max'],
      [e.min, 'min'],
    ] as const) {
      const d = new THREE.Vector3(...(x.n as [number, number, number]));
      const r = Math.abs(x.value) / scale;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: cssColor('--text') }));
      dot.position.copy(d.clone().multiplyScalar(r * 1.01));
      g.add(dot);
      const l = v.label(name, 'three-label extreme');
      l.position.copy(d.multiplyScalar(r * 1.01 + 0.12));
      g.add(l);
    }
    v.render();
  };

  useEffect(() => {
    if (!host.current) return;
    let v: Viewer;
    try {
      v = createViewer(host.current, { distance: 5.2, onThemeChange: () => draw() });
    } catch {
      setFailed(true);
      return;
    }
    viewer.current = v;
    for (let a = 0; a < 3; a++) {
      const d = new THREE.Vector3(a === 0 ? 1 : 0, a === 1 ? 1 : 0, a === 2 ? 1 : 0);
      v.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), d.clone().multiplyScalar(1.35)]), new THREE.LineBasicMaterial({ color: cssColor('--faint') })));
      const l = v.label(['x', 'y', 'z'][a], 'three-label axis');
      l.position.copy(d.multiplyScalar(1.45));
      v.scene.add(l);
    }
    const g = new THREE.Group();
    v.scene.add(g);
    group.current = g;
    draw();

    // Hover: read the quantity along the pointed direction.
    const ray = new THREE.Raycaster();
    const el = host.current;
    const onMove = (ev: PointerEvent) => {
      if (!pickMesh.current) return;
      const box = el.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((ev.clientX - box.left) / box.width) * 2 - 1, -((ev.clientY - box.top) / box.height) * 2 + 1), v.camera);
      const hit = ray.intersectObject(pickMesh.current)[0];
      if (!hit) return setHover(null);
      const n = hit.point.clone().normalize();
      setHover({ n: [n.x, n.y, n.z], ...valuesAt(latest.current.S6, latest.current.q, [n.x, n.y, n.z]) });
    };
    const onLeave = () => setHover(null);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      v.dispose();
      viewer.current = null;
      group.current = null;
    };
    // The scene is built once; `draw` reads the latest props.
  }, []);

  useEffect(draw, [S6, R, ext, q]);

  const def = Q[q];
  const f = (x: number) => `${fmt(def.show(x), 4, 1e-12)}${def.unit ? ` ${def.unit}` : ''}`;
  return (
    <section className="panel surface3d">
      <div className="panel-head">
        <h2>
          {def.name} in every direction, <span className="h2-sym">{def.symbol}</span>
        </h2>
        <div className="seg small-seg" role="radiogroup" aria-label="Quantity">
          {(Object.keys(Q) as DirectionalQuantity[]).map((k) => (
            <button key={k} className={q === k ? 'on' : ''} aria-pressed={q === k} onClick={() => setQ(k)} title={Q[k].title}>
              {Q[k].label}
            </button>
          ))}
        </div>
      </div>
      {failed ? (
        <p className="hint">This browser could not start WebGL, which the 3D view needs.</p>
      ) : (
        <div ref={host} className="three-host" role="img" aria-label={`Surface of ${def.title} over all directions; drag to rotate`} />
      )}
      <div className="surface-scale" aria-hidden>
        <span>{f(ext.min.value)}</span>
        <span className={ext.min.value < 0 ? 'surface-ramp signed' : 'surface-ramp'} />
        <span>{f(ext.max.value)}</span>
      </div>
      <p className="surface-read">
        {hover ? (
          <>
            Along n = {vec(hover.n)}:{' '}
            <b>{def.pair ? `${def.label} from ${f(hover.lo)} to ${f(hover.hi)} over m ⟂ n` : `${def.label} = ${f(hover.lo)}`}</b>
          </>
        ) : (
          <span className="muted">Point at the surface to read the value along that direction. Drag to rotate.</span>
        )}
      </p>
      {Math.abs(ext.max.value - ext.min.value) <= 1e-6 * Math.max(Math.abs(ext.max.value), 1e-300) ? (
        <p className="surface-read">
          <b>
            {def.label} = {f(ext.max.value)} in every direction{def.pair ? ' and for every m' : ''}.
          </b>
        </p>
      ) : (
      <table className="aniso">
        <tbody>
          <tr>
            <th>Largest</th>
            <td>
              {f(ext.max.value)} along n = {vec(ext.max.n)}
              {ext.max.m && `, m = ${vec(ext.max.m)}`}
            </td>
          </tr>
          <tr>
            <th>Smallest</th>
            <td>
              {f(ext.min.value)} along n = {vec(ext.min.n)}
              {ext.min.m && `, m = ${vec(ext.min.m)}`}
            </td>
          </tr>
          {ext.min.value > 0 && (
            <tr>
              <th>Ratio</th>
              <td>{fmt(ext.max.value / ext.min.value, 4)}</td>
            </tr>
          )}
        </tbody>
      </table>
      )}
      <p className="hint">
        {def.note} Directions are in specimen axes x, y, z; the teal lines are the material axes.
      </p>
    </section>
  );
}
