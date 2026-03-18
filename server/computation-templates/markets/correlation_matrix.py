"""
Correlation Matrix Calculator
Computes pairwise correlation between multiple price series.
Input JSON: { "series": { "AAPL": [float], "MSFT": [float], ... }, "method": "pearson"|"spearman" }
Output JSON: { "correlation_matrix": { "AAPL": { "MSFT": 0.85, ... } }, "strongest": [...], "weakest": [...] }
"""
import json
import sys
import math

def compute_returns(prices):
    returns = []
    for i in range(1, len(prices)):
        if prices[i - 1] > 0 and prices[i] > 0:
            returns.append(math.log(prices[i] / prices[i - 1]))
        else:
            returns.append(0.0)
    return returns

def pearson_correlation(x, y):
    n = min(len(x), len(y))
    if n < 2:
        return 0.0
    x, y = x[:n], y[:n]
    mean_x = sum(x) / n
    mean_y = sum(y) / n
    cov = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n)) / (n - 1)
    std_x = math.sqrt(sum((xi - mean_x) ** 2 for xi in x) / (n - 1))
    std_y = math.sqrt(sum((yi - mean_y) ** 2 for yi in y) / (n - 1))
    if std_x == 0 or std_y == 0:
        return 0.0
    return cov / (std_x * std_y)

def rank_data(data):
    indexed = sorted(enumerate(data), key=lambda t: t[1])
    ranks = [0.0] * len(data)
    for rank, (idx, _) in enumerate(indexed, 1):
        ranks[idx] = float(rank)
    return ranks

def spearman_correlation(x, y):
    n = min(len(x), len(y))
    if n < 2:
        return 0.0
    return pearson_correlation(rank_data(x[:n]), rank_data(y[:n]))

def main():
    data = json.loads(sys.stdin.read())
    series = data.get("series", {})
    method = data.get("method", "pearson")

    symbols = list(series.keys())
    if len(symbols) < 2:
        print(json.dumps({"error": "Need at least 2 series"}))
        return

    # Compute returns for each series
    returns = {}
    for sym in symbols:
        returns[sym] = compute_returns([float(p) for p in series[sym]])

    corr_fn = spearman_correlation if method == "spearman" else pearson_correlation

    # Compute correlation matrix
    matrix = {}
    pairs = []
    for i, sym_a in enumerate(symbols):
        matrix[sym_a] = {}
        for j, sym_b in enumerate(symbols):
            if i == j:
                matrix[sym_a][sym_b] = 1.0
            elif j < i:
                matrix[sym_a][sym_b] = matrix[sym_b][sym_a]
            else:
                corr = corr_fn(returns[sym_a], returns[sym_b])
                corr = round(corr, 6)
                matrix[sym_a][sym_b] = corr
                pairs.append({"pair": [sym_a, sym_b], "correlation": corr})

    # Sort pairs
    pairs.sort(key=lambda p: abs(p["correlation"]), reverse=True)
    strongest = pairs[:5] if len(pairs) >= 5 else pairs
    weakest = sorted(pairs, key=lambda p: abs(p["correlation"]))[:5]

    result = {
        "correlation_matrix": matrix,
        "method": method,
        "num_symbols": len(symbols),
        "strongest_correlations": strongest,
        "weakest_correlations": weakest,
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
