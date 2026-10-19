// Snap targets for material knobs: values at which a constant equals another
// one, or makes a plane isotropic, or removes a coupling. Only admissible
// targets are returned.

import { knobInterval } from './admissibility';
import type { Params, SymmetryClassDef } from './materials';

export interface SnapTarget {
  value: number;
  label: string;
}

export interface KnobSnaps {
  /** Admissible targets other than the current value. */
  ticks: SnapTarget[];
  /** Label of the target the knob currently sits on, if any. */
  active: string | null;
}

// Voigt shear slot → the two normal axes spanning its plane.
const SHEAR_PLANE: Record<string, [number, number, number]> = {
  '23': [3, 1, 2],
  '13': [4, 0, 2],
  '12': [5, 0, 1],
};
const SUB = ['₁', '₂', '₃'];
const shearSub = (p: string) => p.split('').map((d) => SUB[Number(d) - 1]).join('');

export function snapTargets(cls: SymmetryClassDef, params: Params): Record<string, KnobSnaps> {
  const S = cls.build(params);
  const E = [0, 1, 2].map((i) => 1 / S[i][i]);
  const G = (k: number) => 1 / S[k][k];
  const nu = (i: number, j: number) => -S[j][i] / S[i][i];
  const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1e-300);
  const isoLabel = (a: number, b: number) => (cls.id === 'cubic' ? 'isotropic' : `isotropic in the ${a + 1}–${b + 1} plane`);

  const out: Record<string, KnobSnaps> = {};
  for (const d of cls.params) {
    const v = params[d.key];
    const list: SnapTarget[] = [];
    let m: RegExpMatchArray | null;
    if ((m = d.key.match(/^E(\d)$/))) {
      const i = Number(m[1]) - 1;
      for (let j = 0; j < 3; j++) if (j !== i && !same(E[j], v)) list.push({ value: E[j], label: `= E${SUB[j]}` });
    } else if ((m = d.key.match(/^G(\d\d)$/))) {
      const [k, a, b] = SHEAR_PLANE[m[1]];
      for (const p of Object.keys(SHEAR_PLANE)) {
        const kk = SHEAR_PLANE[p][0];
        if (kk !== k && !same(G(kk), v)) list.push({ value: G(kk), label: `= G${shearSub(p)}` });
      }
      if (cls.id !== 'isotropic' && same(E[a], E[b])) list.push({ value: E[a] / (2 * (1 + nu(a, b))), label: isoLabel(a, b) });
    } else if ((m = d.key.match(/^nu(\d)(\d)$/))) {
      const i = Number(m[1]) - 1;
      const j = Number(m[2]) - 1;
      list.push({ value: 0, label: '0' });
      for (const [p, q] of [[0, 1], [0, 2], [1, 2]])
        if ((p !== i || q !== j) && !same(nu(p, q), v)) list.push({ value: nu(p, q), label: `= ν${SUB[p]}${SUB[q]}` });
      const k = i + j === 1 ? 5 : i + j === 2 ? 4 : 3;
      if (cls.id !== 'isotropic' && same(E[i], E[j])) list.push({ value: E[i] / (2 * G(k)) - 1, label: isoLabel(i, j) });
    } else {
      list.push({ value: 0, label: '0 (no coupling)' });
    }

    const { lo, hi } = knobInterval(cls, params, d.key);
    const margin = (b: number) => (Number.isFinite(b) ? 1e-6 * Math.max(Math.abs(b), 1e-12) : 0);
    const inside = (x: number) => x > lo + margin(lo) && x < hi - margin(hi);
    const merged: SnapTarget[] = [];
    for (const t of list.filter((t) => Number.isFinite(t.value) && inside(t.value))) {
      const dup = merged.find((u) => same(u.value, t.value));
      if (dup) dup.label += `, ${t.label}`;
      else merged.push({ ...t });
    }
    const here = merged.find((t) => same(t.value, v));
    out[d.key] = { ticks: merged.filter((t) => t !== here), active: here?.label ?? null };
  }
  return out;
}
