"""
Fama-French-Carhart 4-Factor Model
Computes factor loadings, contributions, specific risk, R-squared, and alpha.
Uses OLS regression via pure Python normal equations.

Input JSON: {
  "asset_returns": [float, ...],       // T periods of asset excess returns
  "factor_returns": {
    "market": [float, ...],            // Market excess returns (Rm - Rf)
    "size": [float, ...],              // SMB (Small Minus Big)
    "value": [float, ...],             // HML (High Minus Low)
    "momentum": [float, ...]           // UMD (Up Minus Down)
  }
}

Output JSON: {
  "alpha": float,
  "factor_loadings": {"market": float, "size": float, "value": float, "momentum": float},
  "factor_contributions": {"market": float, "size": float, "value": float, "momentum": float},
  "specific_risk": float,
  "r_squared": float,
  "adjusted_r_squared": float,
  "residual_std": float,
  "t_statistics": {"alpha": float, "market": float, "size": float, "value": float, "momentum": float}
}
"""
import json, sys, math

def main():
    data = json.loads(sys.stdin.read())
    y = [float(x) for x in data["asset_returns"]]
    factors = data["factor_returns"]

    factor_names = ["market", "size", "value", "momentum"]
    # Build X matrix: [1, market, size, value, momentum] for each period
    t = len(y)
    k = len(factor_names) + 1  # +1 for intercept (alpha)

    X = []
    for i in range(t):
        row = [1.0]  # intercept
        for fn in factor_names:
            vals = factors.get(fn, [])
            row.append(float(vals[i]) if i < len(vals) else 0.0)
        X.append(row)

    # OLS: beta = (X'X)^-1 * X'y
    # X'X (kxk)
    XtX = [[0.0] * k for _ in range(k)]
    for i in range(k):
        for j in range(k):
            for r in range(t):
                XtX[i][j] += X[r][i] * X[r][j]

    # X'y (kx1)
    Xty = [0.0] * k
    for i in range(k):
        for r in range(t):
            Xty[i] += X[r][i] * y[r]

    # Invert X'X via Gauss-Jordan
    def mat_inv(M):
        n = len(M)
        aug = [M[i][:] + [1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
        for col in range(n):
            max_row = max(range(col, n), key=lambda r: abs(aug[r][col]))
            aug[col], aug[max_row] = aug[max_row], aug[col]
            pivot = aug[col][col]
            if abs(pivot) < 1e-15:
                continue
            for j in range(2 * n):
                aug[col][j] /= pivot
            for row in range(n):
                if row == col:
                    continue
                factor = aug[row][col]
                for j in range(2 * n):
                    aug[row][j] -= factor * aug[col][j]
        return [aug[i][n:] for i in range(n)]

    XtX_inv = mat_inv(XtX)

    # beta = XtX_inv * Xty
    beta = [0.0] * k
    for i in range(k):
        for j in range(k):
            beta[i] += XtX_inv[i][j] * Xty[j]

    alpha = beta[0]
    loadings = {factor_names[i]: beta[i + 1] for i in range(len(factor_names))}

    # Residuals and R-squared
    y_mean = sum(y) / t
    ss_tot = sum((y[i] - y_mean) ** 2 for i in range(t))
    ss_res = 0.0
    residuals = []
    for i in range(t):
        y_hat = sum(X[i][j] * beta[j] for j in range(k))
        res = y[i] - y_hat
        residuals.append(res)
        ss_res += res ** 2

    r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else 0
    adj_r_squared = 1 - (1 - r_squared) * (t - 1) / (t - k) if t > k else r_squared

    # Residual standard error
    residual_std = math.sqrt(ss_res / (t - k)) if t > k else 0

    # Specific risk (annualized)
    specific_risk = residual_std * math.sqrt(252)

    # T-statistics
    t_stats = {}
    se_beta = []
    for i in range(k):
        se = residual_std * math.sqrt(max(XtX_inv[i][i], 0))
        se_beta.append(se)
    t_stats["alpha"] = beta[0] / se_beta[0] if se_beta[0] > 1e-15 else 0
    for fi, fn in enumerate(factor_names):
        se = se_beta[fi + 1]
        t_stats[fn] = beta[fi + 1] / se if se > 1e-15 else 0

    # Factor contributions (annualized: loading * mean factor return * 252)
    contributions = {}
    for fn in factor_names:
        vals = factors.get(fn, [])
        if vals:
            mean_f = sum(float(v) for v in vals) / len(vals)
            contributions[fn] = round(loadings[fn] * mean_f * 252, 6)
        else:
            contributions[fn] = 0.0

    result = {
        "alpha": round(alpha * 252, 6),  # Annualized
        "factor_loadings": {k: round(v, 6) for k, v in loadings.items()},
        "factor_contributions": contributions,
        "specific_risk": round(specific_risk, 6),
        "r_squared": round(r_squared, 6),
        "adjusted_r_squared": round(adj_r_squared, 6),
        "residual_std": round(residual_std, 8),
        "t_statistics": {k: round(v, 4) for k, v in t_stats.items()},
    }
    print(json.dumps(result))

if __name__ == "__main__":
    main()
