"""
Distribution Analysis
Input JSON: { "values": [float] }
Output JSON: { "mean": float, "median": float, "std": float, "skewness": float, "kurtosis": float, "jarque_bera": float, "is_normal": bool, "percentiles": {}, "range": float }
"""
import json, sys, math

def main():
    data = json.loads(sys.stdin.read())
    values = [float(v) for v in data.get("values", [])]

    n = len(values)
    if n < 4:
        print(json.dumps({"error": "Need at least 4 values for distribution analysis"}))
        return

    sorted_vals = sorted(values)

    # Mean
    mean = sum(values) / n

    # Median
    if n % 2 == 0:
        median = (sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2
    else:
        median = sorted_vals[n // 2]

    # Standard deviation (sample)
    variance = sum((v - mean) ** 2 for v in values) / (n - 1)
    std = math.sqrt(variance)

    if std == 0:
        print(json.dumps({"error": "Zero variance in data"}))
        return

    # Skewness (Fisher's)
    m3 = sum((v - mean) ** 3 for v in values) / n
    skewness = m3 / (std ** 3) * (n * n) / ((n - 1) * (n - 2)) if n > 2 else 0.0

    # Excess Kurtosis (Fisher's)
    m4 = sum((v - mean) ** 4 for v in values) / n
    kurt_raw = m4 / (std ** 4)
    kurtosis = ((n + 1) * kurt_raw - 3 * (n - 1)) * (n - 1) / ((n - 2) * (n - 3)) if n > 3 else 0.0

    # Jarque-Bera test
    jb = (n / 6.0) * (skewness ** 2 + (kurtosis ** 2) / 4.0)
    # JB > 5.99 => reject normality at 5%
    is_normal = jb < 5.99

    # Percentiles using linear interpolation
    def percentile(pct):
        k = (pct / 100.0) * (n - 1)
        f = math.floor(k)
        c = math.ceil(k)
        if f == c:
            return sorted_vals[int(k)]
        return sorted_vals[int(f)] * (c - k) + sorted_vals[int(c)] * (k - f)

    percentiles = {
        "1": round(percentile(1), 8),
        "5": round(percentile(5), 8),
        "10": round(percentile(10), 8),
        "25": round(percentile(25), 8),
        "50": round(percentile(50), 8),
        "75": round(percentile(75), 8),
        "90": round(percentile(90), 8),
        "95": round(percentile(95), 8),
        "99": round(percentile(99), 8),
    }

    val_range = sorted_vals[-1] - sorted_vals[0]
    iqr = percentile(75) - percentile(25)

    print(json.dumps({
        "mean": round(mean, 8),
        "median": round(median, 8),
        "std": round(std, 8),
        "variance": round(variance, 8),
        "skewness": round(skewness, 6),
        "kurtosis": round(kurtosis, 6),
        "jarque_bera": round(jb, 4),
        "is_normal": is_normal,
        "percentiles": percentiles,
        "range": round(val_range, 8),
        "iqr": round(iqr, 8),
        "min": round(sorted_vals[0], 8),
        "max": round(sorted_vals[-1], 8),
        "num_observations": n,
    }))

if __name__ == "__main__":
    main()
