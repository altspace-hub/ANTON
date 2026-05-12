
import sys
import io

# Provide input data via stdin
sys.stdin = io.StringIO("{\"prices\":[],\"sectors\":{}}")

"""
Sector Rotation Analysis with Relative Strength
Input JSON: { "sectors": { "name": [float (prices)] }, "benchmark_prices": [float], "window": int (default 20) }
Output JSON: { "absolute_momentum": {}, "relative_strength": {}, "rotation_matrix": [...], "regime": str, "recommended_overweight": [...], "recommended_underweight": [...] }
"""
import json, sys, math

def compute_return(prices, window):
    """Compute return over a window."""
    if len(prices) < window + 1:
        return 0.0
    past = prices[-(window + 1)]
    current = prices[-1]
    return (current - past) / past if past > 0 else 0.0

def compute_volatility(prices, window):
    """Compute annualized volatility."""
    if len(prices) < window + 1:
        return 0.0
    returns = [(prices[i] - prices[i-1]) / prices[i-1] for i in range(max(1, len(prices) - window), len(prices)) if prices[i-1] > 0]
    if len(returns) < 2:
        return 0.0
    mean_r = sum(returns) / len(returns)
    var_r = sum((r - mean_r) ** 2 for r in returns) / (len(returns) - 1)
    return math.sqrt(var_r * 252)

def main():
    data = json.loads(sys.stdin.read())
    sectors = data.get("sectors", {})
    benchmark = [float(p) for p in data.get("benchmark_prices", [])]
    window = int(data.get("window", 20))

    if len(sectors) < 2:
        print(json.dumps({"error": "Need at least 2 sectors"}))
        return

    if len(benchmark) < window + 1:
        print(json.dumps({"error": f"Need at least {window + 1} benchmark prices"}))
        return

    benchmark_return = compute_return(benchmark, window)
    benchmark_vol = compute_volatility(benchmark, window)

    absolute_momentum = {}
    relative_strength = {}
    rotation_matrix = []

    for name, prices in sectors.items():
        prices = [float(p) for p in prices]
        if len(prices) < window + 1:
            continue

        # Absolute momentum
        sector_return = compute_return(prices, window)
        sector_vol = compute_volatility(prices, window)
        absolute_momentum[name] = round(sector_return, 8)

        # Relative strength vs benchmark
        rs = sector_return - benchmark_return
        relative_strength[name] = round(rs, 8)

        # Determine quadrant (relative momentum vs momentum trend)
        short_return = compute_return(prices, max(window // 4, 1))
        trend = "improving" if short_return > sector_return else "weakening"

        if rs > 0 and trend == "improving":
            quadrant = "leading"
        elif rs > 0 and trend == "weakening":
            quadrant = "weakening"
        elif rs < 0 and trend == "improving":
            quadrant = "improving"
        else:
            quadrant = "lagging"

        rotation_matrix.append({
            "sector": name,
            "absolute_return": round(sector_return, 6),
            "relative_strength": round(rs, 6),
            "volatility": round(sector_vol, 6),
            "quadrant": quadrant,
            "trend": trend,
        })

    # Sort by relative strength
    rotation_matrix.sort(key=lambda x: x["relative_strength"], reverse=True)

    # Determine regime
    positive_rs = sum(1 for r in rotation_matrix if r["relative_strength"] > 0)
    total = len(rotation_matrix)
    breadth = positive_rs / total if total > 0 else 0

    if benchmark_return > 0.02 and breadth > 0.6:
        regime = "risk_on"
    elif benchmark_return < -0.02 and breadth < 0.4:
        regime = "risk_off"
    else:
        regime = "rotation"

    # Recommendations
    overweight = [r["sector"] for r in rotation_matrix if r["quadrant"] in ("leading", "improving")][:5]
    underweight = [r["sector"] for r in rotation_matrix if r["quadrant"] in ("lagging", "weakening")][:5]

    # Dispersion: std of sector returns
    all_returns = list(absolute_momentum.values())
    if len(all_returns) > 1:
        mean_ret = sum(all_returns) / len(all_returns)
        dispersion = math.sqrt(sum((r - mean_ret) ** 2 for r in all_returns) / (len(all_returns) - 1))
    else:
        dispersion = 0.0

    print(json.dumps({
        "absolute_momentum": absolute_momentum,
        "relative_strength": relative_strength,
        "rotation_matrix": rotation_matrix,
        "regime": regime,
        "recommended_overweight": overweight,
        "recommended_underweight": underweight,
        "benchmark_return": round(benchmark_return, 8),
        "benchmark_volatility": round(benchmark_vol, 8),
        "breadth": round(breadth, 4),
        "dispersion": round(dispersion, 6),
        "window": window,
        "num_sectors": total,
    }))

if __name__ == "__main__":
    main()

