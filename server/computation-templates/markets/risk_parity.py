"""
Risk Parity Portfolio
Computes equal-risk-contribution weights via Newton-Raphson iteration.
Each asset contributes equally to total portfolio risk.

Input JSON: {
  "returns": [[float, ...], ...],   // NxT matrix: N assets, T periods
  "symbols": ["str", ...],          // N symbol names
  "target_risk": float              // Target annualized portfolio volatility (optional)
}

Output JSON: {
  "weights": {symbol: float},
  "risk_contributions": {symbol: float},
  "marginal_risk": {symbol: float},
  "portfolio_volatility": float,
  "iterations": int,
  "converged": bool
}
"""
import json, sys, math

def main():
    data = json.loads(sys.stdin.read())
    returns_matrix = data["returns"]
    symbols = data["symbols"]
    target_risk = float(data.get("target_risk", 0)) if data.get("target_risk") else None

    n = len(returns_matrix)
    t = len(returns_matrix[0]) if n > 0 else 0

    if n < 2 or t < 2:
        print(json.dumps({"error": "Need at least 2 assets and 2 periods"}))
        return

    # Compute covariance matrix (annualized)
    means = [sum(returns_matrix[i]) / t for i in range(n)]
    cov = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i, n):
            s = sum((returns_matrix[i][k] - means[i]) * (returns_matrix[j][k] - means[j]) for k in range(t))
            cov[i][j] = (s / (t - 1)) * 252
            cov[j][i] = cov[i][j]

    # Risk parity via iterative reweighting
    # Goal: w_i * (Sigma @ w)_i = w_j * (Sigma @ w)_j for all i, j
    w = [1.0 / n] * n  # Start with equal weights
    max_iter = 500
    tol = 1e-10
    converged = False
    iterations = 0

    for it in range(max_iter):
        iterations = it + 1

        # Sigma @ w
        sigma_w = [sum(cov[i][j] * w[j] for j in range(n)) for i in range(n)]

        # Portfolio variance
        port_var = sum(w[i] * sigma_w[i] for i in range(n))
        port_vol = math.sqrt(max(port_var, 1e-15))

        # Risk contribution: RC_i = w_i * (Sigma @ w)_i / port_vol
        rc = [w[i] * sigma_w[i] / port_vol for i in range(n)]
        target_rc = port_vol / n  # Equal contribution target

        # Check convergence
        max_diff = max(abs(rc[i] - target_rc) for i in range(n))
        if max_diff < tol:
            converged = True
            break

        # Update weights: w_i_new = w_i * (target_rc / rc_i)
        new_w = [0.0] * n
        for i in range(n):
            if rc[i] > 1e-15:
                new_w[i] = w[i] * (target_rc / rc[i])
            else:
                new_w[i] = w[i]

        # Normalize
        w_sum = sum(new_w)
        if w_sum > 1e-15:
            w = [x / w_sum for x in new_w]
        else:
            break

    # Final calculations
    sigma_w = [sum(cov[i][j] * w[j] for j in range(n)) for i in range(n)]
    port_var = sum(w[i] * sigma_w[i] for i in range(n))
    port_vol = math.sqrt(max(port_var, 0))

    # Risk contributions
    rc = {}
    marginal = {}
    for i in range(n):
        rc[symbols[i]] = round(w[i] * sigma_w[i] / port_vol if port_vol > 0 else 0, 8)
        marginal[symbols[i]] = round(sigma_w[i] / port_vol if port_vol > 0 else 0, 8)

    # Scale to target risk if specified
    leveraged = False
    if target_risk and port_vol > 0:
        scale = target_risk / port_vol
        w = [wi * scale for wi in w]
        if sum(w) > 1.0:
            leveraged = True
        port_vol = target_risk

    # Box constraint: clamp each weight to [0, 0.30] then re-normalize to sum=1
    w = [max(0.0, min(0.30, wi)) for wi in w]
    w_sum = sum(w)
    if w_sum > 1e-15:
        w = [wi / w_sum for wi in w]

    result = {
        "weights": {symbols[i]: round(w[i], 8) for i in range(n)},
        "risk_contributions": rc,
        "marginal_risk": marginal,
        "portfolio_volatility": round(port_vol, 8),
        "iterations": iterations,
        "converged": converged,
        "leveraged": leveraged,
    }
    print(json.dumps(result))

if __name__ == "__main__":
    main()
