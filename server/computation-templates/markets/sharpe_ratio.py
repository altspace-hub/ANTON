"""
Sharpe Ratio Calculator
Input JSON: { "returns": [float], "risk_free_rate": float (annualized, default 0.04), "period": "daily"|"weekly"|"monthly" }
Output JSON: { "sharpe_ratio": float, "annualized_return": float, "annualized_volatility": float, "excess_return": float }
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
    mean_r = sum(returns) / len(returns)
    std_r = math.sqrt(sum((r - mean_r) ** 2 for r in returns) / (len(returns) - 1))

    ann_return = mean_r * ppy
    ann_vol = std_r * math.sqrt(ppy)
    excess = ann_return - risk_free
    sharpe = excess / ann_vol if ann_vol > 0 else 0.0

    print(json.dumps({
        "sharpe_ratio": round(sharpe, 6),
        "annualized_return": round(ann_return, 8),
        "annualized_volatility": round(ann_vol, 8),
        "excess_return": round(excess, 8),
        "risk_free_rate": risk_free,
        "num_periods": len(returns),
    }))

if __name__ == "__main__":
    main()
