"""
Regression Analysis (OLS)
Input JSON: { "dependent": [float], "independent": [float], "labels": { "x": str, "y": str } (optional) }
Output JSON: { "beta": float, "alpha": float, "r_squared": float, "residual_std": float, "p_value_approx": float, "prediction_interval": { "lower": float, "upper": float } }
"""
import json, sys, math

def t_cdf_approx(t, df):
    """Approximate one-tailed p-value for t-distribution using normal approx for large df."""
    if df <= 0:
        return 0.5
    # For df > 30, approximate with standard normal
    x = t * (1 - 1 / (4 * df)) / math.sqrt(1 + t * t / (2 * df)) if df > 2 else t
    # Standard normal CDF approximation (Abramowitz & Stegun)
    if x < 0:
        return 1.0 - t_cdf_approx(-t, df)
    b0, b1, b2, b3, b4, b5 = 0.2316419, 0.319381530, -0.356563782, 1.781477937, -1.821255978, 1.330274429
    tt = 1.0 / (1.0 + b0 * x)
    phi = math.exp(-x * x / 2) / math.sqrt(2 * math.pi)
    return phi * tt * (b1 + tt * (b2 + tt * (b3 + tt * (b4 + tt * b5))))

def main():
    data = json.loads(sys.stdin.read())
    dep = [float(v) for v in data.get("dependent", [])]
    ind = [float(v) for v in data.get("independent", [])]
    labels = data.get("labels", {"x": "independent", "y": "dependent"})

    if len(dep) != len(ind):
        print(json.dumps({"error": "dependent and independent must have equal length"}))
        return

    n = len(dep)
    if n < 3:
        print(json.dumps({"error": "Need at least 3 data points"}))
        return

    # OLS regression: y = alpha + beta * x
    mean_x = sum(ind) / n
    mean_y = sum(dep) / n

    ss_xx = sum((x - mean_x) ** 2 for x in ind)
    ss_xy = sum((ind[i] - mean_x) * (dep[i] - mean_y) for i in range(n))
    ss_yy = sum((y - mean_y) ** 2 for y in dep)

    if ss_xx == 0:
        print(json.dumps({"error": "No variance in independent variable"}))
        return

    beta = ss_xy / ss_xx
    alpha = mean_y - beta * mean_x

    # Residuals
    residuals = [dep[i] - (alpha + beta * ind[i]) for i in range(n)]
    ss_res = sum(r ** 2 for r in residuals)
    r_squared = 1.0 - (ss_res / ss_yy) if ss_yy > 0 else 0.0

    df = n - 2
    residual_std = math.sqrt(ss_res / df) if df > 0 else 0.0

    # t-statistic for beta
    se_beta = residual_std / math.sqrt(ss_xx) if ss_xx > 0 else 0.0
    t_stat = beta / se_beta if se_beta > 0 else 0.0
    p_value = 2.0 * t_cdf_approx(abs(t_stat), df) if df > 0 else 1.0

    # Prediction interval at the mean of x (95%)
    t_crit = 1.96  # approximate for large samples
    pred_std = residual_std * math.sqrt(1 + 1.0 / n)
    pred_y = alpha + beta * mean_x
    pred_lower = pred_y - t_crit * pred_std
    pred_upper = pred_y + t_crit * pred_std

    print(json.dumps({
        "beta": round(beta, 8),
        "alpha": round(alpha, 8),
        "r_squared": round(r_squared, 6),
        "residual_std": round(residual_std, 8),
        "t_statistic": round(t_stat, 4),
        "p_value_approx": round(min(p_value, 1.0), 6),
        "se_beta": round(se_beta, 8),
        "prediction_interval": {
            "at_x": round(mean_x, 6),
            "predicted_y": round(pred_y, 6),
            "lower": round(pred_lower, 6),
            "upper": round(pred_upper, 6),
        },
        "labels": labels,
        "num_observations": n,
    }))

if __name__ == "__main__":
    main()
