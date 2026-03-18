"""
Signal Weight Optimizer
Input JSON: { "signals": [{ "signal_type": str, "weight": float, "outcomes": [{ "predicted": float, "actual": float }] }] }
Output JSON: { "optimized_weights": {}, "improvement_pct": float, "signal_rankings": [...], "drop_candidates": [...] }
"""
import json, sys, math

def compute_rmse(outcomes):
    """Root Mean Squared Error for a signal's predictions."""
    if not outcomes:
        return float('inf')
    n = len(outcomes)
    mse = sum((o["predicted"] - o["actual"]) ** 2 for o in outcomes) / n
    return math.sqrt(mse)

def compute_correlation(outcomes):
    """Pearson correlation between predicted and actual."""
    if len(outcomes) < 2:
        return 0.0
    preds = [o["predicted"] for o in outcomes]
    acts = [o["actual"] for o in outcomes]
    n = len(preds)
    mp = sum(preds) / n
    ma = sum(acts) / n
    cov = sum((preds[i] - mp) * (acts[i] - ma) for i in range(n))
    sp = math.sqrt(sum((p - mp) ** 2 for p in preds))
    sa = math.sqrt(sum((a - ma) ** 2 for a in acts))
    if sp == 0 or sa == 0:
        return 0.0
    return cov / (sp * sa)

def main():
    data = json.loads(sys.stdin.read())
    signals = data.get("signals", [])

    if len(signals) < 1:
        print(json.dumps({"error": "Need at least 1 signal"}))
        return

    # Analyze each signal
    signal_stats = []
    total_original_weight = 0.0

    for s in signals:
        sig_type = str(s.get("signal_type", "unknown"))
        weight = float(s.get("weight", 1.0))
        outcomes = s.get("outcomes", [])

        if not outcomes:
            signal_stats.append({
                "signal_type": sig_type,
                "original_weight": weight,
                "rmse": float('inf'),
                "correlation": 0.0,
                "accuracy_score": 0.0,
                "sample_size": 0,
            })
            total_original_weight += weight
            continue

        parsed_outcomes = [{"predicted": float(o["predicted"]), "actual": float(o["actual"])} for o in outcomes]
        rmse = compute_rmse(parsed_outcomes)
        corr = compute_correlation(parsed_outcomes)

        # Accuracy score: combination of low RMSE and high correlation
        # Normalize: score from 0-1
        accuracy_score = max(0, corr) * (1.0 / (1.0 + rmse))

        signal_stats.append({
            "signal_type": sig_type,
            "original_weight": weight,
            "rmse": round(rmse, 6),
            "correlation": round(corr, 6),
            "accuracy_score": round(accuracy_score, 6),
            "sample_size": len(parsed_outcomes),
        })
        total_original_weight += weight

    # Optimize weights proportional to accuracy score
    total_score = sum(s["accuracy_score"] for s in signal_stats)
    optimized_weights = {}
    signal_rankings = []

    for s in signal_stats:
        if total_score > 0:
            new_weight = s["accuracy_score"] / total_score
        else:
            new_weight = 1.0 / len(signal_stats)

        optimized_weights[s["signal_type"]] = round(new_weight, 6)
        signal_rankings.append({
            "signal_type": s["signal_type"],
            "original_weight": round(s["original_weight"], 6),
            "optimized_weight": round(new_weight, 6),
            "accuracy_score": s["accuracy_score"],
            "correlation": s["correlation"],
            "rmse": s["rmse"],
            "sample_size": s["sample_size"],
        })

    # Sort rankings by accuracy score descending
    signal_rankings.sort(key=lambda x: x["accuracy_score"], reverse=True)

    # Drop candidates: signals with very low accuracy or negative correlation
    drop_candidates = [
        {"signal_type": s["signal_type"], "reason": "negative_correlation" if s["correlation"] < 0 else "low_accuracy", "accuracy_score": s["accuracy_score"]}
        for s in signal_stats
        if s["accuracy_score"] < 0.01 or s["correlation"] < 0
    ]

    # Compute improvement: compare weighted RMSE before and after
    original_weighted_rmse = sum(s["original_weight"] * s["rmse"] for s in signal_stats if s["rmse"] != float('inf'))
    optimized_weighted_rmse = sum(optimized_weights.get(s["signal_type"], 0) * s["rmse"] for s in signal_stats if s["rmse"] != float('inf'))

    if original_weighted_rmse > 0:
        improvement_pct = ((original_weighted_rmse - optimized_weighted_rmse) / original_weighted_rmse) * 100
    else:
        improvement_pct = 0.0

    print(json.dumps({
        "optimized_weights": optimized_weights,
        "improvement_pct": round(improvement_pct, 4),
        "signal_rankings": signal_rankings,
        "drop_candidates": drop_candidates,
        "total_signals": len(signals),
    }))

if __name__ == "__main__":
    main()
