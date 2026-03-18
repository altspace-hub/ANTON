"""
Rolling Correlation Calculator
Input JSON: { "series_a": [float], "series_b": [float], "window": int (default 20) }
Output JSON: { "correlations": [float], "current_correlation": float, "average": float, "trend": str, "stability": float }
"""
import json, sys, math

def pearson_corr(x, y):
    """Compute Pearson correlation between two equal-length lists."""
    n = len(x)
    if n < 2:
        return 0.0
    mx = sum(x) / n
    my = sum(y) / n
    cov = sum((x[i] - mx) * (y[i] - my) for i in range(n))
    sx = math.sqrt(sum((v - mx) ** 2 for v in x))
    sy = math.sqrt(sum((v - my) ** 2 for v in y))
    if sx == 0 or sy == 0:
        return 0.0
    return cov / (sx * sy)

def main():
    data = json.loads(sys.stdin.read())
    series_a = [float(v) for v in data.get("series_a", [])]
    series_b = [float(v) for v in data.get("series_b", [])]
    window = int(data.get("window", 20))

    if len(series_a) != len(series_b):
        print(json.dumps({"error": "series_a and series_b must have equal length"}))
        return

    n = len(series_a)
    if n < window:
        print(json.dumps({"error": f"Need at least {window} data points"}))
        return

    if window < 3:
        print(json.dumps({"error": "Window must be at least 3"}))
        return

    # Compute rolling correlations
    correlations = []
    for i in range(window - 1, n):
        start = i - window + 1
        corr = pearson_corr(series_a[start:i+1], series_b[start:i+1])
        correlations.append(round(corr, 6))

    current = correlations[-1]
    avg = sum(correlations) / len(correlations)

    # Trend: compare recent half to earlier half
    mid = len(correlations) // 2
    if mid > 0:
        first_half_avg = sum(correlations[:mid]) / mid
        second_half_avg = sum(correlations[mid:]) / len(correlations[mid:])
        diff = second_half_avg - first_half_avg
        if diff > 0.05:
            trend = "increasing"
        elif diff < -0.05:
            trend = "decreasing"
        else:
            trend = "stable"
    else:
        trend = "insufficient_data"

    # Stability: standard deviation of correlations (lower = more stable)
    corr_std = math.sqrt(sum((c - avg) ** 2 for c in correlations) / len(correlations))

    # Min / Max
    min_corr = min(correlations)
    max_corr = max(correlations)

    print(json.dumps({
        "correlations": correlations[-60:],
        "current_correlation": round(current, 6),
        "average": round(avg, 6),
        "trend": trend,
        "stability": round(corr_std, 6),
        "min_correlation": round(min_corr, 6),
        "max_correlation": round(max_corr, 6),
        "window": window,
        "num_observations": len(correlations),
    }))

if __name__ == "__main__":
    main()
