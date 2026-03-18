"""
Monte Carlo Simulation
Input JSON: { "returns": [float], "num_simulations": int (default 10000), "horizon": int (default 252) }
Output JSON: { "percentiles": { "5": float, "25": float, "50": float, "75": float, "95": float }, "expected_return": float, "probability_of_loss": float, "max_drawdown_median": float, "var_95": float }
"""
import json, sys, math, random

def main():
    data = json.loads(sys.stdin.read())
    returns = [float(r) for r in data.get("returns", [])]
    num_sims = int(data.get("num_simulations", 10000))
    horizon = int(data.get("horizon", 252))

    if len(returns) < 10:
        print(json.dumps({"error": "Need at least 10 historical returns"}))
        return

    if num_sims < 100:
        print(json.dumps({"error": "Need at least 100 simulations"}))
        return

    if num_sims > 50000:
        num_sims = 50000  # Cap for performance

    if horizon < 1:
        print(json.dumps({"error": "Horizon must be at least 1"}))
        return

    # Historical statistics
    mean_r = sum(returns) / len(returns)
    std_r = math.sqrt(sum((r - mean_r) ** 2 for r in returns) / (len(returns) - 1))

    # Box-Muller transform for normal random numbers
    def rand_normal():
        u1 = random.random()
        u2 = random.random()
        while u1 == 0:
            u1 = random.random()
        z = math.sqrt(-2.0 * math.log(u1)) * math.cos(2.0 * math.pi * u2)
        return mean_r + std_r * z

    # Run simulations
    random.seed(42)  # Reproducible
    final_values = []
    max_drawdowns = []

    for _ in range(num_sims):
        value = 1.0
        peak = 1.0
        max_dd = 0.0

        for _ in range(horizon):
            r = rand_normal()
            value *= (1 + r)
            if value > peak:
                peak = value
            dd = (peak - value) / peak if peak > 0 else 0
            if dd > max_dd:
                max_dd = dd

        final_values.append(value - 1.0)  # total return
        max_drawdowns.append(max_dd)

    # Sort for percentile calculation
    final_values.sort()
    max_drawdowns.sort()

    def percentile(sorted_arr, pct):
        k = (pct / 100.0) * (len(sorted_arr) - 1)
        f = int(math.floor(k))
        c = min(int(math.ceil(k)), len(sorted_arr) - 1)
        if f == c:
            return sorted_arr[f]
        return sorted_arr[f] * (c - k) + sorted_arr[c] * (k - f)

    expected = sum(final_values) / len(final_values)
    prob_loss = sum(1 for v in final_values if v < 0) / len(final_values)
    var_95 = -percentile(final_values, 5)
    median_dd = percentile(max_drawdowns, 50)

    print(json.dumps({
        "percentiles": {
            "5": round(percentile(final_values, 5), 6),
            "25": round(percentile(final_values, 25), 6),
            "50": round(percentile(final_values, 50), 6),
            "75": round(percentile(final_values, 75), 6),
            "95": round(percentile(final_values, 95), 6),
        },
        "expected_return": round(expected, 6),
        "probability_of_loss": round(prob_loss, 6),
        "max_drawdown_median": round(median_dd, 6),
        "var_95": round(var_95, 6),
        "mean_daily_return": round(mean_r, 8),
        "daily_volatility": round(std_r, 8),
        "num_simulations": num_sims,
        "horizon": horizon,
    }))

if __name__ == "__main__":
    main()
