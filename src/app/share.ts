// The elastic material format (docs/material-format.md) and share links.

import { type Mat, type PlaneClassId, type SymmetryClassId, PLANE_CLASSES, SPACE_CLASSES, SYMMETRY_CLASSES, axesOf, nearestRotation } from '../mechanics';
import { type LabState, baseRotation, presetOf } from './lab';
import {
  type Entry,
  type Loadable,
  type OrderId,
  type ShearConvention,
  type Unit,
  ORDER_COMPONENTS,
  UNIT_MPA,
  analyze,
  toLoadable,
} from './ownMaterial';

export const FORMAT = 'solidmechtools.elastic-material';
export const VERSION = 1;

const PLANE_NAME: Record<PlaneClassId, string> = {
  'plane-isotropic': 'isotropic',
  'plane-square': 'square',
  'plane-orthotropic': 'orthotropic',
  'plane-anisotropic': 'anisotropic',
};

export interface MaterialDocument {
  format: string;
  version: number;
  name?: string;
  source?: string;
  units: Unit;
  material: Record<string, unknown>;
  orientation?: { axis1: number[]; axis2: number[]; axis3: number[] };
  view?: { thetaDeg?: number; mode?: 'stress' | 'strain'; space?: '2d' | '3d' };
}

/** The current material in the constants form, with its orientation and view. */
export function documentOf(s: LabState): MaterialDocument {
  const cls = SYMMETRY_CLASSES[s.classId];
  const preset = presetOf(s);
  const plane = cls.dimension === 2;
  const constants = Object.fromEntries(cls.params.map((d) => [d.key, d.kind === 'modulus' ? s.params[d.key] / UNIT_MPA.GPa : s.params[d.key]]));
  const [a1, a2, a3] = axesOf(baseRotation(s));
  return {
    format: FORMAT,
    version: VERSION,
    name: s.custom ? `${preset.name} (modified)` : preset.name,
    source: preset.source,
    units: 'GPa',
    material: {
      dimension: plane ? 2 : 3,
      definition: 'constants',
      symmetry: plane ? PLANE_NAME[s.classId as PlaneClassId] : s.classId,
      ...(plane ? { plane: s.mode } : {}),
      constants,
    },
    ...(plane ? {} : { orientation: { axis1: a1, axis2: a2, axis3: a3 } }),
    view: { thetaDeg: s.thetaDeg, mode: s.mode, space: s.space },
  };
}

// ---------------------------------------------------------------------------
// Reading

