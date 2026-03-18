"""
Portfolio NAV Calculator
Computes Net Asset Value for a portfolio of holdings.
Input JSON: { "holdings": [{ "symbol": str, "shares": float, "price": float }], "cash": float }
Output JSON: { "nav": float, "holdings_value": float, "cash": float, "weights": { symbol: float } }
"""
import json
import sys

def main():
    data = json.loads(sys.stdin.read())
    holdings = data.get("holdings", [])
    cash = float(data.get("cash", 0))

    holdings_value = 0.0
    position_values = {}

    for h in holdings:
        symbol = h["symbol"]
        shares = float(h["shares"])
        price = float(h["price"])
        value = shares * price
        position_values[symbol] = value
        holdings_value += value

    nav = holdings_value + cash
    weights = {}
    if nav > 0:
        for symbol, value in position_values.items():
            weights[symbol] = round(value / nav, 6)

    result = {
        "nav": round(nav, 2),
        "holdings_value": round(holdings_value, 2),
        "cash": round(cash, 2),
        "num_positions": len(holdings),
        "weights": weights,
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
