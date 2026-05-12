
import sys
import io

# Provide input data via stdin
sys.stdin = io.StringIO("{\"predictions\":[{\"id\":\"mpred_1773908003352_p30sxr\",\"confidence\":\"0.790000\",\"was_correct\":true},{\"id\":\"mpred_1773908003351_jv8ab1\",\"confidence\":\"0.850000\",\"was_correct\":false},{\"id\":\"mpred_1773908003348_5udqc6\",\"confidence\":\"0.820000\",\"was_correct\":true},{\"id\":\"mpred_1773908003354_plpa6j\",\"confidence\":\"0.620000\",\"was_correct\":false},{\"id\":\"mpred_1773908003356_nr5w6n\",\"confidence\":\"0.760000\",\"was_correct\":true},{\"id\":\"mpred_1773908003356_p31irm\",\"confidence\":\"0.740000\",\"was_correct\":false}],\"n_bins\":10}")

"""
Confidence Calibration Analysis
Input JSON: { "predictions": [{ "stated_confidence": float (0-1), "actual_outcome": bool }], "num_buckets": int (default 10) }
Output JSON: { "buckets": [...], "calibration_error": float (ECE), "max_calibration_error": float (MCE), "reliability_diagram_data": [...], "overconfident_pct": float }
"""
import json, sys, math

def main():
    data = json.loads(sys.stdin.read())
    predictions = data.get("predictions", [])
    num_buckets = int(data.get("num_buckets", 10))

    if len(predictions) < 1:
        print(json.dumps({"error": "Need at least 1 prediction"}))
        return

    if num_buckets < 2 or num_buckets > 100:
        print(json.dumps({"error": "num_buckets must be between 2 and 100"}))
        return

    # Parse
    parsed = []
    for p in predictions:
        if "stated_confidence" not in p or "actual_outcome" not in p:
            print(json.dumps({"error": "Each prediction needs stated_confidence and actual_outcome"}))
            return
        conf = float(p["stated_confidence"])
        outcome = bool(p["actual_outcome"])
        if not (0 <= conf <= 1):
            print(json.dumps({"error": "stated_confidence must be between 0 and 1"}))
            return
        parsed.append({"confidence": conf, "outcome": outcome})

    n = len(parsed)

    # Build calibration buckets
    buckets = []
    overconfident_count = 0
    underconfident_count = 0

    for b in range(num_buckets):
        lower = b / num_buckets
        upper = (b + 1) / num_buckets

        in_bucket = [p for p in parsed if lower <= p["confidence"] < upper
                     or (b == num_buckets - 1 and p["confidence"] == 1.0)]

        if not in_bucket:
            buckets.append({
                "range_lower": round(lower, 4),
                "range_upper": round(upper, 4),
                "count": 0,
                "avg_confidence": 0.0,
                "actual_frequency": 0.0,
                "calibration_gap": 0.0,
            })
            continue

        avg_conf = sum(p["confidence"] for p in in_bucket) / len(in_bucket)
        actual_freq = sum(1 for p in in_bucket if p["outcome"]) / len(in_bucket)
        gap = avg_conf - actual_freq

        if gap > 0.01:
            overconfident_count += len(in_bucket)
        elif gap < -0.01:
            underconfident_count += len(in_bucket)

        buckets.append({
            "range_lower": round(lower, 4),
            "range_upper": round(upper, 4),
            "count": len(in_bucket),
            "avg_confidence": round(avg_conf, 6),
            "actual_frequency": round(actual_freq, 6),
            "calibration_gap": round(gap, 6),
        })

    # ECE: Expected Calibration Error (weighted average of bucket errors)
    ece = sum(abs(b["calibration_gap"]) * b["count"] for b in buckets) / n

    # MCE: Maximum Calibration Error
    mce = max(abs(b["calibration_gap"]) for b in buckets) if buckets else 0.0

    # Reliability diagram data
    reliability = [
        {
            "bin_center": round((b["range_lower"] + b["range_upper"]) / 2, 4),
            "avg_confidence": b["avg_confidence"],
            "actual_frequency": b["actual_frequency"],
            "count": b["count"],
        }
        for b in buckets if b["count"] > 0
    ]

    overconfident_pct = overconfident_count / n if n > 0 else 0.0
    overall_accuracy = sum(1 for p in parsed if p["outcome"]) / n
    avg_confidence = sum(p["confidence"] for p in parsed) / n

    print(json.dumps({
        "buckets": buckets,
        "calibration_error": round(ece, 6),
        "max_calibration_error": round(mce, 6),
        "reliability_diagram_data": reliability,
        "overconfident_pct": round(overconfident_pct, 4),
        "underconfident_pct": round(underconfident_count / n if n > 0 else 0, 4),
        "overall_accuracy": round(overall_accuracy, 6),
        "avg_stated_confidence": round(avg_confidence, 6),
        "sample_size": n,
        "num_buckets": num_buckets,
    }))

if __name__ == "__main__":
    main()

