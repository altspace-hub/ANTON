"""
Sentiment Score Aggregator
Input JSON: { "items": [{ "text": str, "source": str, "weight": float }] }
Output JSON: { "overall_score": float (-1 to 1), "bullish_count": int, "bearish_count": int, "neutral_count": int, "weighted_score": float }
"""
import json, sys

BULLISH_WORDS = {"rally", "surge", "gain", "bull", "upgrade", "beat", "growth", "rise", "strong", "outperform", "buy", "positive", "recovery", "breakout", "momentum", "upside"}
BEARISH_WORDS = {"crash", "drop", "fall", "bear", "downgrade", "miss", "decline", "weak", "underperform", "sell", "negative", "recession", "breakdown", "risk", "downside", "loss"}

def score_text(text):
    words = set(text.lower().split())
    bull = len(words & BULLISH_WORDS)
    bear = len(words & BEARISH_WORDS)
    total = bull + bear
    if total == 0:
        return 0.0
    return (bull - bear) / total

def main():
    data = json.loads(sys.stdin.read())
    items = data.get("items", [])

    if not items:
        print(json.dumps({"error": "No items provided"}))
        return

    scores = []
    weighted_sum = 0.0
    total_weight = 0.0
    bullish = 0
    bearish = 0
    neutral = 0

    for item in items:
        text = item.get("text", "")
        weight = float(item.get("weight", 1.0))
        s = score_text(text)
        scores.append(s)
        weighted_sum += s * weight
        total_weight += weight
        if s > 0.1:
            bullish += 1
        elif s < -0.1:
            bearish += 1
        else:
            neutral += 1

    overall = sum(scores) / len(scores) if scores else 0.0
    weighted = weighted_sum / total_weight if total_weight > 0 else 0.0

    label = "bullish" if overall > 0.1 else "bearish" if overall < -0.1 else "neutral"

    print(json.dumps({
        "overall_score": round(overall, 6),
        "weighted_score": round(weighted, 6),
        "sentiment_label": label,
        "bullish_count": bullish,
        "bearish_count": bearish,
        "neutral_count": neutral,
        "total_items": len(items),
    }))

if __name__ == "__main__":
    main()
