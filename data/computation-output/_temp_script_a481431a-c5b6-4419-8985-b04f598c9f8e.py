
import sys
import io

# Provide input data via stdin
sys.stdin = io.StringIO("{\"predictions\":[{\"id\":\"mpred_1773908003352_p30sxr\",\"confidence\":\"0.790000\",\"was_correct\":true,\"brier_score\":\"0.044000\",\"prediction_type\":\"price_target\"},{\"id\":\"mpred_1773908003351_jv8ab1\",\"confidence\":\"0.850000\",\"was_correct\":false,\"brier_score\":\"0.722000\",\"prediction_type\":\"price_target\"},{\"id\":\"mpred_1773908003348_5udqc6\",\"confidence\":\"0.820000\",\"was_correct\":true,\"brier_score\":\"0.032000\",\"prediction_type\":\"directional\"},{\"id\":\"mpred_1773908003354_plpa6j\",\"confidence\":\"0.620000\",\"was_correct\":false,\"brier_score\":\"0.384000\",\"prediction_type\":\"price_target\"},{\"id\":\"mpred_1773908003356_nr5w6n\",\"confidence\":\"0.760000\",\"was_correct\":true,\"brier_score\":\"0.068000\",\"prediction_type\":\"directional\"},{\"id\":\"mpred_1773908003356_p31irm\",\"confidence\":\"0.740000\",\"was_correct\":false,\"brier_score\":\"0.548000\",\"prediction_type\":\"binary\"},{\"id\":\"mpred_1774258508201_egqh7l\",\"confidence\":\"0.780000\",\"was_correct\":false,\"brier_score\":\"0.608400\",\"prediction_type\":\"binary\"},{\"id\":\"mpred_1774602957477_9xe6gv\",\"confidence\":\"0.697000\",\"was_correct\":false,\"brier_score\":\"0.485809\",\"prediction_type\":\"directional\"},{\"id\":\"mpred_1774602957468_89qx76\",\"confidence\":\"0.748000\",\"was_correct\":false,\"brier_score\":\"0.559504\",\"prediction_type\":\"directional\"},{\"id\":\"mpred_1774602957508_vehiq7\",\"confidence\":\"0.365000\",\"was_correct\":false,\"brier_score\":\"0.133225\",\"prediction_type\":\"directional\"},{\"id\":\"mpred_1774602957514_h8tm2a\",\"confidence\":\"0.360000\",\"was_correct\":false,\"brier_score\":\"0.129600\",\"prediction_type\":\"directional\"},{\"id\":\"mpred_1774602957502_ii96d7\",\"confidence\":\"0.592500\",\"was_correct\":true,\"brier_score\":\"0.166056\",\"prediction_type\":\"directional\"},{\"id\":\"mpred_1774602957495_w56n83\",\"confidence\":\"0.442000\",\"was_correct\":true,\"brier_score\":\"0.311364\",\"prediction_type\":\"directional\"},{\"id\":\"mpred_1774602957517_y0ql09\",\"confidence\":\"0.640000\",\"was_correct\":false,\"brier_score\":\"0.409600\",\"prediction_type\":\"binary\"},{\"id\":\"mpred_1774602957486_4sncks\",\"confidence\":\"0.532500\",\"was_correct\":true,\"brier_score\":\"0.218556\",\"prediction_type\":\"directional\"}]}")

"""
Prediction Accuracy Statistics
Input JSON: { "predictions": [{ "confidence": float (0-1), "was_correct": bool }] }
Output JSON: { "accuracy_rate": float, "brier_score": float, "calibration_buckets": [...], "overconfidence_index": float, "sample_size": int }
"""
import json, sys, math

def main():
    data = json.loads(sys.stdin.read())
    predictions = data.get("predictions", [])

    if len(predictions) < 1:
        print(json.dumps({"error": "Need at least 1 prediction"}))
        return

    # Parse and validate
    parsed = []
    for p in predictions:
        if "confidence" not in p or "was_correct" not in p:
            print(json.dumps({"error": "Each prediction needs confidence and was_correct"}))
            return
        conf = float(p["confidence"])
        correct = bool(p["was_correct"])
        if not (0 <= conf <= 1):
            print(json.dumps({"error": "Confidence must be between 0 and 1"}))
            return
        parsed.append({"confidence": conf, "was_correct": correct})

    n = len(parsed)

    # Overall accuracy
    correct_count = sum(1 for p in parsed if p["was_correct"])
    accuracy_rate = correct_count / n

    # Brier score: mean squared error between confidence and outcome
    brier = sum((p["confidence"] - (1.0 if p["was_correct"] else 0.0)) ** 2 for p in parsed) / n

    # Calibration buckets (10 buckets: 0-0.1, 0.1-0.2, ..., 0.9-1.0)
    num_buckets = 10
    buckets = []
    overconfidence_sum = 0.0
    overconfidence_count = 0

    for b in range(num_buckets):
        lower = b / num_buckets
        upper = (b + 1) / num_buckets

        in_bucket = [p for p in parsed if lower <= p["confidence"] < upper or (b == num_buckets - 1 and p["confidence"] == 1.0 and lower <= p["confidence"])]

        if not in_bucket:
            buckets.append({
                "range": f"{lower:.1f}-{upper:.1f}",
                "count": 0,
                "avg_confidence": 0.0,
                "actual_accuracy": 0.0,
                "calibration_error": 0.0,
            })
            continue

        avg_conf = sum(p["confidence"] for p in in_bucket) / len(in_bucket)
        actual_acc = sum(1 for p in in_bucket if p["was_correct"]) / len(in_bucket)
        cal_error = avg_conf - actual_acc

        if cal_error > 0:
            overconfidence_sum += cal_error * len(in_bucket)
            overconfidence_count += len(in_bucket)

        buckets.append({
            "range": f"{lower:.1f}-{upper:.1f}",
            "count": len(in_bucket),
            "avg_confidence": round(avg_conf, 4),
            "actual_accuracy": round(actual_acc, 4),
            "calibration_error": round(cal_error, 4),
        })

    # Expected Calibration Error (ECE)
    ece = sum(abs(b["calibration_error"]) * b["count"] for b in buckets) / n

    # Max Calibration Error (MCE)
    mce = max(abs(b["calibration_error"]) for b in buckets) if buckets else 0.0

    # Overconfidence index
    overconfidence_idx = overconfidence_sum / n if n > 0 else 0.0

    # Reliability diagram data (for visualization)
    reliability_data = [
        {"bin_center": round((b + 0.5) / num_buckets, 2), "accuracy": bk["actual_accuracy"], "count": bk["count"]}
        for b, bk in enumerate(buckets) if bk["count"] > 0
    ]

    print(json.dumps({
        "accuracy_rate": round(accuracy_rate, 6),
        "brier_score": round(brier, 6),
        "calibration_buckets": buckets,
        "ece": round(ece, 6),
        "mce": round(mce, 6),
        "overconfidence_index": round(overconfidence_idx, 6),
        "reliability_diagram_data": reliability_data,
        "sample_size": n,
        "correct_count": correct_count,
    }))

if __name__ == "__main__":
    main()

