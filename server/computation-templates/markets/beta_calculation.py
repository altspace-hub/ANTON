"""
Beta Calculation
Input JSON: { "asset_prices": [float], "benchmark_prices": [float], "period": "daily"|"weekly"|"monthly" }
Output JSON: { "beta": float, "alpha": float, "r_squared": float, "correlation": float }
"""
import json, sys, math

def log_returns(prices):
    return [math.log(prices[i] / prices[i-1]) for i in range(1, len(prices)) if prices[i-1] > 0 and prices[i] > 0]

def main():
    data = json.loads(sys.stdin.read())
    asset = [float(p) for p in data.get("asset_prices", [])]
    bench = [float(p) for p in data.get("benchmark_prices", [])]

    if len(asset) < 3 or len(bench) < 3:
        print(json.dumps({"error": "Need at least 3 prices for each series"}))
        return

    ar = log_returns(asset)
    br = log_returns(bench)
    n = min(len(ar), len(br))
    ar, br = ar[:n], br[:n]

    mean_a = sum(ar) / n
    mean_b = sum(br) / n

    cov = sum((ar[i] - mean_a) * (br[i] - mean_b) for i in range(n)) / (n - 1)
    var_b = sum((br[i] - mean_b) ** 2 for i in range(n)) / (n - 1)
    var_a = sum((ar[i] - mean_a) ** 2 for i in range(n)) / (n - 1)

    beta = cov / var_b if var_b > 0 else 0.0
    alpha = mean_a - beta * mean_b

    # R-squared
    ss_res = sum((ar[i] - (alpha + beta * br[i])) ** 2 for i in range(n))
    ss_tot = sum((ar[i] - mean_a) ** 2 for i in range(n))
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

    # Correlation
    std_a = math.sqrt(var_a) if var_a > 0 else 0
    std_b = math.sqrt(var_b) if var_b > 0 else 0
    corr = cov / (std_a * std_b) if std_a > 0 and std_b > 0 else 0.0

    ppy = {"daily": 252, "weekly": 52, "monthly": 12}.get(data.get("period", "daily"), 252)

    print(json.dumps({
        "beta": round(beta, 6),
        "alpha_periodic": round(alpha, 8),
        "alpha_annualized": round(alpha * ppy, 8),
        "r_squared": round(r_squared, 6),
        "correlation": round(corr, 6),
        "num_periods": n,
    }))

if __name__ == "__main__":
    main()
