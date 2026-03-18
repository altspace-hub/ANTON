"""
Kelly Criterion — Optimal Position Sizing
Computes full/half Kelly, expected growth, and ruin probability.

Input JSON: {
  "win_probability": float,     // Probability of winning (0-1)
  "win_amount": float,          // Amount gained on win (ratio, e.g., 0.10 for 10%)
  "loss_amount": float,         // Amount lost on loss (ratio, e.g., 0.05 for 5%)
  "bankroll": float,            // Current bankroll/portfolio value
  "fraction_kelly": float       // Fraction of Kelly to use (default 0.5 for half-Kelly)
}

Output JSON: {
  "full_kelly": float,          // Full Kelly fraction
  "half_kelly": float,          // Half Kelly fraction
  "fractional_kelly": float,    // User-specified fraction Kelly
  "position_size": float,       // Dollar position at fractional Kelly
  "expected_growth": float,     // Expected log growth rate
  "expected_value": float,      // Expected value per bet
  "ruin_probability": float,    // Approximate probability of ruin
  "edge": float,                // Edge (EV as fraction of loss)
  "odds": float,                // Payout odds (win/loss ratio)
  "kelly_table": [{"fraction": float, "growth": float, "risk": float}]
}
"""
import json, sys, math

def main():
    data = json.loads(sys.stdin.read())
    p = float(data["win_probability"])
    w = float(data["win_amount"])
    l = float(data["loss_amount"])
    bankroll = float(data.get("bankroll", 100000))
    frac = float(data.get("fraction_kelly", 0.5))

    q = 1.0 - p  # Probability of losing

    if p <= 0 or p >= 1:
        print(json.dumps({"error": "win_probability must be between 0 and 1"}))
        return
    if w <= 0 or l <= 0:
        print(json.dumps({"error": "win_amount and loss_amount must be positive"}))
        return

    # Odds ratio (b in Kelly formula: f* = (bp - q) / b)
    b = w / l  # Payout odds
    edge = p * w - q * l  # Expected value per unit bet

    # Full Kelly: f* = (bp - q) / b = p - q/b = p/1 - (1-p)/b
    full_kelly = (b * p - q) / b if b > 0 else 0

    # Clamp to [0, 1]
    full_kelly = max(0, min(1, full_kelly))

    half_kelly = full_kelly * 0.5
    fractional_kelly = full_kelly * frac
    position_size = bankroll * fractional_kelly

    # Expected log growth rate at given fraction
    def log_growth(f):
        if f <= 0:
            return 0
        t1 = p * math.log(1 + f * w) if (1 + f * w) > 0 else -1e9
        t2 = q * math.log(1 - f * l) if (1 - f * l) > 0 else -1e9
        return t1 + t2

    growth_at_frac = log_growth(fractional_kelly)

    # Ruin probability approximation (exponential formula for continuous betting)
    # P(ruin) ~ exp(-2 * edge * bankroll / (win_amount * fractional_kelly * bankroll))
    if edge > 0 and fractional_kelly > 0:
        ruin_prob = math.exp(-2 * edge * bankroll / (w * fractional_kelly * bankroll)) if (w * fractional_kelly * bankroll) > 0 else 0
        ruin_prob = min(1.0, max(0.0, ruin_prob))
    elif edge <= 0:
        ruin_prob = 1.0  # No edge means eventual ruin
    else:
        ruin_prob = 0.0

    # Kelly table: growth and risk at different fractions
    kelly_table = []
    for pct in range(0, 205, 5):
        f = full_kelly * pct / 100
        if f > 0.99:
            break
        g = log_growth(f)
        # Risk metric: probability of 50% drawdown approximation
        risk = 1 - math.exp(-0.5 / max(g, 1e-10)) if g > 0 else 1.0
        kelly_table.append({
            "fraction": round(pct / 100, 2),
            "kelly_bet": round(f, 6),
            "growth": round(g, 8),
            "risk": round(min(1.0, max(0.0, risk)), 4),
        })

    result = {
        "full_kelly": round(full_kelly, 6),
        "half_kelly": round(half_kelly, 6),
        "fractional_kelly": round(fractional_kelly, 6),
        "position_size": round(position_size, 2),
        "expected_growth": round(growth_at_frac, 8),
        "expected_value": round(edge, 6),
        "ruin_probability": round(ruin_prob, 6),
        "edge": round(edge, 6),
        "odds": round(b, 4),
        "kelly_table": kelly_table,
    }
    print(json.dumps(result))

if __name__ == "__main__":
    main()
