import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { type Control, type Mat, strainTensor, stressTensor } from '../mechanics';
import { fmt } from '../app/format';
import { type Viewer, arrow, clearGroup, createViewer, cssColor } from './three/viewer';

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

/**
 * The 3D specimen: a unit cube in specimen axes, drawn through the magnified
 * small-strain map x = X + k ε X (symmetric strain only, no rigid rotation),
 * with face tractions split into their normal and shear components. Blue
 * components are prescribed tractions; orange ones are reactions of held
 * displacements.
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
    const { stress, strain, control, R, stressRef, section } = latest.current;
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

    // Material axes, carried by the same map.
    for (let a = 0; a < 3; a++) {
      const dir = map(R[0][a], R[1][a], R[2][a]);
      g.dynamic.add(arrow(new THREE.Vector3(), dir, 0.62, cssColor('--material'), 0.01));
      const l = v.label(String(a + 1), 'three-label material');
      l.position.copy(dir.clone().normalize().multiplyScalar(0.72));
      g.dynamic.add(l);
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
      v = createViewer(host.current, { distance: 4.2, onThemeChange: () => draw() });
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

  useEffect(draw, [p.stress, p.strain, p.control, p.R, k, p.stressRef, p.section]);

  return (
    <div className="specimen3d">
      {failed ? (
        <p className="hint">This browser could not start WebGL, which the 3D view needs.</p>
      ) : (
        <div ref={host} className="three-host" role="img" aria-label="3D specimen: reference cube (dashed) and the deformed cube with its face tractions; drag to rotate" />
      )}
      <div className="specimen3d-foot">
        <span className="lg-applied">prescribed traction</span>
        <span className="lg-reaction">reaction of a held displacement</span>
        <span className="lg-material">material axes 1, 2, 3</span>
        <span className="muted">
          Displacements ×{fmt(k, 3)}
          {k < p.magnification ? ' (capped so the cube does not fold)' : ''}: display only. Drag to rotate, scroll to zoom.
        </span>
      </div>
    </div>
  );
}
