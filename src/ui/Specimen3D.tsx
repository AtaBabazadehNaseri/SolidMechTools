import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { type Control, type Mat, type Principal3D, strainTensor, stressTensor } from '../mechanics';
import type { Cut3, Overlays } from '../app/lab';
import { fmt } from '../app/format';
import { type Viewer, arrow, clearGroup, createViewer, cssColor } from './three/viewer';
import { KEYS_HINT, ViewButtons } from './ViewButtons';

interface Props {
  stress: number[];
  strain: number[];
  control: readonly Control[];
  /** Material → specimen rotation (columns: axes 1, 2, 3). */
  R: Mat;
  magnification: number;
  stressRef: number;
  /** Show the x–y mid-plane: the section the 2D lab takes. */
  section: boolean;
  perspective: boolean;
  overlays: Overlays;
  /** Material axes whose lines are drawn; empty for an isotropic material. */
  lineAxes: number[];
  principalStress: Principal3D;
  principalStrain: Principal3D;
  /** The cut plane and its traction, when shown. */
  cut: Cut3 | null;
}

/** Voigt slot of tensor component (i, j). */
const SLOT = [
  [0, 5, 4],
  [5, 1, 3],
  [4, 3, 2],
];
const AXES = ['x', 'y', 'z'];
/** Traction arrows: this length (cube edge = 1) per reference stress, capped. */
const ARROW_PER_REF = 0.42;

type V3 = [number, number, number];

/** Two unit vectors perpendicular to n and to each other. */
function perpendicular(n: V3): [V3, V3] {
  const a: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = new THREE.Vector3(...n).cross(new THREE.Vector3(...a)).normalize();
  const v = new THREE.Vector3(...n).cross(u).normalize();
  return [u.toArray() as V3, v.toArray() as V3];
}

/** The part of the line p + t d inside the reference cube [−½, ½]³, as a parameter interval. */
function clipToCube(p: V3, d: V3): [number, number] | null {
  let t0 = -Infinity;
  let t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (Math.abs(p[i]) > 0.5) return null;
      continue;
    }
    const a = (-0.5 - p[i]) / d[i];
    const b = (0.5 - p[i]) / d[i];
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  return t1 - t0 > 0.05 ? [t0, t1] : null;
}

/** The polygon where the plane n·X = 0 cuts the reference cube, in order around n. */
function cubeSection(n: V3): V3[] {
  const pts: V3[] = [];
  const s = [-0.5, 0.5];
  for (let axis = 0; axis < 3; axis++)
    for (const b of s)
      for (const c of s) {
        // The edge along `axis` at the other two coordinates (b, c).
        const [i, j] = [0, 1, 2].filter((k) => k !== axis);
        if (Math.abs(n[axis]) < 1e-12) continue;
        const t = -(n[i] * b + n[j] * c) / n[axis];
        if (Math.abs(t) > 0.5 + 1e-12) continue;
        const q: V3 = [0, 0, 0];
        q[axis] = t;
        q[i] = b;
        q[j] = c;
        if (!pts.some((x) => Math.hypot(x[0] - q[0], x[1] - q[1], x[2] - q[2]) < 1e-9)) pts.push(q);
      }
  const [u, v] = perpendicular(n);
  const ang = (q: V3) => Math.atan2(q[0] * v[0] + q[1] * v[1] + q[2] * v[2], q[0] * u[0] + q[1] * u[1] + q[2] * u[2]);
  return pts.sort((a, b) => ang(a) - ang(b));
}

/**
 * A principal axis through the centre with a head at each end: pointing out for a positive principal value
 * (tension), in for a negative one. Dashed for strain, as in 2D.
 */
