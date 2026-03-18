"""
Position Attribution Analysis
Input JSON: { "positions": [{ "symbol": str, "weight": float, "return": float }], "benchmark_return": float }
Output JSON: { "total_return": float, "active_return": float, "contributions": [...], "top_contributors": [...], "bottom_contributors": [...] }
"""
import json, sys

def main():
    data = json.loads(sys.stdin.read())
    positions = data.get("positions", [])
    benchmark_return = float(data.get("benchmark_return", 0.0))

    if len(positions) < 1:
        print(json.dumps({"error": "Need at least 1 position"}))
        return

    # Validate and parse positions
    parsed = []
    for p in positions:
        if "symbol" not in p or "weight" not in p or "return" not in p:
            print(json.dumps({"error": "Each position needs symbol, weight, and return"}))
            return
        parsed.append({
            "symbol": str(p["symbol"]),
            "weight": float(p["weight"]),
            "return": float(p["return"]),
        })

    # Calculate contributions
    contributions = []
    total_return = 0.0
    total_weight = sum(p["weight"] for p in parsed)

    for p in parsed:
        contribution = p["weight"] * p["return"]
        total_return += contribution
        contributions.append({
            "symbol": p["symbol"],
            "weight": round(p["weight"], 6),
            "return": round(p["return"], 8),
            "contribution": round(contribution, 8),
        })

    active_return = total_return - benchmark_return

    # Sort by contribution
    sorted_contrib = sorted(contributions, key=lambda x: x["contribution"], reverse=True)
    top_n = min(5, len(sorted_contrib))

    top_contributors = sorted_contrib[:top_n]
    bottom_contributors = sorted_contrib[-top_n:][::-1]

    # Weight analysis
    weight_sum = round(total_weight, 6)
    concentration = max(p["weight"] for p in parsed) / total_weight if total_weight > 0 else 0

    print(json.dumps({
        "total_return": round(total_return, 8),
        "active_return": round(active_return, 8),
        "benchmark_return": round(benchmark_return, 8),
        "contributions": sorted_contrib,
        "top_contributors": top_contributors,
        "bottom_contributors": bottom_contributors,
        "total_weight": weight_sum,
        "concentration_ratio": round(concentration, 6),
        "num_positions": len(parsed),
    }))

if __name__ == "__main__":
    main()
