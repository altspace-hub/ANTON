
import sys
import io

# Provide input data via stdin
sys.stdin = io.StringIO("{\"returns\":[],\"confidence_level\":0.95,\"horizon_days\":10,\"portfolio_value\":100000000}")

"""
Value at Risk (VaR) Calculator
Input JSON: { "returns": [float], "confidence_level": float (default 0.95), "method": "historical"|"parametric" }
Output JSON: { "var_historical": float, "var_parametric": float, "cvar": float, "max_loss_observed": float, "loss_probability": float }
"""
import json, sys, math

def normal_ppf(p):
    """Rational approximation of the inverse normal CDF (Abramowitz & Stegun)."""
    if p <= 0:
        return -4.0
    if p >= 1:
        return 4.0
    if p == 0.5:
        return 0.0
    if p > 0.5:
        return -normal_ppf(1.0 - p)
    t = math.sqrt(-2.0 * math.log(p))
    c0, c1, c2 = 2.515517, 0.802853, 0.010328
    d1, d2, d3 = 1.432788, 0.189269, 0.001308
    return -(t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t))

def normal_pdf(x):
    return math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi)

def main():
    data = json.loads(sys.stdin.read())
    returns = [float(r) for r in data.get("returns", [])]
    confidence = float(data.get("confidence_level", 0.95))
    method = data.get("method", "historical")

    if len(returns) < 5:
        print(json.dumps({"error": "Need at least 5 returns"}))
        return

    if not (0.5 < confidence < 1.0):
        print(json.dumps({"error": "Confidence level must be between 0.5 and 1.0"}))
        return

    sorted_returns = sorted(returns)
    n = len(sorted_returns)
    mean_r = sum(returns) / n
    std_r = math.sqrt(sum((r - mean_r) ** 2 for r in returns) / (n - 1))

    # Historical VaR: percentile of losses
    idx = int(math.floor((1 - confidence) * n))
    idx = max(0, min(idx, n - 1))
    var_historical = -sorted_returns[idx]

    # Parametric VaR (assumes normal distribution)
    z = -normal_ppf(1 - confidence)
    var_parametric = -(mean_r - z * std_r)

    # Conditional VaR (Expected Shortfall): average of losses beyond VaR
    cutoff = sorted_returns[idx]
    tail = [r for r in sorted_returns if r <= cutoff]
    cvar = -(sum(tail) / len(tail)) if tail else var_historical

    max_loss = -sorted_returns[0]
    loss_prob = sum(1 for r in returns if r < 0) / n

    print(json.dumps({
        "var_historical": round(var_historical, 8),
        "var_parametric": round(var_parametric, 8),
        "cvar": round(cvar, 8),
        "max_loss_observed": round(max_loss, 8),
        "loss_probability": round(loss_prob, 6),
        "confidence_level": confidence,
        "method": method,
        "num_observations": n,
        "mean_return": round(mean_r, 8),
        "std_return": round(std_r, 8),
    }))

if __name__ == "__main__":
    main()

