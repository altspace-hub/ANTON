
import sys
import io

# Provide input data via stdin
sys.stdin = io.StringIO("{\"price\":100,\"earnings_per_share\":5,\"book_value_per_share\":30}")

"""
Fundamental Ratios Calculator
Input JSON: { "price": float, "earnings_per_share": float, "book_value_per_share": float,
              "revenue_per_share": float, "dividend_per_share": float, "free_cash_flow_per_share": float,
              "total_debt": float, "total_equity": float, "ebitda": float }
Output JSON: { "pe_ratio": float, "pb_ratio": float, "ps_ratio": float, "dividend_yield": float,
               "price_to_fcf": float, "debt_to_equity": float, "ev_to_ebitda": float }
"""
import json, sys

def safe_div(a, b):
    return round(a / b, 6) if b and b != 0 else None

def main():
    data = json.loads(sys.stdin.read())

    price = float(data.get("price", 0))
    eps = float(data.get("earnings_per_share", 0))
    bvps = float(data.get("book_value_per_share", 0))
    rps = float(data.get("revenue_per_share", 0))
    dps = float(data.get("dividend_per_share", 0))
    fcfps = float(data.get("free_cash_flow_per_share", 0))
    total_debt = float(data.get("total_debt", 0))
    total_equity = float(data.get("total_equity", 0))
    ebitda = float(data.get("ebitda", 0))
    market_cap = float(data.get("market_cap", 0))
    cash = float(data.get("cash", 0))

    pe = safe_div(price, eps)
    pb = safe_div(price, bvps)
    ps = safe_div(price, rps)
    div_yield = safe_div(dps, price)
    p_fcf = safe_div(price, fcfps)
    de = safe_div(total_debt, total_equity)

    ev = market_cap + total_debt - cash if market_cap > 0 else None
    ev_ebitda = safe_div(ev, ebitda) if ev else None

    # Valuation assessment
    signals = []
    if pe and pe < 15: signals.append("low_pe")
    if pe and pe > 30: signals.append("high_pe")
    if pb and pb < 1: signals.append("below_book")
    if div_yield and div_yield > 0.04: signals.append("high_dividend")
    if de and de > 2: signals.append("high_leverage")

    print(json.dumps({
        "pe_ratio": pe,
        "pb_ratio": pb,
        "ps_ratio": ps,
        "dividend_yield": round(div_yield * 100, 4) if div_yield else None,
        "price_to_fcf": p_fcf,
        "debt_to_equity": de,
        "enterprise_value": round(ev, 2) if ev else None,
        "ev_to_ebitda": ev_ebitda,
        "valuation_signals": signals,
    }))

if __name__ == "__main__":
    main()

