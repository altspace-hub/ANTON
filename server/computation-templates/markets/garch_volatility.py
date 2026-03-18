"""
GARCH(1,1) Volatility Model
Estimates GARCH parameters via Maximum Likelihood Estimation with Nelder-Mead simplex.
Outputs conditional volatility series and forecast.

Input JSON: {
  "returns": [float, ...],   // T periods of returns
  "p": int,                  // GARCH lag (default 1)
  "q": int                   // ARCH lag (default 1)
}

Output JSON: {
  "params": {"omega": float, "alpha": float, "beta": float},
  "conditional_volatility": [float, ...],
  "forecast_1d": float,
  "forecast_5d": float,
  "forecast_20d": float,
  "persistence": float,
  "unconditional_variance": float,
  "log_likelihood": float,
  "half_life": float
}
"""
import json, sys, math

def main():
    data = json.loads(sys.stdin.read())
    returns = [float(r) for r in data["returns"]]
    t = len(returns)

    if t < 20:
        print(json.dumps({"error": "Need at least 20 return observations"}))
        return

    # Sample variance as initial estimate
    mean_r = sum(returns) / t
    sample_var = sum((r - mean_r) ** 2 for r in returns) / (t - 1)

    def garch_log_likelihood(params):
        """Negative log-likelihood for GARCH(1,1)."""
        omega, alpha, beta = params
        if omega <= 0 or alpha < 0 or beta < 0 or (alpha + beta) >= 1:
            return 1e15

        sigma2 = [sample_var]  # Initial conditional variance
        ll = 0.0

        for i in range(1, t):
            s2 = omega + alpha * returns[i - 1] ** 2 + beta * sigma2[-1]
            if s2 <= 1e-15:
                return 1e15
            sigma2.append(s2)
            # Normal log-likelihood contribution
            ll += -0.5 * (math.log(2 * math.pi) + math.log(s2) + returns[i] ** 2 / s2)

        return -ll  # Negative because we minimize

    # Nelder-Mead simplex optimization
    def nelder_mead(f, x0, tol=1e-8, max_iter=2000):
        n = len(x0)
        alpha_nm, gamma, rho, sigma = 1.0, 2.0, 0.5, 0.5

        # Initial simplex
        simplex = [x0[:]]
        for i in range(n):
            point = x0[:]
            point[i] *= 1.2 if point[i] != 0 else 0.01
            simplex.append(point)

        f_vals = [f(p) for p in simplex]

        for _ in range(max_iter):
            # Sort
            order = sorted(range(n + 1), key=lambda i: f_vals[i])
            simplex = [simplex[i] for i in order]
            f_vals = [f_vals[i] for i in order]

            # Check convergence
            spread = max(f_vals) - min(f_vals)
            if spread < tol:
                break

            # Centroid (excluding worst)
            centroid = [sum(simplex[i][j] for i in range(n)) / n for j in range(n)]

            # Reflection
            worst = simplex[-1]
            reflected = [centroid[j] + alpha_nm * (centroid[j] - worst[j]) for j in range(n)]
            f_reflected = f(reflected)

            if f_vals[0] <= f_reflected < f_vals[-2]:
                simplex[-1] = reflected
                f_vals[-1] = f_reflected
            elif f_reflected < f_vals[0]:
                expanded = [centroid[j] + gamma * (reflected[j] - centroid[j]) for j in range(n)]
                f_expanded = f(expanded)
                if f_expanded < f_reflected:
                    simplex[-1] = expanded
                    f_vals[-1] = f_expanded
                else:
                    simplex[-1] = reflected
                    f_vals[-1] = f_reflected
            else:
                contracted = [centroid[j] + rho * (worst[j] - centroid[j]) for j in range(n)]
                f_contracted = f(contracted)
                if f_contracted < f_vals[-1]:
                    simplex[-1] = contracted
                    f_vals[-1] = f_contracted
                else:
                    # Shrink
                    best = simplex[0]
                    for i in range(1, n + 1):
                        simplex[i] = [best[j] + sigma * (simplex[i][j] - best[j]) for j in range(n)]
                        f_vals[i] = f(simplex[i])

        order = sorted(range(n + 1), key=lambda i: f_vals[i])
        return simplex[order[0]], f_vals[order[0]]

    # Initial guess: omega ~ 5% of var, alpha ~ 0.1, beta ~ 0.85
    x0 = [sample_var * 0.05, 0.1, 0.85]
    best_params, neg_ll = nelder_mead(garch_log_likelihood, x0)

    omega, alpha, beta = best_params
    # Clamp parameters
    omega = max(1e-10, omega)
    alpha = max(0, min(0.99, alpha))
    beta = max(0, min(0.97 - alpha, beta))  # Ensures alpha+beta < 0.97, safely below 1.0

    # Generate conditional volatility series
    sigma2_series = [sample_var]
    for i in range(1, t):
        s2 = omega + alpha * returns[i - 1] ** 2 + beta * sigma2_series[-1]
        sigma2_series.append(max(s2, 1e-15))

    cond_vol = [math.sqrt(s2) for s2 in sigma2_series]

    # Persistence
    persistence = alpha + beta

    # Unconditional variance
    uncond_var = omega / (1 - persistence) if persistence < 1 else sample_var

    # Forecasts (h-step ahead)
    last_sigma2 = sigma2_series[-1]
    last_eps2 = returns[-1] ** 2

    forecast_1 = omega + alpha * last_eps2 + beta * last_sigma2
    # Multi-step: sigma2(h) = unconditional + (alpha+beta)^(h-1) * (sigma2(1) - unconditional)
    forecasts = {}
    for h, label in [(1, "forecast_1d"), (5, "forecast_5d"), (20, "forecast_20d")]:
        if h == 1:
            fcast = forecast_1
        else:
            fcast = uncond_var + persistence ** (h - 1) * (forecast_1 - uncond_var)
        forecasts[label] = round(math.sqrt(max(fcast, 0)), 8)

    # Half-life of volatility shocks
    half_life = math.log(0.5) / math.log(persistence) if 0 < persistence < 1 else float('inf')

    result = {
        "params": {
            "omega": round(omega, 10),
            "alpha": round(alpha, 6),
            "beta": round(beta, 6),
        },
        "conditional_volatility": [round(v, 8) for v in cond_vol],
        **forecasts,
        "persistence": round(persistence, 6),
        "unconditional_variance": round(uncond_var, 10),
        "log_likelihood": round(-neg_ll, 4),
        "half_life": round(half_life, 2) if half_life != float('inf') else None,
    }
    print(json.dumps(result))

if __name__ == "__main__":
    main()
