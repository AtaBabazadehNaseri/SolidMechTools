// Display units: moduli and stiffness in GPa, compliance in TPa⁻¹, stress in MPa,
// strain in 10⁻³. Internally everything is MPa-consistent.

const MINUS = '−';

/** Significant-figure formatting with a true minus sign; |v| ≤ zeroTol prints as 0. */
export function fmt(v: number, sig = 4, zeroTol = 0): string {
  if (Number.isNaN(v)) return '—';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : `${MINUS}∞`;
  const a = Math.abs(v);
  if (a <= zeroTol || a < 1e-300) return '0';
  let s: string;
  if (a >= 1e5 || a < 1e-3) s = v.toExponential(sig - 1);
  else s = v.toFixed(Math.max(0, sig - 1 - Math.floor(Math.log10(a))));
  return s.replace(/-/g, MINUS);
}

export const toGPa = (mpa: number) => mpa / 1000;
/** 1/MPa → 1/TPa */
export const toPerTPa = (perMPa: number) => perMPa * 1e6;
export const toMilli = (strain: number) => strain * 1e3;

export const COMP = ['xx', 'yy', 'xy'] as const;
export const VOIGT_LABEL = ['1', '2', '6'] as const;
export const STRESS_TEX = ['\\sigma_{xx}', '\\sigma_{yy}', '\\tau_{xy}'] as const;
export const STRAIN_TEX = ['\\varepsilon_{xx}', '\\varepsilon_{yy}', '\\gamma_{xy}'] as const;
export const STRESS_TXT = ['σxx', 'σyy', 'τxy'] as const;
export const STRAIN_TXT = ['εxx', 'εyy', 'γxy'] as const;

export type EntryCategory = 'diagonal' | 'normal-normal' | 'normal-shear';

export function entryCategory(i: number, j: number): EntryCategory {
  if (i === j) return 'diagonal';
  if (i < 2 && j < 2) return 'normal-normal';
  return 'normal-shear';
}

/** Voigt-index symbol of a 2D entry, e.g. \bar{C}_{16}. Symmetric, so indices are sorted. */
export function entryTex(matrix: 'C' | 'S', i: number, j: number): string {
  const [a, b] = i <= j ? [i, j] : [j, i];
  return `\\bar{${matrix}}_{${VOIGT_LABEL[a]}${VOIGT_LABEL[b]}}`;
}
