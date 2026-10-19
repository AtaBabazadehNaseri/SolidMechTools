// Small dense linear algebra for 3x3 and 6x6 constitutive matrices.
// Written out explicitly (no library) so every operation is inspectable.

export type Vec = number[];
export type Mat = number[][];

export function zeros(rows: number, cols: number = rows): Mat {
  return Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
}

export function identity(n: number): Mat {
  const I = zeros(n);
  for (let i = 0; i < n; i++) I[i][i] = 1;
  return I;
}

export function clone(A: Mat): Mat {
  return A.map((row) => row.slice());
}

export function transpose(A: Mat): Mat {
  return A[0].map((_, j) => A.map((row) => row[j]));
}

export function matMul(A: Mat, B: Mat): Mat {
  const n = A.length;
  const m = B[0].length;
  const k = B.length;
  const C = zeros(n, m);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      let s = 0;
      for (let p = 0; p < k; p++) s += A[i][p] * B[p][j];
      C[i][j] = s;
    }
  return C;
}

export function matVec(A: Mat, x: Vec): Vec {
  return A.map((row) => row.reduce((s, a, j) => s + a * x[j], 0));
}

export function dot(a: Vec, b: Vec): number {
  return a.reduce((s, ai, i) => s + ai * b[i], 0);
}

export function add(A: Mat, B: Mat): Mat {
  return A.map((row, i) => row.map((a, j) => a + B[i][j]));
}

export function sub(A: Mat, B: Mat): Mat {
  return A.map((row, i) => row.map((a, j) => a - B[i][j]));
}

export function scale(A: Mat, s: number): Mat {
  return A.map((row) => row.map((a) => a * s));
}

/** Rows `rows`, columns `cols` of A. */
export function submatrix(A: Mat, rows: readonly number[], cols: readonly number[]): Mat {
  return rows.map((i) => cols.map((j) => A[i][j]));
}

export function maxAbs(A: Mat): number {
  return Math.max(...A.map((row) => Math.max(...row.map(Math.abs))));
}

export function maxAbsDiff(A: Mat, B: Mat): number {
  return maxAbs(sub(A, B));
}

export function isSymmetric(A: Mat, relTol = 1e-12): boolean {
  const tol = relTol * Math.max(maxAbs(A), Number.MIN_VALUE);
  for (let i = 0; i < A.length; i++)
    for (let j = i + 1; j < A.length; j++) if (Math.abs(A[i][j] - A[j][i]) > tol) return false;
  return true;
}

/**
 * Cholesky factor L (A = L Lᵀ) of a symmetric matrix, or null if A is not
 * positive definite. A pivot is rejected when it is not positive relative to
 * the size of the diagonal, so round-off near the boundary does not pass as PD.
 */
export function cholesky(A: Mat, relTol = 1e-13): Mat | null {
  const n = A.length;
  const L = zeros(n);
  const diagScale = Math.max(...A.map((row, i) => Math.abs(row[i])));
  for (let j = 0; j < n; j++) {
    let d = A[j][j];
    for (let k = 0; k < j; k++) d -= L[j][k] * L[j][k];
    if (!(d > relTol * diagScale)) return null;
    L[j][j] = Math.sqrt(d);
    for (let i = j + 1; i < n; i++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = s / L[j][j];
    }
  }
  return L;
}

export function isPositiveDefinite(A: Mat): boolean {
  return cholesky(A) !== null;
}

/** Inverse by Gauss–Jordan elimination with partial pivoting. */
export function inverse(A: Mat): Mat {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...identity(n)[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (M[p][c] === 0) throw new Error('inverse: matrix is singular');
    [M[c], M[p]] = [M[p], M[c]];
    const piv = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((row) => row.slice(n));
}

/** Inverse of a lower-triangular matrix. */
export function lowerTriangularInverse(L: Mat): Mat {
  const n = L.length;
  const X = zeros(n);
  for (let i = 0; i < n; i++) {
    X[i][i] = 1 / L[i][i];
    for (let j = 0; j < i; j++) {
      let s = 0;
      for (let k = j; k < i; k++) s += L[i][k] * X[k][j];
      X[i][j] = -s / L[i][i];
    }
  }
  return X;
}

export interface SymmetricEigen {
  /** Ascending eigenvalues. */
  values: number[];
  /** vectors[k] is the unit eigenvector of values[k]. */
  vectors: Vec[];
}

/** Cyclic Jacobi eigen-decomposition of a real symmetric matrix. */
export function symmetricEigen(A: Mat, maxSweeps = 100): SymmetricEigen {
  const n = A.length;
  const a = clone(A);
  const V = identity(n);
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off <= 1e-30 * Math.max(1e-300, maxAbs(a) ** 2)) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (a[p][q] === 0) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p];
          const vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
  }
  const order = a.map((row, i) => [row[i], i] as const).sort((x, y) => x[0] - y[0]);
  return {
    values: order.map(([v]) => v),
    vectors: order.map(([, i]) => V.map((row) => row[i])),
  };
}