function principalAxis(d: THREE.Vector3, len: number, outward: boolean, color: THREE.Color, dashed: boolean): THREE.Group {
  const g = new THREE.Group();
  const head = Math.min(0.08, 0.4 * len);
  const r = dashed ? 0.007 : 0.011;
  const ends = [d.clone().multiplyScalar(len), d.clone().multiplyScalar(-len)];
  if (dashed) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ends), new THREE.LineDashedMaterial({ color, dashSize: 0.04, gapSize: 0.03 }));
    line.computeLineDistances();
    g.add(line);
  } else {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 2 * len, 10), new THREE.MeshLambertMaterial({ color }));
    cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    g.add(cyl);
  }
  for (const end of ends) {
    const out = end.clone().normalize();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 3.2, head, 14), new THREE.MeshLambertMaterial({ color }));
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward ? out : out.clone().negate());
    cone.position.copy(end.clone().sub(out.clone().multiplyScalar(outward ? head / 2 : -head / 2)));
    g.add(cone);
  }
  return g;
}

/**
 * The 3D specimen: a unit cube in specimen axes, drawn through the magnified
 * small-strain map x = X + k ε X (symmetric strain only, no rigid rotation),
 * with face tractions split into their normal and shear components. Blue
 * components are prescribed tractions; orange ones are reactions of held
 * displacements. Things attached to the material (the cube, its section, the
 * material axes and lines, the cut) go through the map; tensor directions
 * (principal axes, the cut normal and traction) are drawn as they are.
 */
