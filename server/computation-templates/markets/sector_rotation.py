"""
Sector Rotation Analysis
Input JSON: { "sectors": { "Technology": [float], "Healthcare": [float], ... }, "window": int (default 20) }
Output JSON: { "momentum": { sector: float }, "ranking": [{ sector, momentum, trend }], "rotation_signal": string }
"""
import json, sys, math

def compute_momentum(prices, window):
    if len(prices) < window + 1:
        return 0.0
    recent = prices[-1]
    past = prices[-(window+1)]
    return (recent - past) / past if past > 0 else 0.0

def main():
    data = json.loads(sys.stdin.read())
    sectors = data.get("sectors", {})
    window = int(data.get("window", 20))

    if len(sectors) < 2:
        print(json.dumps({"error": "Need at least 2 sectors"}))
        return

    momentum = {}
    for name, prices in sectors.items():
        prices = [float(p) for p in prices]
        momentum[name] = round(compute_momentum(prices, window), 8)

    ranking = sorted(
        [{"sector": s, "momentum": m, "trend": "up" if m > 0.02 else "down" if m < -0.02 else "flat"}
         for s, m in momentum.items()],
        key=lambda x: x["momentum"], reverse=True
    )

    # Rotation signal based on sector breadth
    up_count = sum(1 for r in ranking if r["trend"] == "up")
    total = len(ranking)
    breadth = up_count / total if total > 0 else 0

    if breadth >= 0.7:
        signal = "broad_rally"
    elif breadth <= 0.3:
        signal = "broad_selloff"
    else:
        signal = "rotation"

    print(json.dumps({
        "momentum": momentum,
        "ranking": ranking,
        "rotation_signal": signal,
        "breadth": round(breadth, 4),
        "window": window,
        "leader": ranking[0]["sector"] if ranking else None,
        "laggard": ranking[-1]["sector"] if ranking else None,
    }))

if __name__ == "__main__":
    main()
