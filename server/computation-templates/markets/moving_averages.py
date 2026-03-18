"""
Moving Averages Calculator
Computes SMA and EMA for given windows.
Input JSON: { "prices": [float], "windows": [int] (default [20, 50, 200]) }
Output JSON: { "sma": { "20": [float], ... }, "ema": { "20": [float], ... }, "crossovers": [...] }
"""
import json
import sys

def compute_sma(prices, window):
    sma = []
    for i in range(len(prices)):
        if i < window - 1:
            sma.append(None)
        else:
            avg = sum(prices[i - window + 1:i + 1]) / window
            sma.append(round(avg, 4))
    return sma

def compute_ema(prices, window):
    ema = []
    multiplier = 2.0 / (window + 1)
    for i, price in enumerate(prices):
        if i == 0:
            ema.append(round(price, 4))
        else:
            val = (price - ema[-1]) * multiplier + ema[-1]
            ema.append(round(val, 4))
    return ema

def find_crossovers(short_ma, long_ma):
    crossovers = []
    for i in range(1, min(len(short_ma), len(long_ma))):
        if short_ma[i] is None or long_ma[i] is None or short_ma[i-1] is None or long_ma[i-1] is None:
            continue
        prev_diff = short_ma[i-1] - long_ma[i-1]
        curr_diff = short_ma[i] - long_ma[i]
        if prev_diff <= 0 and curr_diff > 0:
            crossovers.append({"index": i, "type": "golden_cross"})
        elif prev_diff >= 0 and curr_diff < 0:
            crossovers.append({"index": i, "type": "death_cross"})
    return crossovers

def main():
    data = json.loads(sys.stdin.read())
    prices = [float(p) for p in data.get("prices", [])]
    windows = data.get("windows", [20, 50, 200])

    if len(prices) < 2:
        print(json.dumps({"error": "Need at least 2 prices"}))
        return

    sma_results = {}
    ema_results = {}

    for w in windows:
        w = int(w)
        sma_results[str(w)] = compute_sma(prices, w)
        ema_results[str(w)] = compute_ema(prices, w)

    # Find crossovers between shortest and longest windows
    crossovers = []
    if len(windows) >= 2:
        sorted_windows = sorted(windows)
        short_key = str(sorted_windows[0])
        long_key = str(sorted_windows[-1])
        crossovers = find_crossovers(sma_results[short_key], sma_results[long_key])

    # Current position relative to MAs
    current_price = prices[-1]
    position = {}
    for w in windows:
        sma_val = sma_results[str(w)][-1]
        if sma_val is not None:
            position[f"vs_sma_{w}"] = "above" if current_price > sma_val else "below"

    result = {
        "sma": sma_results,
        "ema": ema_results,
        "crossovers": crossovers,
        "current_price": current_price,
        "price_position": position,
        "num_prices": len(prices),
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
