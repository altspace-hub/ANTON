"""
Sortino Ratio Calculator
Input JSON: { "returns": [float], "risk_free_rate": float (annualized, default 0.04), "period": "daily"|"weekly"|"monthly" }
Output JSON: { "sortino_ratio": float, "annualized_return": float, "downside_deviation": float, "excess_return": float }
"""
import json, sys, math

def main():
    data = json.loads(sys.stdin.read())
    returns = [float(r) for r in data.get("returns", [])]
    risk_free = float(data.get("risk_free_rate", 0.04))
    period = data.get("period", "daily")

    if len(returns) < 2:
        print(json.dumps({"error": "Need at least 2 returns"}))
        return

    ppy = {"daily": 252, "weekly": 52, "monthly": 12}.get(period, 252)
    target_return = risk_free / ppy

    mean_r = sum(returns) / len(returns)

    # Downside deviation: only consider returns below target
    downside_diffs = [(r - target_return) ** 2 for r in returns if r < target_return]
    if len(downside_diffs) == 0:
        downside_dev = 0.0
    else:
        downside_dev = math.sqrt(sum(downside_diffs) / len(downside_diffs))

    ann_return = mean_r * ppy
    ann_downside = downside_dev * math.sqrt(ppy)
    excess = ann_return - risk_free

    sortino = excess / ann_downside if ann_downside > 0 else 0.0

    # Additional stats
    negative_returns = [r for r in returns if r < 0]
    pct_negative = len(negative_returns) / len(returns) if returns else 0

    print(json.dumps({
        "sortino_ratio": round(sortino, 6),
        "annualized_return": round(ann_return, 8),
        "downside_deviation": round(ann_downside, 8),
        "excess_return": round(excess, 8),
        "risk_free_rate": risk_free,
        "pct_negative_periods": round(pct_negative, 4),
        "num_periods": len(returns),
        "num_downside_periods": len(downside_diffs),
    }))

if __name__ == "__main__":
    main()
