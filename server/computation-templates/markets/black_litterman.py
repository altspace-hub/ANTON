"""
Black-Litterman Model
Combines CAPM equilibrium returns with investor views via Bayesian updating.
Pure Python matrix algebra — no numpy/pandas.

Input JSON: {
  "market_weights": [float, ...],          // N market-cap weights
  "covariance": [[float, ...], ...],       // NxN covariance matrix (annualized)
  "views": [{
    "assets": [int, ...],                  // Asset indices involved
    "direction": [float, ...],             // +1/-1 per asset (P matrix row)
    "return": float,                       // Expected view return (Q entry)
    "confidence": float                    // 0-1 confidence (higher = tighter)
  }],
  "risk_aversion": float,                  // Risk aversion parameter (default 2.5)
  "tau": float,                            // Uncertainty scalar (default 0.05)
  "symbols": ["str", ...]                  // Symbol names
}

Output JSON: {
  "prior_returns": {symbol: float},
  "posterior_returns": {symbol: float},
  "optimal_weights": {symbol: float},
  "view_impacts": [{view_index: int, prior_diff: float, posterior_diff: float}]
}
"""
import json, sys, math

def mat_mult(A, B):
    """Multiply two matrices."""
    rows_a, cols_a = len(A), len(A[0])
    rows_b, cols_b = len(B), len(B[0])
    assert cols_a == rows_b
    C = [[0.0] * cols_b for _ in range(rows_a)]
    for i in range(rows_a):
        for j in range(cols_b):
            for k in range(cols_a):
                C[i][j] += A[i][k] * B[k][j]
    return C

def mat_add(A, B):
    return [[A[i][j] + B[i][j] for j in range(len(A[0]))] for i in range(len(A))]

def mat_scale(A, s):
    return [[A[i][j] * s for j in range(len(A[0]))] for i in range(len(A))]

def transpose(A):
    return [[A[j][i] for j in range(len(A))] for i in range(len(A[0]))]

