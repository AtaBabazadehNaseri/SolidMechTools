// A small three.js viewer shared by the 3D specimen and the E(n) surface:
// renderer, camera, orbit controls (drag to rotate, wheel or pinch to zoom),
// HTML labels, resizing, theme colours, and render-on-demand.
//
// Specimen axes map directly to three.js axes: x right, y up, z towards the
// viewer, as in the 2D drawing.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

export interface Viewer {
  scene: THREE.Scene;
  /** The camera in use: perspective or orthographic. */
  readonly camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  /** Switch between a perspective and an orthographic (parallel) projection, keeping the view direction and size. */
  setPerspective: (on: boolean) => void;
  /** Back to the starting view and zoom. */
  home: () => void;
  /** Look at the centre from the + side of x, y or z (0, 1, 2). */
  viewFrom: (axis: 0 | 1 | 2) => void;
  render: () => void;
  /** A text label anchored at a 3D point; `className` styles it. */
  label: (text: string, className: string) => CSS2DObject;
  dispose: () => void;
}

/** Current value of a CSS custom property on <html>, as a three.js colour. */
export function cssColor(name: string): THREE.Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v || '#888888');
}

export function createViewer(host: HTMLElement, opts: { distance: number; perspective?: boolean; onThemeChange?: () => void }): Viewer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'three-labels';
  host.appendChild(labels.domElement);

  const FOV = 32;
  const scene = new THREE.Scene();
  const persp = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  // The orthographic frustum shows what the perspective camera shows at the default distance.
  const half = opts.distance * Math.tan(((FOV / 2) * Math.PI) / 180);
  const ortho = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 100);
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = persp;
  // An oblique view that shows the x, y and z faces.
  const START = new THREE.Vector3(0.62, 0.42, 0.66).normalize();
  persp.position.copy(START).multiplyScalar(opts.distance);
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(2, 3, 4);
  persp.add(sun);
  scene.add(persp, ortho);

  const controls = new OrbitControls<THREE.PerspectiveCamera | THREE.OrthographicCamera>(persp, labels.domElement);
  controls.enablePan = false;
  controls.minDistance = opts.distance * 0.5;
  controls.maxDistance = opts.distance * 2.2;
  controls.minZoom = 1 / 2.2;
  controls.maxZoom = 2;

  // On narrow (phone) views, widen the view so the whole scene still fits.
  let fit = 1;
  const project = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    persp.aspect = w / h;
    persp.zoom = fit;
    persp.updateProjectionMatrix();
    const a = w / h;
    ortho.left = (-half * a) / fit;
    ortho.right = (half * a) / fit;
    ortho.top = half / fit;
    ortho.bottom = -half / fit;
    ortho.updateProjectionMatrix();
  };

  const setPerspective = (on: boolean) => {
    if ((camera === persp) === on) return;
    const dir = camera.position.clone().normalize();
    if (on) {
      // The same apparent size: distance d shows what zoom d₀/d shows in parallel projection.
      const d = THREE.MathUtils.clamp(opts.distance / ortho.zoom, controls.minDistance, controls.maxDistance);
      persp.position.copy(dir.multiplyScalar(d));
      persp.quaternion.copy(ortho.quaternion);
      camera = persp;
    } else {
      ortho.zoom = THREE.MathUtils.clamp(opts.distance / persp.position.length(), controls.minZoom, controls.maxZoom);
      ortho.position.copy(dir.multiplyScalar(opts.distance));
      ortho.quaternion.copy(persp.quaternion);
      camera = ortho;
    }
    camera.add(sun);
    controls.object = camera;
    project();
    controls.update();
    render();
  };

  let frame = 0;
  const render = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      renderer.render(scene, camera);
      labels.render(scene, camera);
    });
  };
  controls.addEventListener('change', render);

  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    labels.setSize(w, h);
    fit = Math.min(1, w / h / 1.55);
    project();
    render();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  if (opts.perspective === false) setPerspective(false);

  // Camera moves that do not need a pointer: the view buttons and the keyboard.
  const place = (dir: THREE.Vector3) => {
    camera.position.copy(dir).normalize().multiplyScalar(opts.distance);
    ortho.zoom = 1;
    ortho.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();
    render();
  };
  const home = () => place(START.clone());
  const viewFrom = (axis: 0 | 1 | 2) => place(new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0));
  const orbit = (dAz: number, dPolar: number) => {
    const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    s.theta += dAz;
    s.phi = THREE.MathUtils.clamp(s.phi + dPolar, 1e-3, Math.PI - 1e-3);
    camera.position.setFromSpherical(s).add(controls.target);
    controls.update();
    render();
  };
  const zoom = (factor: number) => {
    if (camera === persp) persp.position.setLength(THREE.MathUtils.clamp(persp.position.length() / factor, controls.minDistance, controls.maxDistance));
    else {
      ortho.zoom = THREE.MathUtils.clamp(ortho.zoom * factor, controls.minZoom, controls.maxZoom);
      ortho.updateProjectionMatrix();
    }
    controls.update();
    render();
  };
  const step = Math.PI / 18;
  const onKey = (e: KeyboardEvent) => {
    const act: Record<string, () => void> = {
      ArrowLeft: () => orbit(-step, 0),
      ArrowRight: () => orbit(step, 0),
      ArrowUp: () => orbit(0, -step),
      ArrowDown: () => orbit(0, step),
      '+': () => zoom(1.15),
      '=': () => zoom(1.15),
      '-': () => zoom(1 / 1.15),
      Home: home,
      '0': home,
    };
    const f = act[e.key];
    if (!f) return;
    e.preventDefault();
    f();
  };
  host.addEventListener('keydown', onKey);

  // Colours come from the theme tokens; repaint when the theme changes.
  const mo = new MutationObserver(() => {
    opts.onThemeChange?.();
    render();
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  const label = (text: string, className: string) => {
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    return new CSS2DObject(el);
  };

  return {
    scene,
    get camera() {
      return camera;
    },
    setPerspective,
    home,
    viewFrom,
    render,
    label,
    dispose: () => {
      cancelAnimationFrame(frame);
      host.removeEventListener('keydown', onKey);
      ro.disconnect();
      mo.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
}

/** Removes and disposes every child of a group. */
export function clearGroup(g: THREE.Object3D) {
  for (const child of [...g.children]) {
    child.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
      if ((o as { element?: HTMLElement }).element) (o as unknown as { element: HTMLElement }).element.remove();
    });
    g.remove(child);
  }
}

/** A solid arrow from `from` along `dir` with total length `len`. */
export function arrow(from: THREE.Vector3, dir: THREE.Vector3, len: number, color: THREE.Color, radius = 0.012): THREE.Group {
  const g = new THREE.Group();
  const head = Math.min(0.09, 0.45 * len);
  const shaft = Math.max(len - head, 1e-4);
  const mat = new THREE.MeshLambertMaterial({ color });
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, shaft, 10), mat);
  cyl.position.y = shaft / 2;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(radius * 3, head, 14), mat);
  cone.position.y = shaft + head / 2;
  g.add(cyl, cone);
  g.position.copy(from);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return g;
}
