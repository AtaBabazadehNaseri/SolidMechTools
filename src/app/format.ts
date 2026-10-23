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

// The 3D specimen, Voigt order 11, 22, 33, 23, 13, 12 written in specimen axes.
export const COMP6 = ['xx', 'yy', 'zz', 'yz', 'xz', 'xy'] as const;
export const STRESS6_TEX = ['\\sigma_{xx}', '\\sigma_{yy}', '\\sigma_{zz}', '\\tau_{yz}', '\\tau_{xz}', '\\tau_{xy}'] as const;
export const STRAIN6_TEX = ['\\varepsilon_{xx}', '\\varepsilon_{yy}', '\\varepsilon_{zz}', '\\gamma_{yz}', '\\gamma_{xz}', '\\gamma_{xy}'] as const;
export const STRESS6_TXT = ['σxx', 'σyy', 'σzz', 'τyz', 'τxz', 'τxy'] as const;
export const STRAIN6_TXT = ['εxx', 'εyy', 'εzz', 'γyz', 'γxz', 'γxy'] as const;

export type EntryCategory = 'diagonal' | 'normal-normal' | 'normal-shear' | 'shear-shear';

/** Kind of coupling an entry carries; 2D matrices have 3 components (shear last), 3D ones 6 (shear from index 3). */
export function entryCategory(i: number, j: number, n = 3): EntryCategory {
  if (i === j) return 'diagonal';
  const normals = n === 6 ? 3 : 2;
  if (i < normals && j < normals) return 'normal-normal';
  if (i >= normals && j >= normals) return 'shear-shear';
  return 'normal-shear';
}

/** Voigt-index symbol of a 3D entry, e.g. C_{14}. */
export function entryTex6(matrix: 'C' | 'S', i: number, j: number): string {
  const [a, b] = i <= j ? [i, j] : [j, i];
  return `${matrix}_{${a + 1}${b + 1}}`;
}

/** Voigt-index symbol of a 2D entry, e.g. \bar{C}_{16}. Symmetric, so indices are sorted. */
export function entryTex(matrix: 'C' | 'S', i: number, j: number): string {
  const [a, b] = i <= j ? [i, j] : [j, i];
  return `\\bar{${matrix}}_{${VOIGT_LABEL[a]}${VOIGT_LABEL[b]}}`;
}