def mat_inv(M):
    """Invert a matrix via Gauss-Jordan elimination."""
    n = len(M)
    aug = [M[i][:] + [1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for col in range(n):
        max_row = max(range(col, n), key=lambda r: abs(aug[r][col]))
        aug[col], aug[max_row] = aug[max_row], aug[col]
        pivot = aug[col][col]
        if abs(pivot) < 1e-12:
            raise ValueError("Singular covariance matrix — assets may be too correlated")
        for j in range(2 * n):
            aug[col][j] /= pivot
        for row in range(n):
            if row == col:
                continue
            factor = aug[row][col]
            for j in range(2 * n):
                aug[row][j] -= factor * aug[col][j]
    return [aug[i][n:] for i in range(n)]

def main():
    data = json.loads(sys.stdin.read())
    w_mkt = data["market_weights"]
    sigma = data["covariance"]
    views = data.get("views", [])
    delta = float(data.get("risk_aversion", 2.5))
    tau = float(data.get("tau", 0.05))
    symbols = data.get("symbols", [f"Asset_{i}" for i in range(len(w_mkt))])

    n = len(w_mkt)

    # Condition number check on covariance matrix
    def frobenius_norm(M):
        return math.sqrt(sum(M[i][j] ** 2 for i in range(len(M)) for j in range(len(M[0]))))
    try:
        sigma_inv_check = mat_inv(sigma)
        cond_number = frobenius_norm(sigma) * frobenius_norm(sigma_inv_check)
        if cond_number > 1e12:
            print(json.dumps({"error": "Singular covariance matrix — assets may be too correlated", "condition_number": cond_number}))
            return
    except ValueError as e:
        print(json.dumps({"error": str(e)}))
        return

    # Step 1: Implied equilibrium returns (pi = delta * Sigma * w_mkt)
    w_col = [[w_mkt[i]] for i in range(n)]
    sigma_w = mat_mult(sigma, w_col)
    pi = [delta * sigma_w[i][0] for i in range(n)]

    if len(views) == 0:
        # No views — return equilibrium
        result = {
            "prior_returns": {symbols[i]: round(pi[i], 6) for i in range(n)},
            "posterior_returns": {symbols[i]: round(pi[i], 6) for i in range(n)},
            "optimal_weights": {symbols[i]: round(w_mkt[i], 6) for i in range(n)},
            "view_impacts": [],
        }
        print(json.dumps(result))
        return

    # Step 2: Build P (KxN) and Q (Kx1) from views
    k = len(views)
    P = [[0.0] * n for _ in range(k)]
    Q = [[0.0] for _ in range(k)]
    omega_diag = []

    for vi, v in enumerate(views):
        for ai, asset_idx in enumerate(v["assets"]):
            if 0 <= asset_idx < n:
                direction = v["direction"][ai] if ai < len(v["direction"]) else 1.0
                P[vi][asset_idx] = direction
        Q[vi][0] = float(v["return"])
        conf = max(0.01, min(1.0, float(v.get("confidence", 0.5))))
        # Omega diagonal: lower confidence = higher uncertainty
        p_row = P[vi]
        view_var = sum(p_row[i] * p_row[j] * sigma[i][j] for i in range(n) for j in range(n)) * tau
        omega_diag.append(view_var / conf)

    # Omega (KxK diagonal)
    Omega = [[omega_diag[i] if i == j else 0.0 for j in range(k)] for i in range(k)]

    # Step 3: Posterior (Black-Litterman formula)
    # mu_BL = [(tau*Sigma)^-1 + P'*Omega^-1*P]^-1 * [(tau*Sigma)^-1*pi + P'*Omega^-1*Q]
    tau_sigma = mat_scale(sigma, tau)
    tau_sigma_inv = mat_inv(tau_sigma)
    omega_inv = mat_inv(Omega)

    Pt = transpose(P)
    PtOinvP = mat_mult(mat_mult(Pt, omega_inv), P)
    left_inv = mat_inv(mat_add(tau_sigma_inv, PtOinvP))

    pi_col = [[pi[i]] for i in range(n)]
    term1 = mat_mult(tau_sigma_inv, pi_col)
    term2 = mat_mult(mat_mult(Pt, omega_inv), Q)
    right = [[term1[i][0] + term2[i][0]] for i in range(n)]

    mu_BL_col = mat_mult(left_inv, right)
    mu_BL = [mu_BL_col[i][0] for i in range(n)]

    # Step 4: Optimal weights from posterior
    # w* = (delta * Sigma)^-1 * mu_BL
    delta_sigma_inv = mat_inv(mat_scale(sigma, delta))
    mu_col = [[mu_BL[i]] for i in range(n)]
    w_opt_col = mat_mult(delta_sigma_inv, mu_col)
    w_opt = [w_opt_col[i][0] for i in range(n)]

    # Normalize weights to sum to 1
    w_sum = sum(w_opt)
    if abs(w_sum) > 1e-10:
        w_opt = [w / w_sum for w in w_opt]

    # View impact analysis
    view_impacts = []
    for vi in range(k):
        prior_val = sum(P[vi][j] * pi[j] for j in range(n))
        post_val = sum(P[vi][j] * mu_BL[j] for j in range(n))
        view_impacts.append({
            "view_index": vi,
            "prior_diff": round(Q[vi][0] - prior_val, 6),
            "posterior_diff": round(Q[vi][0] - post_val, 6),
        })

    result = {
        "prior_returns": {symbols[i]: round(pi[i], 6) for i in range(n)},
        "posterior_returns": {symbols[i]: round(mu_BL[i], 6) for i in range(n)},
        "optimal_weights": {symbols[i]: round(w_opt[i], 6) for i in range(n)},
        "view_impacts": view_impacts,
    }
    print(json.dumps(result))

if __name__ == "__main__":
    main()
