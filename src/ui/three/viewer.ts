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
  camera: THREE.PerspectiveCamera;
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

export function createViewer(host: HTMLElement, opts: { distance: number; onThemeChange?: () => void }): Viewer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'three-labels';
  host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  // An oblique view that shows the x, y and z faces.
  camera.position.set(0.62, 0.42, 0.66).normalize().multiplyScalar(opts.distance);
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(2, 3, 4);
  camera.add(sun);
  scene.add(camera);

  const controls = new OrbitControls(camera, labels.domElement);
  controls.enablePan = false;
  controls.minDistance = opts.distance * 0.5;
  controls.maxDistance = opts.distance * 2.2;

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
    camera.aspect = w / h;
    // On narrow (phone) views, widen the field of view so the whole scene still fits.
    camera.zoom = Math.min(1, w / h / 1.55);
    camera.updateProjectionMatrix();
    render();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

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
    camera,
    render,
    label,
    dispose: () => {
      cancelAnimationFrame(frame);
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
