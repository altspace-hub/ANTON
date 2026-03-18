"""
Granger Causality Test (Approximation)
Input JSON: { "series_a": [float], "series_b": [float], "max_lag": int (default 5) }
Output JSON: { "results": [{ "lag": int, "f_stat": float, "p_value_approx": float }], "optimal_lag": int, "direction": str }
"""
import json, sys, math

def ols_residual_ss(y, X_cols):
    """Multivariate OLS via normal equations. Returns residual sum of squares."""
    n = len(y)
    k = len(X_cols)
    if n <= k or k == 0:
        return sum(v ** 2 for v in y)

    # X'X and X'y (manual matrix ops for stdlib-only)
    XtX = [[0.0] * k for _ in range(k)]
    Xty = [0.0] * k
    for i in range(n):
        for j in range(k):
            Xty[j] += X_cols[j][i] * y[i]
            for m in range(j, k):
                val = X_cols[j][i] * X_cols[m][i]
                XtX[j][m] += val
                if j != m:
                    XtX[m][j] += val

    # Solve via Gaussian elimination
    aug = [XtX[i][:] + [Xty[i]] for i in range(k)]
    for col in range(k):
        max_row = max(range(col, k), key=lambda r: abs(aug[r][col]))
        aug[col], aug[max_row] = aug[max_row], aug[col]
        if abs(aug[col][col]) < 1e-15:
            continue
        for row in range(k):
            if row == col:
                continue
            factor = aug[row][col] / aug[col][col]
            for j in range(col, k + 1):
                aug[row][j] -= factor * aug[col][j]

    beta = [aug[i][k] / aug[i][i] if abs(aug[i][i]) > 1e-15 else 0.0 for i in range(k)]

    # Residual SS
    ss = 0.0
    for i in range(n):
        pred = sum(beta[j] * X_cols[j][i] for j in range(k))
        ss += (y[i] - pred) ** 2
    return ss

def f_to_p_approx(f_stat, df1, df2):
    """Very rough F-to-p approximation."""
    if f_stat <= 0 or df1 <= 0 or df2 <= 0:
        return 1.0
    x = df2 / (df2 + df1 * f_stat)
    # Simple approximation: larger F -> smaller p
    p = math.exp(-0.5 * f_stat * df1 / max(df2, 1))
    return min(max(p, 0.0001), 1.0)

def main():
    data = json.loads(sys.stdin.read())
    sa = [float(v) for v in data.get("series_a", [])]
    sb = [float(v) for v in data.get("series_b", [])]
    max_lag = int(data.get("max_lag", 5))

    if len(sa) != len(sb):
        print(json.dumps({"error": "series_a and series_b must have equal length"}))
        return

    n = len(sa)
    if n < max_lag + 10:
        print(json.dumps({"error": f"Need at least {max_lag + 10} data points"}))
        return

    if max_lag < 1:
        print(json.dumps({"error": "max_lag must be at least 1"}))
        return

    results = []

    for lag in range(1, max_lag + 1):
        # Dependent: sa[lag:]
        y = sa[lag:]
        t = len(y)

        # Restricted model: sa predicted by own lags only
        restricted_X = []
        for l in range(1, lag + 1):
            restricted_X.append(sa[lag - l: lag - l + t])

        # Unrestricted model: sa predicted by own lags + sb lags
        unrestricted_X = restricted_X[:]
        for l in range(1, lag + 1):
            unrestricted_X.append(sb[lag - l: lag - l + t])

        ss_r = ols_residual_ss(y, restricted_X)
        ss_u = ols_residual_ss(y, unrestricted_X)

        df1 = lag
        df2 = t - 2 * lag
        if df2 <= 0 or ss_u <= 0:
            continue

        f_stat = ((ss_r - ss_u) / df1) / (ss_u / df2)
        p_value = f_to_p_approx(f_stat, df1, df2)

        results.append({
            "lag": lag,
            "f_stat": round(f_stat, 4),
            "p_value_approx": round(p_value, 6),
        })

    if not results:
        print(json.dumps({"error": "Could not compute any lag results"}))
        return

    # Find optimal lag (lowest p-value)
    best = min(results, key=lambda r: r["p_value_approx"])
    optimal_lag = best["lag"]

    # Direction
    significant = best["p_value_approx"] < 0.05
    direction = "b_causes_a" if significant else "no_significant_causality"

    print(json.dumps({
        "results": results,
        "optimal_lag": optimal_lag,
        "direction": direction,
        "significant_at_5pct": significant,
        "num_observations": n,
    }))

if __name__ == "__main__":
    main()
