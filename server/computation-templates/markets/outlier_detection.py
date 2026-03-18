"""
Outlier Detection
Input JSON: { "values": [float], "method": "zscore"|"iqr" (default "zscore"), "threshold": float (default 2.5 for zscore, 1.5 for iqr) }
Output JSON: { "outliers": [{ "index": int, "value": float, "score": float }], "outlier_count": int, "clean_mean": float, "clean_std": float, "upper_bound": float, "lower_bound": float }
"""
import json, sys, math

def main():
    data = json.loads(sys.stdin.read())
    values = [float(v) for v in data.get("values", [])]
    method = data.get("method", "zscore")
    threshold = data.get("threshold", None)

    n = len(values)
    if n < 3:
        print(json.dumps({"error": "Need at least 3 values"}))
        return

    if method not in ("zscore", "iqr"):
        print(json.dumps({"error": "Method must be 'zscore' or 'iqr'"}))
        return

    outliers = []
    upper_bound = 0.0
    lower_bound = 0.0

    if method == "zscore":
        thresh = float(threshold) if threshold is not None else 2.5
        mean = sum(values) / n
        std = math.sqrt(sum((v - mean) ** 2 for v in values) / (n - 1))

        if std == 0:
            print(json.dumps({"error": "Zero standard deviation — all values identical"}))
            return

        upper_bound = mean + thresh * std
        lower_bound = mean - thresh * std

        for i, v in enumerate(values):
            z = (v - mean) / std
            if abs(z) > thresh:
                outliers.append({"index": i, "value": round(v, 8), "score": round(z, 6)})

    elif method == "iqr":
        thresh = float(threshold) if threshold is not None else 1.5
        sorted_vals = sorted(values)

        # Quartiles
        def percentile(pct):
            k = (pct / 100.0) * (n - 1)
            f = int(math.floor(k))
            c = int(math.ceil(k))
            if f == c:
                return sorted_vals[f]
            return sorted_vals[f] * (c - k) + sorted_vals[c] * (k - f)

        q1 = percentile(25)
        q3 = percentile(75)
        iqr = q3 - q1

        lower_bound = q1 - thresh * iqr
        upper_bound = q3 + thresh * iqr

        for i, v in enumerate(values):
            if v < lower_bound or v > upper_bound:
                score = (v - q3) / iqr if v > q3 and iqr > 0 else (q1 - v) / iqr if v < q1 and iqr > 0 else 0
                outliers.append({"index": i, "value": round(v, 8), "score": round(score, 6)})

    # Clean dataset (without outliers)
    outlier_indices = set(o["index"] for o in outliers)
    clean = [v for i, v in enumerate(values) if i not in outlier_indices]

    if len(clean) > 0:
        clean_mean = sum(clean) / len(clean)
        clean_std = math.sqrt(sum((v - clean_mean) ** 2 for v in clean) / max(len(clean) - 1, 1))
    else:
        clean_mean = 0.0
        clean_std = 0.0

    pct_outliers = len(outliers) / n if n > 0 else 0

    print(json.dumps({
        "outliers": outliers,
        "outlier_count": len(outliers),
        "outlier_pct": round(pct_outliers, 6),
        "clean_mean": round(clean_mean, 8),
        "clean_std": round(clean_std, 8),
        "upper_bound": round(upper_bound, 8),
        "lower_bound": round(lower_bound, 8),
        "method": method,
        "threshold": thresh if method == "zscore" else thresh,
        "total_values": n,
        "clean_count": len(clean),
    }))

if __name__ == "__main__":
    main()
