"""
Price Momentum Indicator
Input JSON: { "prices": [float], "short_window": int (default 12), "long_window": int (default 26), "signal_window": int (default 9) }
Output JSON: { "momentum": [float], "rsi": float, "macd": { "macd": [float], "signal": [float], "histogram": [float] } }
"""
import json, sys

def compute_ema(values, window):
    ema = [values[0]]
    mult = 2.0 / (window + 1)
    for i in range(1, len(values)):
        ema.append((values[i] - ema[-1]) * mult + ema[-1])
    return ema

def main():
    data = json.loads(sys.stdin.read())
    prices = [float(p) for p in data.get("prices", [])]
    short_w = int(data.get("short_window", 12))
    long_w = int(data.get("long_window", 26))
    signal_w = int(data.get("signal_window", 9))

    if len(prices) < long_w + signal_w:
        print(json.dumps({"error": f"Need at least {long_w + signal_w} prices"}))
        return

    # Price momentum (rate of change)
    momentum = []
    for i in range(short_w, len(prices)):
        if prices[i - short_w] > 0:
            momentum.append(round((prices[i] - prices[i - short_w]) / prices[i - short_w], 8))
        else:
            momentum.append(0.0)

    # RSI (14-period)
    rsi_period = 14
    changes = [prices[i] - prices[i-1] for i in range(1, len(prices))]
    gains = [max(c, 0) for c in changes[-rsi_period:]]
    losses = [max(-c, 0) for c in changes[-rsi_period:]]
    avg_gain = sum(gains) / rsi_period
    avg_loss = sum(losses) / rsi_period
    rs = avg_gain / avg_loss if avg_loss > 0 else 100
    rsi = 100 - (100 / (1 + rs))

    # MACD
    ema_short = compute_ema(prices, short_w)
    ema_long = compute_ema(prices, long_w)
    macd_line = [round(ema_short[i] - ema_long[i], 6) for i in range(len(prices))]
    signal_line = compute_ema(macd_line, signal_w)
    histogram = [round(macd_line[i] - signal_line[i], 6) for i in range(len(macd_line))]

    # Current signals
    current_macd = macd_line[-1]
    current_signal = signal_line[-1]
    macd_trend = "bullish" if current_macd > current_signal else "bearish"

    print(json.dumps({
        "momentum": momentum[-20:],
        "current_momentum": momentum[-1] if momentum else 0,
        "rsi": round(rsi, 4),
        "rsi_signal": "overbought" if rsi > 70 else "oversold" if rsi < 30 else "neutral",
        "macd": {
            "macd_line": macd_line[-20:],
            "signal_line": [round(s, 6) for s in signal_line[-20:]],
            "histogram": histogram[-20:],
        },
        "macd_trend": macd_trend,
        "num_prices": len(prices),
    }))

if __name__ == "__main__":
    main()
