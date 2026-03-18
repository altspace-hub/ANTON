"""
Extended Momentum Indicators (RSI, Bollinger Bands, Stochastic, Rate of Change)
Input JSON: { "prices": [float], "rsi_period": int (default 14), "bb_period": int (default 20), "bb_std": float (default 2), "roc_period": int (default 12) }
Output JSON: { "rsi": float, "rsi_signal": str, "bollinger": { "upper": float, "middle": float, "lower": float, "width": float, "pct_b": float }, "rate_of_change": float, "stochastic": { "k": float, "d": float } }
"""
import json, sys, math

def compute_ema(values, window):
    """Exponential moving average."""
    if not values:
        return []
    ema = [values[0]]
    mult = 2.0 / (window + 1)
    for i in range(1, len(values)):
        ema.append((values[i] - ema[-1]) * mult + ema[-1])
    return ema

def main():
    data = json.loads(sys.stdin.read())
    prices = [float(p) for p in data.get("prices", [])]
    rsi_period = int(data.get("rsi_period", 14))
    bb_period = int(data.get("bb_period", 20))
    bb_std = float(data.get("bb_std", 2.0))
    roc_period = int(data.get("roc_period", 12))

    min_needed = max(rsi_period + 1, bb_period, roc_period + 1, 14)
    if len(prices) < min_needed:
        print(json.dumps({"error": f"Need at least {min_needed} prices"}))
        return

    # --- RSI ---
    changes = [prices[i] - prices[i-1] for i in range(1, len(prices))]
    gains = [max(c, 0) for c in changes]
    losses = [max(-c, 0) for c in changes]

    # Wilder's smoothed RSI
    avg_gain = sum(gains[:rsi_period]) / rsi_period
    avg_loss = sum(losses[:rsi_period]) / rsi_period

    for i in range(rsi_period, len(gains)):
        avg_gain = (avg_gain * (rsi_period - 1) + gains[i]) / rsi_period
        avg_loss = (avg_loss * (rsi_period - 1) + losses[i]) / rsi_period

    rs = avg_gain / avg_loss if avg_loss > 0 else 100.0
    rsi = 100.0 - (100.0 / (1.0 + rs))
    rsi_signal = "overbought" if rsi > 70 else "oversold" if rsi < 30 else "neutral"

    # --- Bollinger Bands ---
    bb_window = prices[-bb_period:]
    bb_mean = sum(bb_window) / bb_period
    bb_dev = math.sqrt(sum((p - bb_mean) ** 2 for p in bb_window) / bb_period)

    bb_upper = bb_mean + bb_std * bb_dev
    bb_lower = bb_mean - bb_std * bb_dev
    bb_width = (bb_upper - bb_lower) / bb_mean if bb_mean > 0 else 0.0
    bb_pct_b = (prices[-1] - bb_lower) / (bb_upper - bb_lower) if (bb_upper - bb_lower) > 0 else 0.5

    bb_signal = "squeeze" if bb_width < 0.02 else "expansion" if bb_width > 0.1 else "normal"

    # --- Rate of Change ---
    roc_past = prices[-(roc_period + 1)]
    roc = ((prices[-1] - roc_past) / roc_past) * 100 if roc_past > 0 else 0.0

    # --- Stochastic Oscillator (14-period default) ---
    stoch_period = 14
    stoch_window = prices[-stoch_period:]
    stoch_high = max(stoch_window)
    stoch_low = min(stoch_window)

    if stoch_high - stoch_low > 0:
        k_value = ((prices[-1] - stoch_low) / (stoch_high - stoch_low)) * 100
    else:
        k_value = 50.0

    # %D: 3-period SMA of %K (approximate using recent windows)
    k_values = []
    for offset in range(min(3, len(prices) - stoch_period)):
        idx = len(prices) - 1 - offset
        window = prices[idx - stoch_period + 1: idx + 1]
        h = max(window)
        l = min(window)
        kv = ((prices[idx] - l) / (h - l)) * 100 if (h - l) > 0 else 50.0
        k_values.append(kv)

    d_value = sum(k_values) / len(k_values) if k_values else k_value

    stoch_signal = "overbought" if k_value > 80 else "oversold" if k_value < 20 else "neutral"

    print(json.dumps({
        "rsi": round(rsi, 4),
        "rsi_signal": rsi_signal,
        "bollinger": {
            "upper": round(bb_upper, 6),
            "middle": round(bb_mean, 6),
            "lower": round(bb_lower, 6),
            "width": round(bb_width, 6),
            "pct_b": round(bb_pct_b, 6),
            "signal": bb_signal,
        },
        "rate_of_change": round(roc, 6),
        "stochastic": {
            "k": round(k_value, 4),
            "d": round(d_value, 4),
            "signal": stoch_signal,
        },
        "current_price": round(prices[-1], 6),
        "num_prices": len(prices),
    }))

if __name__ == "__main__":
    main()