export type Read = { loadable: Loadable; mode: 'stress' | 'strain'; space: '2d' | '3d'; notes: string[] } | { error: string };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A material document → something the Lab can load, or the reason it cannot. */
export function readDocument(doc: unknown): Read {
  if (!doc || typeof doc !== 'object') return { error: 'Not a material document.' };
  const d = doc as Partial<MaterialDocument>;
  if (d.format !== FORMAT) return { error: `Unknown format “${String(d.format)}”.` };
  if (!isNum(d.version) || d.version > VERSION) return { error: `Version ${String(d.version)} is newer than this Lab supports (${VERSION}).` };
  if (!d.units || !(d.units in UNIT_MPA)) return { error: `Unknown units “${String(d.units)}”.` };
  const m = (d.material ?? {}) as Record<string, unknown>;
  const dimension = m.dimension;
  if (dimension !== 2 && dimension !== 3) return { error: 'material.dimension must be 2 or 3.' };
  const plane = m.plane === 'strain' ? 'strain' : 'stress';
  if (dimension === 2 && m.plane !== 'stress' && m.plane !== 'strain') return { error: 'material.plane must be "stress" or "strain" for 2D data.' };

  let entry: Entry;
  if (m.definition === 'constants') {
    const name = String(m.symmetry);
    const classId: SymmetryClassId | undefined =
      dimension === 3 ? SPACE_CLASSES.find((c) => c === name) : PLANE_CLASSES.find((c) => PLANE_NAME[c] === name);
    if (!classId) return { error: `Unknown ${dimension}D symmetry “${name}”.` };
    const given = (m.constants ?? {}) as Record<string, unknown>;
    const keys = SYMMETRY_CLASSES[classId].params.map((p) => p.key);
    const missing = keys.filter((k) => !isNum(given[k]));
    const extra = Object.keys(given).filter((k) => !keys.includes(k));
    if (missing.length) return { error: `Missing constants for ${name}: ${missing.join(', ')}.` };
    if (extra.length) return { error: `Constants that ${name} does not have: ${extra.join(', ')}.` };
    entry = { definition: 'constants', dimension, plane, classId, constants: given as Record<string, number>, unit: d.units };
  } else if (m.definition === 'matrix') {
    const n = dimension === 3 ? 6 : 3;
    const M = m.matrix as unknown;
    if (!Array.isArray(M) || M.length !== n || M.some((r) => !Array.isArray(r) || r.length !== n || r.some((v) => !isNum(v))))
      return { error: `material.matrix must be a ${n}×${n} array of numbers.` };
    const kind = m.kind === 'stiffness' || m.kind === 'compliance' ? m.kind : null;
    if (!kind) return { error: 'material.kind must be "stiffness" or "compliance".' };
    const shear = (['engineering', 'tensor', 'mandel'] as ShearConvention[]).find((x) => x === m.shear);
    if (!shear) return { error: 'material.shear must be "engineering", "tensor" or "mandel".' };
    const orderText = JSON.stringify(m.order ?? (n === 6 ? ORDER_COMPONENTS.voigt : ['11', '22', '12']));
    const order = (Object.keys(ORDER_COMPONENTS) as OrderId[]).find((o) => JSON.stringify(ORDER_COMPONENTS[o]) === orderText);
    if (n === 6 && !order) return { error: `Unsupported component order ${orderText}.` };
    if (n === 3 && orderText !== JSON.stringify(['11', '22', '12'])) return { error: `2D matrices use the order ["11","22","12"], not ${orderText}.` };
    entry = { definition: 'matrix', dimension, plane, notation: { kind, order: order ?? 'voigt', shear, unit: d.units }, matrix: M as Mat };
  } else return { error: 'material.definition must be "constants" or "matrix".' };

  const a = analyze(entry);
  if (a.errors.length) return { error: a.errors.join(' ') };

  let R: Mat = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  let thetaDeg = isNum(d.view?.thetaDeg) ? d.view!.thetaDeg : 0;
  if (d.orientation) {
    const { axis1, axis2, axis3 } = d.orientation;
    const cols = [axis1, axis2, axis3];
    if (cols.some((c) => !Array.isArray(c) || c.length !== 3 || c.some((v) => !isNum(v)))) return { error: 'orientation needs axis1, axis2 and axis3, each three numbers.' };
    const o = nearestRotation([0, 1, 2].map((i) => cols.map((c) => c[i])));
    if ('error' in o) return { error: `orientation: ${o.error}` };
    R = o.R;
    if (dimension === 2) {
      // Only rotations about z mean anything for in-plane data; fold them into θ.
      if (Math.abs(R[2][2] - 1) > 1e-6) return { error: 'orientation: 2D data can only be rotated about z.' };
      thetaDeg += (Math.atan2(R[1][0], R[0][0]) * 180) / Math.PI;
    }
  }
  const loadable = toLoadable(entry, a, {
    classId: a.suggested!,
    R,
    thetaDeg,
    name: typeof d.name === 'string' ? d.name : '',
    source: typeof d.source === 'string' ? d.source : '',
  });
  if (dimension === 3) loadable.thetaDeg = thetaDeg;
  const mode = dimension === 2 ? plane : d.view?.mode === 'strain' ? 'strain' : 'stress';
  // 2D data has no 3D view.
  const space = dimension === 3 && d.view?.space === '3d' ? '3d' : '2d';
  return { loadable, mode, space, notes: a.notes };
}

// ---------------------------------------------------------------------------
// Links

const toBase64Url = (bytes: Uint8Array) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text: string) => {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export const LINK_KEY = 'material=';

/** The URL fragment that carries a document. */
export function encodeFragment(doc: MaterialDocument): string {
  return LINK_KEY + toBase64Url(new TextEncoder().encode(JSON.stringify(doc)));
}

/** A document from a URL fragment (with or without the leading '#'), or null if the fragment carries none. */
export function decodeFragment(hash: string): Read | null {
  const h = hash.replace(/^#/, '');
  if (!h.startsWith(LINK_KEY)) return null;
  try {
    return readDocument(JSON.parse(new TextDecoder().decode(fromBase64Url(h.slice(LINK_KEY.length)))));
  } catch {
    return { error: 'its material data is damaged.' };
  }
}
