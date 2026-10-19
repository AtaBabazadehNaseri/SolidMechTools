import { describe, expect, it } from 'vitest';
import { cholesky, identity, inverse, matMul, symmetricEigen, transpose } from './linalg';
import { expectClose, expectMatClose, randomSPD, rng } from './testUtils';

describe('linear algebra', () => {
  const r = rng(1);

  it('inverse satisfies A A⁻¹ = I', () => {
    for (const n of [3, 6]) {
      const A = randomSPD(n, r, 1);
      expectMatClose(matMul(A, inverse(A)), identity(n), 1e-12);
    }
  });

  it('cholesky reconstructs SPD matrices and rejects indefinite ones', () => {
    const A = randomSPD(6, r);
    const L = cholesky(A)!;
    expectMatClose(matMul(L, transpose(L)), A, 1e-12);
    expect(cholesky([[1, 2], [2, 1]])).toBeNull();
    expect(cholesky([[1, 1], [1, 1]])).toBeNull(); // singular is not PD
  });

  it('Jacobi eigen-decomposition reconstructs A and gives orthonormal vectors', () => {
    const A = randomSPD(6, r, 1);
    const { values, vectors } = symmetricEigen(A);
    const V = transpose(vectors); // columns are eigenvectors
    const D = identity(6).map((row, i) => row.map((v) => v * values[i]));
    expectMatClose(matMul(matMul(V, D), vectors), A, 1e-11);
    expectMatClose(matMul(vectors, V), identity(6), 1e-11);
    for (let i = 1; i < 6; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    expectClose(values.reduce((s, v) => s + v, 0), A.reduce((s, row, i) => s + row[i], 0), 1e-12);
  });
});
