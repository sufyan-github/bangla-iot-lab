/**
 * Dense linear solver: Gaussian elimination with partial pivoting.
 *
 * School circuits produce systems of at most a few hundred unknowns, so a dense
 * solve is simpler and faster than a sparse one at this size. `a` is row-major
 * (n x n) and both `a` and `b` are overwritten.
 *
 * Returns false when the system is singular (no unique solution).
 */
const SINGULAR_PIVOT = 1e-15;

export function solveLinearSystem(a: Float64Array, b: Float64Array, n: number): boolean {
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let pivotMag = Math.abs(a[col * n + col]);
    for (let row = col + 1; row < n; row++) {
      const mag = Math.abs(a[row * n + col]);
      if (mag > pivotMag) {
        pivotMag = mag;
        pivotRow = row;
      }
    }
    if (!(pivotMag > SINGULAR_PIVOT)) return false;

    if (pivotRow !== col) {
      for (let k = col; k < n; k++) {
        const tmp = a[col * n + k];
        a[col * n + k] = a[pivotRow * n + k];
        a[pivotRow * n + k] = tmp;
      }
      const tmp = b[col];
      b[col] = b[pivotRow];
      b[pivotRow] = tmp;
    }

    const pivot = a[col * n + col];
    for (let row = col + 1; row < n; row++) {
      const factor = a[row * n + col] / pivot;
      if (factor === 0) continue;
      for (let k = col + 1; k < n; k++) a[row * n + k] -= factor * a[col * n + k];
      b[row] -= factor * b[col];
    }
  }

  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let k = row + 1; k < n; k++) sum -= a[row * n + k] * b[k];
    b[row] = sum / a[row * n + row];
  }
  for (let i = 0; i < n; i++) if (!Number.isFinite(b[i])) return false;
  return true;
}