export function Specimen3D(p: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const groups = useRef<{ dynamic: THREE.Group } | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef(p);
  latest.current = p;

  const maxStrain = Math.max(...p.strain.map(Math.abs), 1e-300);
  // Keep the drawing from folding over itself.
  const k = Math.min(p.magnification, 0.25 / maxStrain);

  const draw = () => {
    const v = viewer.current;
    const g = groups.current;
    if (!v || !g) return;
    const { stress, strain, control, R, stressRef, section, overlays: ov, lineAxes, principalStress, principalStrain, cut } = latest.current;
    clearGroup(g.dynamic);
    const eps = strainTensor(strain);
    const F = new THREE.Matrix3().set(
      1 + k * eps[0][0], k * eps[0][1], k * eps[0][2],
      k * eps[1][0], 1 + k * eps[1][1], k * eps[1][2],
      k * eps[2][0], k * eps[2][1], 1 + k * eps[2][2],
    );
    const map = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix3(F);

    // Deformed cube.
    const box = new THREE.BoxGeometry(1, 1, 1);
    const pos = box.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const q = map(pos.getX(i), pos.getY(i), pos.getZ(i));
      pos.setXYZ(i, q.x, q.y, q.z);
    }
    box.computeVertexNormals();
    const face = new THREE.Mesh(
      box,
      new THREE.MeshLambertMaterial({ color: cssColor('--specimen-fill'), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
    );
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: cssColor('--specimen-stroke') }));
    g.dynamic.add(face, edges);

    // The 2D lab's section: the x–y mid-plane, carried by the same map.
    if (section) {
      const corners = [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ].map(([x, y]) => map(x, y, 0));
      const geo = new THREE.BufferGeometry().setFromPoints([corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]]);
      const warn = cssColor('--warn');
      g.dynamic.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: warn, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })));
      g.dynamic.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), new THREE.LineBasicMaterial({ color: warn })));
      const l = v.label('2D section', 'three-label section');
      l.position.copy(corners[1].clone().add(new THREE.Vector3(0.12, 0, 0)));
      g.dynamic.add(l);
    }

    // Material lines: straight lines along the chosen material axes, through the whole cube.
    if (ov.materialLines && lineAxes.length) {
      const pts: THREE.Vector3[] = [];
      const gap = lineAxes.length > 1 ? 0.25 : 0.16;
      for (const a of lineAxes) {
        const d: V3 = [R[0][a], R[1][a], R[2][a]];
        const [u, w] = perpendicular(d);
        for (let i = -6; i <= 6; i++)
          for (let j = -6; j <= 6; j++) {
            const o: V3 = [0, 1, 2].map((c) => (i * u[c] + j * w[c]) * gap + 1e-3) as V3;
            const t = clipToCube(o, d);
            if (!t) continue;
            for (const tt of t) pts.push(map(o[0] + tt * d[0], o[1] + tt * d[1], o[2] + tt * d[2]));
          }
      }
      g.dynamic.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: cssColor('--material'), transparent: true, opacity: 0.45 })));
    }

    // Material axes, carried by the same map.
    if (ov.materialAxes)
      for (let a = 0; a < 3; a++) {
        const dir = map(R[0][a], R[1][a], R[2][a]);
        g.dynamic.add(arrow(new THREE.Vector3(), dir, 0.62, cssColor('--material'), 0.01));
        const l = v.label(String(a + 1), 'three-label material');
        l.position.copy(dir.clone().normalize().multiplyScalar(0.72));
        g.dynamic.add(l);
      }

    // Principal axes, with lengths in proportion to the principal values.
    for (const [on, pr, colour, dashed] of [
      [ov.principalStress, principalStress, '--stress', false],
      [ov.principalStrain, principalStrain, '--strain', true],
    ] as const) {
      if (!on) continue;
      const big = Math.max(...pr.values.map(Math.abs));
      if (!(big > 0)) continue;
      pr.values.forEach((val, i) => {
        if (Math.abs(val) <= 1e-9 * big) return;
        const d = new THREE.Vector3(...(pr.directions[i] as V3)).normalize();
        g.dynamic.add(principalAxis(d, Math.max(0.78 * (Math.abs(val) / big), 0.1), val > 0, cssColor(colour), dashed));
      });
    }

    // The cut: a material plane through the centre (through the map), its normal n and the traction t = σ·n.
    if (cut) {
      const c = cssColor('--stress');
      const poly = cubeSection(cut.n).map((q) => map(...q));
      if (poly.length >= 3) {
        const tri: THREE.Vector3[] = [];
        for (let i = 1; i + 1 < poly.length; i++) tri.push(poly[0], poly[i], poly[i + 1]);
        g.dynamic.add(new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(tri), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })));
        const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(poly), new THREE.LineDashedMaterial({ color: c, dashSize: 0.05, gapSize: 0.03 }));
        loop.computeLineDistances();
        g.dynamic.add(loop);
      }
      const n = new THREE.Vector3(...cut.n);
      g.dynamic.add(arrow(new THREE.Vector3(), n, 0.42, cssColor('--faint'), 0.006));
      const ln = v.label('n', 'three-label axis');
      ln.position.copy(n.clone().multiplyScalar(0.5));
      g.dynamic.add(ln);
      const t = new THREE.Vector3(...(cut.traction as V3));
      const mag = t.length();
      if (mag > 1e-9 * Math.max(...stress.map(Math.abs), 1e-300)) {
        g.dynamic.add(arrow(new THREE.Vector3(), t, Math.max(Math.min(ARROW_PER_REF * (mag / stressRef), 0.7), 0.08), c, 0.014));
        const lt = v.label('t', 'three-label cut');
        lt.position.copy(t.clone().normalize().multiplyScalar(Math.max(Math.min(ARROW_PER_REF * (mag / stressRef), 0.7), 0.08) + 0.08));
        g.dynamic.add(lt);
      }
    }

    // Tractions on the six faces: the normal component along ±n, the shear components along the face.
    const sig = stressTensor(stress);
    const tol = 1e-9 * Math.max(...stress.map(Math.abs), 1e-300);
    for (let n = 0; n < 3; n++)
      for (const sgn of [1, -1]) {
        const centre = map(n === 0 ? sgn / 2 : 0, n === 1 ? sgn / 2 : 0, n === 2 ? sgn / 2 : 0);
        for (let c = 0; c < 3; c++) {
          const value = sgn * sig[c][n]; // t_c = σ_cn n_n with n = ±e_n
          if (Math.abs(value) <= tol) continue;
          const dir = new THREE.Vector3(c === 0 ? 1 : 0, c === 1 ? 1 : 0, c === 2 ? 1 : 0).multiplyScalar(Math.sign(value));
          const len = Math.min(ARROW_PER_REF * (Math.abs(value) / stressRef), 0.6);
          const held = control[SLOT[c][n]] === 'strain';
          const colour = cssColor(held ? '--reaction' : '--applied');
          // Shear arrows start a little off the face centre so they do not hide the normal one.
          const from = c === n ? centre.clone() : centre.clone().add(new THREE.Vector3(n === 0 ? sgn * 0.02 : 0, n === 1 ? sgn * 0.02 : 0, n === 2 ? sgn * 0.02 : 0));
          g.dynamic.add(arrow(from, dir, Math.max(len, 0.06), colour, 0.014));
        }
      }
    v.render();
  };

  useEffect(() => {
    if (!host.current) return;
    let v: Viewer;
    try {
      v = createViewer(host.current, { distance: 4.2, perspective: latest.current.perspective, onThemeChange: () => draw() });
    } catch {
      setFailed(true);
      return;
    }
    viewer.current = v;
    // Reference cube (dashed) and specimen axes.
    const ref = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineDashedMaterial({ color: cssColor('--reference'), dashSize: 0.05, gapSize: 0.04 }),
    );
    ref.computeLineDistances();
    v.scene.add(ref);
    // Specimen axes at the front lower-left corner, clear of the cube in the initial view.
    const origin = new THREE.Vector3(-0.95, -0.8, 0.95);
    for (let a = 0; a < 3; a++) {
      const dir = new THREE.Vector3(a === 0 ? 1 : 0, a === 1 ? 1 : 0, a === 2 ? 1 : 0);
      v.scene.add(arrow(origin, dir, 0.32, cssColor('--faint'), 0.008));
      const l = v.label(AXES[a], 'three-label axis');
      l.position.copy(origin.clone().add(dir.multiplyScalar(0.42)));
      v.scene.add(l);
    }
    const dynamic = new THREE.Group();
    v.scene.add(dynamic);
    groups.current = { dynamic };
    draw();
    return () => {
      v.dispose();
      viewer.current = null;
      groups.current = null;
    };
    // The scene is built once; `draw` reads the latest props.
  }, []);

  useEffect(draw, [p.stress, p.strain, p.control, p.R, k, p.stressRef, p.section, p.overlays, p.lineAxes, p.principalStress, p.principalStrain, p.cut]);
  useEffect(() => viewer.current?.setPerspective(p.perspective), [p.perspective]);

  const ov = p.overlays;
  return (
    <div className="specimen3d">
      {failed ? (
        <p className="hint">This browser could not start WebGL, which the 3D view needs.</p>
      ) : (
        <>
          <div className="view-row">
            <ViewButtons viewer={() => viewer.current} />
          </div>
          <div
            ref={host}
            className="three-host"
            tabIndex={0}
            role="application"
            aria-label={`3D specimen: reference cube (dashed) and the deformed cube with its face tractions. ${KEYS_HINT}`}
          />
        </>
      )}
      <div className="specimen3d-foot">
        <span className="lg-applied">prescribed traction</span>
        <span className="lg-reaction">reaction of a held displacement</span>
        {ov.materialAxes && <span className="lg-material">material axes 1, 2, 3</span>}
        {ov.principalStress && <span className="lg-stress">principal stress (heads out: tension)</span>}
        {ov.principalStrain && <span className="lg-strain">principal strain (dashed)</span>}
        {p.cut && <span className="lg-stress">cut plane and its traction t = σ·n</span>}
        <span className="muted">
          Displacements ×{fmt(k, 3)}
          {k < p.magnification ? ' (capped so the cube does not fold)' : ''}: display only. {KEYS_HINT}
        </span>
      </div>
    </div>
  );
}
