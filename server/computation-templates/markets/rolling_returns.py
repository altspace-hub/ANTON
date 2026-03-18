"""
Rolling Returns Calculator
Input JSON: { "prices": [float], "windows": [int] (default [5, 20, 60, 252]) }
Output JSON: { "rolling_returns": { window: { "current": float, "average": float, "min": float, "max": float, "cagr": float } } }
"""
import json, sys, math

def main():
    data = json.loads(sys.stdin.read())
    prices = [float(p) for p in data.get("prices", [])]
    windows = [int(w) for w in data.get("windows", [5, 20, 60, 252])]

    if len(prices) < 2:
        print(json.dumps({"error": "Need at least 2 prices"}))
        return

    if not windows:
        print(json.dumps({"error": "Need at least 1 window"}))
        return

    result = {}

    for w in windows:
        if w < 1:
            continue
        if len(prices) < w + 1:
            result[str(w)] = {"error": f"Need at least {w + 1} prices for window {w}"}
            continue

        # Compute rolling returns for this window
        rolling = []
        for i in range(w, len(prices)):
            prev = prices[i - w]
            if prev > 0:
                rolling.append((prices[i] - prev) / prev)
            else:
                rolling.append(0.0)

        if not rolling:
            result[str(w)] = {"error": "No rolling returns computed"}
            continue

        current = rolling[-1]
        avg = sum(rolling) / len(rolling)
        min_r = min(rolling)
        max_r = max(rolling)

        # CAGR: annualized return from first to last price
        first_p = prices[0]
        last_p = prices[-1]
        n_periods = len(prices) - 1
        if first_p > 0 and n_periods > 0:
            total_return = last_p / first_p
            if total_return > 0:
                cagr = math.pow(total_return, 252.0 / n_periods) - 1
            else:
                cagr = 0.0
        else:
            cagr = 0.0

        # Count positive and negative periods
        pos = sum(1 for r in rolling if r > 0)
        neg = sum(1 for r in rolling if r < 0)

        result[str(w)] = {
            "current": round(current, 8),
            "average": round(avg, 8),
            "min": round(min_r, 8),
            "max": round(max_r, 8),
            "cagr": round(cagr, 8),
            "positive_periods": pos,
            "negative_periods": neg,
            "total_periods": len(rolling),
        }

    print(json.dumps({
        "rolling_returns": result,
        "num_prices": len(prices),
        "windows_analyzed": [w for w in windows if str(w) in result],
    }))

if __name__ == "__main__":
    main()
