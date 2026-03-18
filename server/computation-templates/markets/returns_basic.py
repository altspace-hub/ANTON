"""
Basic Returns Calculator
Computes simple and log returns from a price series.
Input JSON: { "prices": [float], "labels": [str] (optional), "period": "daily"|"weekly"|"monthly" }
Output JSON: { "simple_returns": [float], "log_returns": [float], "cumulative_return": float, "annualized_return": float }
"""
import json
import sys
import math

def main():
    data = json.loads(sys.stdin.read())
    prices = [float(p) for p in data.get("prices", [])]
    period = data.get("period", "daily")

    if len(prices) < 2:
        print(json.dumps({"error": "Need at least 2 prices"}))
        return

    # Simple returns
    simple_returns = []
    for i in range(1, len(prices)):
        if prices[i - 1] != 0:
            simple_returns.append((prices[i] - prices[i - 1]) / prices[i - 1])
        else:
            simple_returns.append(0.0)

    # Log returns
    log_returns = []
    for i in range(1, len(prices)):
        if prices[i - 1] > 0 and prices[i] > 0:
            log_returns.append(math.log(prices[i] / prices[i - 1]))
        else:
            log_returns.append(0.0)

    # Cumulative return
    cumulative_return = (prices[-1] - prices[0]) / prices[0] if prices[0] != 0 else 0.0

    # Annualized return
    periods_per_year = {"daily": 252, "weekly": 52, "monthly": 12}.get(period, 252)
    n = len(simple_returns)
    if n > 0 and cumulative_return > -1:
        annualized_return = (1 + cumulative_return) ** (periods_per_year / n) - 1
    else:
        annualized_return = 0.0

    # Mean return
    mean_return = sum(simple_returns) / len(simple_returns) if simple_returns else 0.0

    result = {
        "simple_returns": [round(r, 8) for r in simple_returns],
        "log_returns": [round(r, 8) for r in log_returns],
        "cumulative_return": round(cumulative_return, 8),
        "annualized_return": round(annualized_return, 8),
        "mean_return": round(mean_return, 8),
        "num_periods": n,
        "period": period,
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
