"""
Portfolio Stress Testing
Evaluates portfolio P&L under multiple shock scenarios.
Computes per-scenario impact, worst case, diversification benefit, and tail risk.

Input JSON: {
  "holdings": [{
    "symbol": "str",
    "weight": float,          // Portfolio weight (0-1)
    "beta": float,            // Market beta
    "duration": float,        // Interest rate sensitivity (optional, default 0)
    "sector": "str"           // Sector label (optional)
  }],
  "portfolio_value": float,   // Total portfolio value
  "scenarios": [{
    "name": "str",
    "market_shock": float,    // Market return shock (e.g., -0.20 for -20%)
    "rate_shock": float,      // Interest rate shock in bps (e.g., 200 for +200bps)
    "vol_shock": float,       // Volatility multiplier (e.g., 2.0 for 2x vol)
    "sector_shocks": {}       // Optional per-sector overrides {"Tech": -0.30}
  }]
}

Output JSON: {
  "scenario_results": [{
    "name": "str",
    "portfolio_pnl": float,
    "portfolio_return": float,
    "position_impacts": [{symbol, pnl, return}],
    "worst_position": {symbol, pnl}
  }],
  "worst_case": {"scenario": "str", "pnl": float, "return": float},
  "best_case": {"scenario": "str", "pnl": float, "return": float},
  "diversification_benefit": float,
  "tail_risk_metrics": {
    "average_scenario_loss": float,
    "max_loss": float,
    "scenarios_with_loss": int
  }
}
"""
import json, sys, math

DEFAULT_SCENARIOS = [
    {"name": "2008 Financial Crisis", "market_shock": -0.40, "rate_shock": 300, "vol_shock": 3.0, "sector_shocks": {}},
    {"name": "COVID March 2020", "market_shock": -0.35, "rate_shock": -150, "vol_shock": 4.0, "sector_shocks": {}},
    {"name": "2022 Rate Shock", "market_shock": -0.20, "rate_shock": 400, "vol_shock": 1.8, "sector_shocks": {}},
    {"name": "Emerging Market Crisis", "market_shock": -0.25, "rate_shock": 200, "vol_shock": 2.5, "sector_shocks": {}},
    {"name": "Flash Crash", "market_shock": -0.10, "rate_shock": 0, "vol_shock": 5.0, "sector_shocks": {}},
]

def main():
    data = json.loads(sys.stdin.read())
    holdings = data["holdings"]
    portfolio_value = float(data.get("portfolio_value", 100000000))
    scenarios = data.get("scenarios", [])

    if not holdings:
        print(json.dumps({"error": "No holdings provided"}))
        return
    if not scenarios:
        scenarios = DEFAULT_SCENARIOS

    scenario_results = []

    for scenario in scenarios:
        name = scenario["name"]
        market_shock = float(scenario.get("market_shock", 0))
        rate_shock = float(scenario.get("rate_shock", 0))  # basis points
        vol_shock = float(scenario.get("vol_shock", 1.0))
        sector_shocks = scenario.get("sector_shocks", {})

        position_impacts = []
        total_pnl = 0.0

        for h in holdings:
            symbol = h["symbol"]
            weight = float(h["weight"])
            beta = float(h.get("beta", 1.0))
            duration = float(h.get("duration", 0))
            sector = h.get("sector", "")

            position_value = portfolio_value * weight

            # Market impact via beta
            market_impact = beta * market_shock

            # Sector-specific override
            if sector and sector in sector_shocks:
                market_impact = float(sector_shocks[sector])

            # Interest rate impact via duration
            rate_impact = -duration * (rate_shock / 10000)  # Convert bps to decimal

            # Volatility impact (higher vol increases expected loss in stress)
            vol_adjustment = 1.0
            if vol_shock > 1.0 and market_shock < 0:
                vol_adjustment = 1 + (vol_shock - 1) * 0.2  # Vol amplifies losses

            # Total position return
            pos_return = (market_impact + rate_impact) * vol_adjustment
            pos_pnl = position_value * pos_return

            position_impacts.append({
                "symbol": symbol,
                "pnl": round(pos_pnl, 2),
                "return": round(pos_return, 6),
            })
            total_pnl += pos_pnl

        portfolio_return = total_pnl / portfolio_value if portfolio_value > 0 else 0

        # Find worst position
        worst_pos = min(position_impacts, key=lambda p: p["pnl"])

        scenario_results.append({
            "name": name,
            "portfolio_pnl": round(total_pnl, 2),
            "portfolio_return": round(portfolio_return, 6),
            "position_impacts": position_impacts,
            "worst_position": {"symbol": worst_pos["symbol"], "pnl": worst_pos["pnl"]},
        })

    # Aggregate metrics
    worst_case = min(scenario_results, key=lambda s: s["portfolio_pnl"])
    best_case = max(scenario_results, key=lambda s: s["portfolio_pnl"])

    losses = [s["portfolio_pnl"] for s in scenario_results if s["portfolio_pnl"] < 0]
    avg_loss = sum(losses) / len(losses) if losses else 0

    # Diversification benefit: compare portfolio loss to sum of individual worst losses
    # If portfolio loses less than the sum of each position's worst, that's diversification
    sum_of_worst_positions = sum(
        min(p["pnl"] for p in s["position_impacts"]) * len(holdings)
        for s in scenario_results
    ) / len(scenario_results) if scenario_results else 0

    avg_portfolio_loss = sum(s["portfolio_pnl"] for s in scenario_results) / len(scenario_results)
    div_benefit = 1 - (avg_portfolio_loss / sum_of_worst_positions) if sum_of_worst_positions < 0 else 0

    result = {
        "scenario_results": scenario_results,
        "worst_case": {
            "scenario": worst_case["name"],
            "pnl": worst_case["portfolio_pnl"],
            "return": worst_case["portfolio_return"],
        },
        "best_case": {
            "scenario": best_case["name"],
            "pnl": best_case["portfolio_pnl"],
            "return": best_case["portfolio_return"],
        },
        "diversification_benefit": round(max(0, div_benefit), 4),
        "tail_risk_metrics": {
            "average_scenario_loss": round(avg_loss, 2),
            "max_loss": round(min(s["portfolio_pnl"] for s in scenario_results), 2),
            "scenarios_with_loss": len(losses),
        },
    }
    print(json.dumps(result))

if __name__ == "__main__":
    main()
