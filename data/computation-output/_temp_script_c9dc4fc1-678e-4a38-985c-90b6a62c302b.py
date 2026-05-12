
import sys
import io

# Provide input data via stdin
sys.stdin = io.StringIO("{\"prices\":[]}")

"""
Drawdown Analysis
Input JSON: { "prices": [float] }
Output JSON: { "max_drawdown": float, "max_drawdown_start": int, "max_drawdown_end": int, "current_drawdown": float, "drawdown_series": [float] }
"""
import json, sys

def main():
    data = json.loads(sys.stdin.read())
    prices = [float(p) for p in data.get("prices", [])]

    if len(prices) < 2:
        print(json.dumps({"error": "Need at least 2 prices"}))
        return

    peak = prices[0]
    max_dd = 0.0
    dd_start = 0
    dd_end = 0
    peak_idx = 0
    drawdowns = []

    for i, price in enumerate(prices):
        if price > peak:
            peak = price
            peak_idx = i
        dd = (peak - price) / peak if peak > 0 else 0.0
        drawdowns.append(round(-dd, 8))
        if dd > max_dd:
            max_dd = dd
            dd_start = peak_idx
            dd_end = i

    current_dd = (peak - prices[-1]) / peak if peak > 0 else 0.0

    # Recovery periods
    recovery_count = 0
    in_dd = False
    for dd in drawdowns:
        if dd < -0.01 and not in_dd:
            in_dd = True
        elif dd >= -0.001 and in_dd:
            in_dd = False
            recovery_count += 1

    print(json.dumps({
        "max_drawdown": round(-max_dd, 8),
        "max_drawdown_pct": round(max_dd * 100, 4),
        "max_drawdown_start_idx": dd_start,
        "max_drawdown_end_idx": dd_end,
        "current_drawdown": round(-current_dd, 8),
        "recovery_count": recovery_count,
        "drawdown_series": drawdowns,
        "num_prices": len(prices),
    }))

if __name__ == "__main__":
    main()

