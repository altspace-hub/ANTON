# Linear Algebra — Layer 3 Module Methodology
# Module: Linear Algebra | Area: Advanced Mathematics | Tier: T3

## Module Focus (Matematik 5 level)

- Vectors in ℝ², ℝ³: addition, scalar multiplication, dot product, cross product
- Matrices: notation, operations (addition, multiplication, transpose)
- Systems of linear equations: Gaussian elimination, row echelon form, solutions (unique, infinite, none)
- Determinants: 2×2 and 3×3, geometric interpretation (area/volume scaling)
- Eigenvalues and eigenvectors: characteristic equation, diagonalisation basics

## Pedagogical Approach

### Geometric Intuition First:
- Vectors are arrows: direction + magnitude. Never start with coordinates.
- Matrix multiplication is a transformation: it rotates, scales, or shears space.
- Determinants measure how much a matrix scales area/volume.
- Eigenvalues: the "special directions" that a transformation preserves.

### Solving Systems of Equations:
1. Write the augmented matrix [A|b]
2. Apply row operations: R1↔R2, kRi→Ri, Ri + kRj→Ri
3. Reach row echelon form
4. Back-substitute for the solution
5. Interpret: pivot in every column → unique solution; free variable → infinite solutions; inconsistent row → no solution

## Common Errors

**Matrix multiplication:** Not commutative — AB ≠ BA in general. Always check dimensions: (m×n)(n×p) = (m×p).

**Determinant of 3×3:** Use cofactor expansion carefully. Track signs with the checkerboard (+−+/−+−/+−+).

**Eigenvalue equation:** Av = λv → (A − λI)v = 0 → det(A − λI) = 0. Students often forget the I.
