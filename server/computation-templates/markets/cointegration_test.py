"""
Cointegration Test (Engle-Granger Approximation)
Input JSON: { "series_a": [float], "series_b": [float] }
Output JSON: { "spread": [float], "mean_spread": float, "spread_std": float, "current_zscore": float, "hedge_ratio": float, "adf_statistic_approx": float, "half_life": float }
"""
import json, sys, math

def ols_beta(y, x):
    """Simple OLS: y = alpha + beta * x, returns (alpha, beta)."""
    n = len(y)
    mx = sum(x) / n
    my = sum(y) / n
    ss_xx = sum((xi - mx) ** 2 for xi in x)
    ss_xy = sum((x[i] - mx) * (y[i] - my) for i in range(n))
    if ss_xx == 0:
        return my, 0.0
    beta = ss_xy / ss_xx
    alpha = my - beta * mx
    return alpha, beta

def main():
    data = json.loads(sys.stdin.read())
    sa = [float(v) for v in data.get("series_a", [])]
    sb = [float(v) for v in data.get("series_b", [])]

    if len(sa) != len(sb):
        print(json.dumps({"error": "series_a and series_b must have equal length"}))
        return

    n = len(sa)
    if n < 20:
        print(json.dumps({"error": "Need at least 20 data points for cointegration test"}))
        return

    # Step 1: OLS regression to find hedge ratio
    alpha, hedge_ratio = ols_beta(sa, sb)

    # Step 2: Compute spread (residuals)
    spread = [round(sa[i] - hedge_ratio * sb[i] - alpha, 8) for i in range(n)]

    mean_spread = sum(spread) / n
    spread_std = math.sqrt(sum((s - mean_spread) ** 2 for s in spread) / (n - 1))

    # Current z-score
    current_zscore = (spread[-1] - mean_spread) / spread_std if spread_std > 0 else 0.0

    # Step 3: ADF test approximation on spread
    # Regress delta_spread on lag_spread: delta_s(t) = gamma * s(t-1) + epsilon
    delta_s = [spread[i] - spread[i-1] for i in range(1, n)]
    lag_s = spread[:n-1]
    _, gamma = ols_beta(delta_s, lag_s)

    # ADF statistic = gamma / SE(gamma)
    n_d = len(delta_s)
    predicted = [gamma * lag_s[i] for i in range(n_d)]
    residuals = [delta_s[i] - predicted[i] for i in range(n_d)]
    ss_res = sum(r ** 2 for r in residuals)
    se_resid = math.sqrt(ss_res / (n_d - 1)) if n_d > 1 else 1.0
    ss_lag = sum(v ** 2 for v in lag_s)
    se_gamma = se_resid / math.sqrt(ss_lag) if ss_lag > 0 else 1.0
    adf_stat = gamma / se_gamma if se_gamma > 0 else 0.0

    # Step 4: Half-life of mean reversion
    # half_life = -ln(2) / ln(1 + gamma)
    if gamma < 0 and (1 + gamma) > 0:
        half_life = -math.log(2) / math.log(1 + gamma)
    else:
        half_life = float('inf')

    # Signal interpretation
    if adf_stat < -3.34:
        cointegration_signal = "strong"
    elif adf_stat < -2.86:
        cointegration_signal = "moderate"
    else:
        cointegration_signal = "weak"

    print(json.dumps({
        "spread": spread[-60:],
        "mean_spread": round(mean_spread, 8),
        "spread_std": round(spread_std, 8),
        "current_zscore": round(current_zscore, 6),
        "hedge_ratio": round(hedge_ratio, 8),
        "intercept": round(alpha, 8),
        "adf_statistic_approx": round(adf_stat, 4),
        "half_life": round(half_life, 2) if half_life != float('inf') else None,
        "cointegration_signal": cointegration_signal,
        "num_observations": n,
    }))

if __name__ == "__main__":
    main()
