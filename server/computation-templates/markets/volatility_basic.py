"""
Basic Volatility Calculator
Computes historical volatility (standard deviation of returns), annualized.
Input JSON: { "prices": [float], "period": "daily"|"weekly"|"monthly", "window": int (optional) }
Output JSON: { "volatility": float, "annualized_volatility": float, "rolling_volatility": [float] }
"""
import json
import sys
import math

def std_dev(values):
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    variance = sum((x - mean) ** 2 for x in values) / (len(values) - 1)
    return math.sqrt(variance)

def main():
    data = json.loads(sys.stdin.read())
    prices = [float(p) for p in data.get("prices", [])]
    period = data.get("period", "daily")
    window = int(data.get("window", 20))

    if len(prices) < 2:
        print(json.dumps({"error": "Need at least 2 prices"}))
        return

    # Compute log returns
    returns = []
    for i in range(1, len(prices)):
        if prices[i - 1] > 0 and prices[i] > 0:
            returns.append(math.log(prices[i] / prices[i - 1]))
        else:
            returns.append(0.0)

    periods_per_year = {"daily": 252, "weekly": 52, "monthly": 12}.get(period, 252)

    # Overall volatility
    vol = std_dev(returns)
    annualized_vol = vol * math.sqrt(periods_per_year)

    # Rolling volatility
    rolling_vol = []
    for i in range(window, len(returns) + 1):
        window_returns = returns[i - window:i]
        rv = std_dev(window_returns) * math.sqrt(periods_per_year)
        rolling_vol.append(round(rv, 8))

    # Max and min rolling vol
    max_vol = max(rolling_vol) if rolling_vol else annualized_vol
    min_vol = min(rolling_vol) if rolling_vol else annualized_vol

    result = {
        "volatility": round(vol, 8),
        "annualized_volatility": round(annualized_vol, 8),
        "rolling_volatility": rolling_vol,
        "rolling_window": window,
        "max_rolling_vol": round(max_vol, 8),
        "min_rolling_vol": round(min_vol, 8),
        "num_returns": len(returns),
        "period": period,
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
