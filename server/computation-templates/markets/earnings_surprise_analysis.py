"""
Earnings Surprise Analysis
Input JSON: { "earnings": [{ "quarter": str, "estimated": float, "actual": float }] }
Output JSON: { "beat_rate": float, "avg_surprise_pct": float, "surprise_trend": str, "consecutive_beats": int, "consecutive_misses": int, "magnitude_analysis": {} }
"""
import json, sys, math

def main():
    data = json.loads(sys.stdin.read())
    earnings = data.get("earnings", [])

    if len(earnings) < 1:
        print(json.dumps({"error": "Need at least 1 earnings record"}))
        return

    # Parse and validate
    parsed = []
    for e in earnings:
        if "estimated" not in e or "actual" not in e:
            print(json.dumps({"error": "Each record needs estimated and actual fields"}))
            return
        parsed.append({
            "quarter": str(e.get("quarter", "")),
            "estimated": float(e["estimated"]),
            "actual": float(e["actual"]),
        })

    # Calculate surprises
    surprises = []
    beats = 0
    misses = 0
    meets = 0

    for p in parsed:
        diff = p["actual"] - p["estimated"]
        if p["estimated"] != 0:
            surprise_pct = (diff / abs(p["estimated"])) * 100
        else:
            surprise_pct = 0.0 if diff == 0 else (100.0 if diff > 0 else -100.0)

        if diff > 0:
            beats += 1
            result = "beat"
        elif diff < 0:
            misses += 1
            result = "miss"
        else:
            meets += 1
            result = "meet"

        surprises.append({
            "quarter": p["quarter"],
            "surprise_pct": round(surprise_pct, 4),
            "result": result,
        })

    n = len(parsed)
    beat_rate = beats / n

    surprise_pcts = [s["surprise_pct"] for s in surprises]
    avg_surprise = sum(surprise_pcts) / n

    # Consecutive beats/misses from the most recent
    consecutive_beats = 0
    consecutive_misses = 0
    for s in reversed(surprises):
        if s["result"] == "beat":
            consecutive_beats += 1
        else:
            break
    if consecutive_beats == 0:
        for s in reversed(surprises):
            if s["result"] == "miss":
                consecutive_misses += 1
            else:
                break

    # Surprise trend (compare first half to second half)
    if n >= 4:
        mid = n // 2
        first_half_avg = sum(surprise_pcts[:mid]) / mid
        second_half_avg = sum(surprise_pcts[mid:]) / len(surprise_pcts[mid:])
        if second_half_avg > first_half_avg + 1:
            trend = "improving"
        elif second_half_avg < first_half_avg - 1:
            trend = "deteriorating"
        else:
            trend = "stable"
    else:
        trend = "insufficient_data"

    # Magnitude analysis
    pos_surprises = [s for s in surprise_pcts if s > 0]
    neg_surprises = [s for s in surprise_pcts if s < 0]

    magnitude = {
        "avg_positive_surprise": round(sum(pos_surprises) / len(pos_surprises), 4) if pos_surprises else 0.0,
        "avg_negative_surprise": round(sum(neg_surprises) / len(neg_surprises), 4) if neg_surprises else 0.0,
        "max_positive": round(max(surprise_pcts), 4) if surprise_pcts else 0.0,
        "max_negative": round(min(surprise_pcts), 4) if surprise_pcts else 0.0,
        "std_surprise": round(math.sqrt(sum((s - avg_surprise) ** 2 for s in surprise_pcts) / max(n - 1, 1)), 4),
    }

    print(json.dumps({
        "beat_rate": round(beat_rate, 4),
        "avg_surprise_pct": round(avg_surprise, 4),
        "surprise_trend": trend,
        "consecutive_beats": consecutive_beats,
        "consecutive_misses": consecutive_misses,
        "magnitude_analysis": magnitude,
        "details": surprises,
        "total_quarters": n,
        "beats": beats,
        "misses": misses,
        "meets": meets,
    }))

if __name__ == "__main__":
    main()
