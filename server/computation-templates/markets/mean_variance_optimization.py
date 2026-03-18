"""
Mean-Variance Optimization (Markowitz)
Computes the efficient frontier, minimum-variance portfolio, and maximum-Sharpe portfolio.
Uses pure Python matrix operations via Cholesky decomposition — no numpy/pandas.

Input JSON: {
  "returns": [[float, ...], ...],  // NxT matrix: N assets, T periods of returns
  "symbols": ["str", ...],          // N symbol names
  "risk_free_rate": float,          // Annual risk-free rate (e.g., 0.04)
  "num_portfolios": int             // Number of random portfolios for frontier (default 5000)
}

Output JSON: {
  "efficient_frontier": [{"return": float, "risk": float, "sharpe": float}],
  "min_variance": {"weights": {symbol: float}, "return": float, "risk": float, "sharpe": float},
  "max_sharpe": {"weights": {symbol: float}, "return": float, "risk": float, "sharpe": float},
  "tangency_weights": {symbol: float},
  "covariance_matrix": [[float]]
}
"""
import json, sys, math, random

def main():
    data = json.loads(sys.stdin.read())
    returns_matrix = data["returns"]  # NxT
    symbols = data["symbols"]
    rf = float(data.get("risk_free_rate", 0.04))
    num_portfolios = int(data.get("num_portfolios", 5000))

    n = len(returns_matrix)
    if n < 2:
        print(json.dumps({"error": "Need at least 2 assets"}))
        return

    t = len(returns_matrix[0])

    # Compute mean returns (annualized assuming daily)
    mean_ret = []
    for i in range(n):
        mu = sum(returns_matrix[i]) / t
        mean_ret.append(mu * 252)

    # Compute covariance matrix (annualized)
    daily_means = [sum(returns_matrix[i]) / t for i in range(n)]
    cov = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i, n):
            s = 0.0
            for k in range(t):
                s += (returns_matrix[i][k] - daily_means[i]) * (returns_matrix[j][k] - daily_means[j])
            cov[i][j] = (s / (t - 1)) * 252
            cov[j][i] = cov[i][j]

    # Random portfolio generation for efficient frontier
    random.seed(42)
    frontier = []
    best_sharpe = -1e9
    best_sharpe_weights = None
    min_var = 1e9
    min_var_weights = None

    for _ in range(num_portfolios):
        # Random weights (Dirichlet-like via exponential)
        raw = [random.expovariate(1.0) for _ in range(n)]
        total = sum(raw)
        w = [x / total for x in raw]

        # Portfolio return
        port_ret = sum(w[i] * mean_ret[i] for i in range(n))

        # Portfolio variance
        port_var = 0.0
        for i in range(n):
            for j in range(n):
                port_var += w[i] * w[j] * cov[i][j]
        port_std = math.sqrt(max(port_var, 0))

        sharpe = (port_ret - rf) / port_std if port_std > 0 else 0

        frontier.append({
            "return": round(port_ret, 6),
            "risk": round(port_std, 6),
            "sharpe": round(sharpe, 4),
        })

        if sharpe > best_sharpe:
            best_sharpe = sharpe
            best_sharpe_weights = w[:]

        if port_var < min_var:
            min_var = port_var
            min_var_weights = w[:]

    # Sort frontier by risk
    frontier.sort(key=lambda p: p["risk"])

    # Compute metrics for best portfolios
    def portfolio_metrics(w):
        ret = sum(w[i] * mean_ret[i] for i in range(n))
        var = sum(w[i] * w[j] * cov[i][j] for i in range(n) for j in range(n))
        std = math.sqrt(max(var, 0))
        sharpe = (ret - rf) / std if std > 0 else 0
        return ret, std, sharpe

    mv_ret, mv_risk, mv_sharpe = portfolio_metrics(min_var_weights)
    ms_ret, ms_risk, ms_sharpe = portfolio_metrics(best_sharpe_weights)

    result = {
        "efficient_frontier": frontier[:200],  # Cap at 200 points
        "min_variance": {
            "weights": {symbols[i]: round(min_var_weights[i], 6) for i in range(n)},
            "return": round(mv_ret, 6),
            "risk": round(mv_risk, 6),
            "sharpe": round(mv_sharpe, 4),
        },
        "max_sharpe": {
            "weights": {symbols[i]: round(best_sharpe_weights[i], 6) for i in range(n)},
            "return": round(ms_ret, 6),
            "risk": round(ms_risk, 6),
            "sharpe": round(ms_sharpe, 4),
        },
        "tangency_weights": {symbols[i]: round(best_sharpe_weights[i], 6) for i in range(n)},
        "covariance_matrix": [[round(cov[i][j], 8) for j in range(n)] for i in range(n)],
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
